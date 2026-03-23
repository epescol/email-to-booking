import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // Get user's hotel_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("hotel_id")
      .eq("user_id", userId)
      .single();

    if (!profile?.hotel_id) {
      return new Response(JSON.stringify({ error: "Nessun hotel associato" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get email settings
    const { data: settings } = await supabase
      .from("hotel_email_settings")
      .select("*")
      .eq("hotel_id", profile.hotel_id)
      .single();

    if (!settings?.imap_host || !settings?.imap_user || !settings?.imap_password) {
      return new Response(
        JSON.stringify({ error: "Configura le credenziali IMAP nelle Impostazioni prima di scaricare le email." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Connect to IMAP using Deno TCP
    const emails = await fetchImapEmails(settings);

    if (!emails.length) {
      return new Response(
        JSON.stringify({ message: "Nessuna nuova email trovata.", imported: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse each email with AI and insert
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let imported = 0;
    for (const email of emails) {
      // Check if already imported
      const { data: existing } = await supabase
        .from("booking_messages")
        .select("id")
        .eq("email_message_id", email.messageId)
        .maybeSingle();

      if (existing) continue;

      // Parse with AI
      const parsed = await parseBookingWithAI(email, LOVABLE_API_KEY);

      if (!parsed) continue;

      // Check if there's an existing request with this X-Hotel-Request-ID
      let requestId: string | null = null;
      if (email.xHotelRequestId) {
        const { data: existingReq } = await supabase
          .from("booking_messages")
          .select("request_id")
          .eq("x_hotel_request_id", email.xHotelRequestId)
          .limit(1)
          .maybeSingle();
        if (existingReq) requestId = existingReq.request_id;
      }

      // If no existing request, create one
      if (!requestId) {
        const { data: newReq, error: reqError } = await supabase
          .from("booking_requests")
          .insert({
            hotel_id: profile.hotel_id,
            first_name: parsed.first_name || null,
            last_name: parsed.last_name || null,
            email: parsed.email || null,
            phone: parsed.phone || null,
            check_in: parsed.check_in || null,
            check_out: parsed.check_out || null,
            notes: parsed.notes || null,
            language: parsed.language || null,
            alternative_dates: parsed.alternative_dates || null,
            gender: parsed.gender || null,
            address: parsed.address || null,
            city: parsed.city || null,
            country: parsed.country || null,
            zip_code: parsed.zip_code || null,
            source_email_id: email.messageId,
            status: "nuova",
          })
          .select("id")
          .single();

        if (reqError) {
          console.error("Error creating booking request:", reqError);
          continue;
        }
        requestId = newReq.id;
      }

      // Insert the message
      await supabase.from("booking_messages").insert({
        request_id: requestId,
        direction: "inbound",
        subject: email.subject,
        body: email.body,
        email_message_id: email.messageId,
        x_hotel_request_id: email.xHotelRequestId || null,
        sent_at: email.date || new Date().toISOString(),
      });

      imported++;
    }

    return new Response(
      JSON.stringify({ message: `Importate ${imported} nuove email.`, imported }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-emails error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ---- IMAP fetch using raw TLS connection ----

interface EmailMessage {
  messageId: string;
  subject: string;
  body: string;
  from: string;
  date: string;
  xHotelRequestId: string | null;
}

async function fetchImapEmails(settings: any): Promise<EmailMessage[]> {
  const port = settings.imap_port || 993;
  const hostname = settings.imap_host;
  const username = settings.imap_user;
  const password = settings.imap_password;
  const useSsl = settings.imap_use_ssl !== false;
  const filterSender = settings.filter_sender_email || null;

  let conn: Deno.TlsConn | Deno.TcpConn;

  if (useSsl) {
    conn = await Deno.connectTls({ hostname, port });
  } else {
    conn = await Deno.connect({ hostname, port });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function readResponse(): Promise<string> {
    const buf = new Uint8Array(65536);
    let result = "";
    // Read until we get a complete response
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n));
      // Check if response is complete (tagged response or continuation)
      if (/^[A-Z]\d+ (OK|NO|BAD)/m.test(result) || result.startsWith("* OK") || result.includes("\r\n")) {
        // Give a tiny delay to collect any remaining data
        await new Promise((r) => setTimeout(r, 50));
        const n2 = await Promise.race([
          conn.read(buf),
          new Promise<null>((r) => setTimeout(() => r(null), 100)),
        ]);
        if (n2 && typeof n2 === "number") {
          result += decoder.decode(buf.subarray(0, n2));
        }
        break;
      }
    }
    return result;
  }

  async function sendCommand(tag: string, command: string): Promise<string> {
    const cmd = `${tag} ${command}\r\n`;
    await conn.write(encoder.encode(cmd));
    let response = "";
    const buf = new Uint8Array(65536);
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      response += decoder.decode(buf.subarray(0, n));
      if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) {
        break;
      }
    }
    return response;
  }

  try {
    // Read greeting
    await readResponse();

    // Login
    const loginResp = await sendCommand("A1", `LOGIN ${username} "${password.replace(/"/g, '\\"')}"`);
    if (loginResp.includes("A1 NO") || loginResp.includes("A1 BAD")) {
      throw new Error("Autenticazione IMAP fallita. Controlla le credenziali.");
    }

    // Select INBOX
    await sendCommand("A2", "SELECT INBOX");

    // Search for unseen emails, optionally filtering by sender
    let searchCmd = "SEARCH UNSEEN";
    if (filterSender) {
      searchCmd = `SEARCH UNSEEN FROM "${filterSender}"`;
    }
    const searchResp = await sendCommand("A3", searchCmd);

    // Parse message numbers from search response
    const searchMatch = searchResp.match(/\* SEARCH ([\d\s]+)/);
    if (!searchMatch) {
      await sendCommand("A9", "LOGOUT");
      conn.close();
      return [];
    }

    const msgNums = searchMatch[1].trim().split(/\s+/).slice(0, 20); // Limit to 20 emails per fetch
    const emails: EmailMessage[] = [];

    for (let i = 0; i < msgNums.length; i++) {
      const num = msgNums[i];
      const tag = `B${i}`;
      const fetchResp = await sendCommand(tag, `FETCH ${num} (BODY[HEADER] BODY[TEXT])`);

      // Parse headers
      const headerMatch = fetchResp.match(/BODY\[HEADER\] \{(\d+)\}\r\n([\s\S]*?)(?=BODY\[TEXT\])/);
      const textMatch = fetchResp.match(/BODY\[TEXT\] \{(\d+)\}\r\n([\s\S]*?)(?=\)\r\n[A-Z]|\)$)/);

      const headers = headerMatch ? headerMatch[2] : "";
      const body = textMatch ? textMatch[2] : "";

      const subject = extractHeader(headers, "Subject") || "(Nessun oggetto)";
      const from = extractHeader(headers, "From") || "";
      const messageId = extractHeader(headers, "Message-ID") || `gen-${Date.now()}-${i}`;
      const date = extractHeader(headers, "Date") || "";
      const xHotelRequestId = extractHeader(headers, "X-Hotel-Request-ID");

      // Decode body (basic - handles plain text)
      const cleanBody = decodeBody(body, headers);

      emails.push({
        messageId: messageId.replace(/[<>]/g, ""),
        subject: decodeEncodedWords(subject),
        body: cleanBody,
        from,
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        xHotelRequestId,
      });
    }

    // Logout
    await sendCommand("A9", "LOGOUT");
    conn.close();

    return emails;
  } catch (e) {
    try {
      conn.close();
    } catch {}
    throw e;
  }
}

function extractHeader(headers: string, name: string): string | null {
  const regex = new RegExp(`^${name}:\\s*(.+?)(?:\\r?\\n(?!\\s)|$)`, "im");
  const match = headers.match(regex);
  return match ? match[1].trim() : null;
}

function decodeEncodedWords(str: string): string {
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    if (encoding.toUpperCase() === "B") {
      return atob(text);
    }
    return text.replace(/=([0-9A-Fa-f]{2})/g, (__, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    ).replace(/_/g, " ");
  });
}

function decodeBody(body: string, headers: string): string {
  const transferEncoding = extractHeader(headers, "Content-Transfer-Encoding") || "";

  if (transferEncoding.toLowerCase() === "base64") {
    try {
      return atob(body.replace(/\s/g, ""));
    } catch {
      return body;
    }
  }

  if (transferEncoding.toLowerCase() === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
  }

  return body.trim();
}

// ---- AI Parsing ----

interface ParsedBooking {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  check_in?: string;
  check_out?: string;
  notes?: string;
  language?: string;
  alternative_dates?: string;
  gender?: string;
  address?: string;
  city?: string;
  country?: string;
  zip_code?: string;
}

async function parseBookingWithAI(
  email: EmailMessage,
  apiKey: string
): Promise<ParsedBooking | null> {
  const prompt = `Analizza questa email di richiesta prenotazione hotel ed estrai i dati strutturati.

SOGGETTO: ${email.subject}
DA: ${email.from}
CORPO:
${email.body.substring(0, 4000)}

Estrai i seguenti campi se presenti. Per le date usa il formato YYYY-MM-DD.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Sei un assistente che estrae dati di prenotazione hotel dalle email. Rispondi SOLO con la funzione tool_call richiesta.",
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_booking",
            description: "Estrai i dati di prenotazione dall'email",
            parameters: {
              type: "object",
              properties: {
                first_name: { type: "string", description: "Nome dell'ospite" },
                last_name: { type: "string", description: "Cognome dell'ospite" },
                email: { type: "string", description: "Email dell'ospite" },
                phone: { type: "string", description: "Telefono dell'ospite" },
                check_in: { type: "string", description: "Data check-in in formato YYYY-MM-DD" },
                check_out: { type: "string", description: "Data check-out in formato YYYY-MM-DD" },
                notes: { type: "string", description: "Note o richieste speciali" },
                language: { type: "string", description: "Lingua dell'ospite (it, de, en, ecc.)" },
                alternative_dates: { type: "string", description: "Date alternative richieste" },
                gender: { type: "string", description: "Genere (M/F)" },
                address: { type: "string", description: "Indirizzo" },
                city: { type: "string", description: "Città" },
                country: { type: "string", description: "Paese" },
                zip_code: { type: "string", description: "CAP" },
              },
              required: [],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_booking" } },
    }),
  });

  if (!response.ok) {
    console.error("AI parsing error:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;

  try {
    return JSON.parse(toolCall.function.arguments) as ParsedBooking;
  } catch {
    console.error("Failed to parse AI response");
    return null;
  }
}
