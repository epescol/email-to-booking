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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { booking_id, subject, body } = await req.json();

    if (!booking_id || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Campi obbligatori: booking_id, subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get profile
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

    // Get booking
    const { data: booking } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("id", booking_id)
      .eq("hotel_id", profile.hotel_id)
      .single();

    if (!booking) {
      return new Response(JSON.stringify({ error: "Prenotazione non trovata" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!booking.email) {
      return new Response(JSON.stringify({ error: "L'ospite non ha un indirizzo email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get SMTP settings
    const { data: settings } = await supabase
      .from("hotel_email_settings")
      .select("*")
      .eq("hotel_id", profile.hotel_id)
      .single();

    if (!settings?.smtp_host || !settings?.smtp_user || !settings?.smtp_password) {
      return new Response(
        JSON.stringify({ error: "Configura le credenziali SMTP nelle Impostazioni." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate X-Hotel-Request-ID for tracking replies
    const xHotelRequestId = `${booking_id}`;

    // Send email via SMTP using raw TCP
    await sendSmtpEmail({
      host: settings.smtp_host,
      port: settings.smtp_port || 587,
      username: settings.smtp_user,
      password: settings.smtp_password,
      useSsl: settings.smtp_use_ssl !== false,
      from: settings.smtp_user,
      to: booking.email,
      subject,
      body,
      xHotelRequestId,
    });

    // Save message to booking_messages
    await supabase.from("booking_messages").insert({
      request_id: booking_id,
      direction: "outbound",
      subject,
      body,
      x_hotel_request_id: xHotelRequestId,
      sent_at: new Date().toISOString(),
    });

    // Update booking status to offerta_inviata if it's still nuova
    if (booking.status === "nuova") {
      await supabase
        .from("booking_requests")
        .update({ status: "offerta_inviata" })
        .eq("id", booking_id);
    }

    return new Response(
      JSON.stringify({ message: "Offerta inviata con successo" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-offer error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ---- SMTP send via raw TCP/TLS ----

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  useSsl: boolean;
  from: string;
  to: string;
  subject: string;
  body: string;
  xHotelRequestId: string;
}

async function sendSmtpEmail(config: SmtpConfig): Promise<void> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let conn: Deno.TlsConn | Deno.TcpConn;

  // Port 465 = implicit TLS, port 587 = STARTTLS
  if (config.port === 465 || config.useSsl) {
    conn = await Deno.connectTls({ hostname: config.host, port: config.port });
  } else {
    conn = await Deno.connect({ hostname: config.host, port: config.port });
  }

  async function readResp(): Promise<string> {
    const buf = new Uint8Array(4096);
    let result = "";
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n));
      // SMTP responses end with \r\n and have a space after code (e.g., "250 OK\r\n")
      if (/^\d{3} /m.test(result) || /^\d{3}-/m.test(result)) {
        // Wait a bit for multiline responses
        if (/^\d{3} /m.test(result.split("\r\n").filter(Boolean).pop() || "")) {
          break;
        }
      }
    }
    return result;
  }

  async function sendCmd(cmd: string): Promise<string> {
    await conn.write(encoder.encode(cmd + "\r\n"));
    return await readResp();
  }

  try {
    // Read greeting
    await readResp();

    // EHLO
    const ehloResp = await sendCmd(`EHLO localhost`);

    // STARTTLS if port 587 and not already TLS
    if (config.port === 587 && !config.useSsl && ehloResp.includes("STARTTLS")) {
      await sendCmd("STARTTLS");
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: config.host });
      await sendCmd("EHLO localhost");
    }

    // AUTH LOGIN
    await sendCmd("AUTH LOGIN");
    await sendCmd(btoa(config.username));
    const authResp = await sendCmd(btoa(config.password));
    if (!authResp.includes("235")) {
      throw new Error("Autenticazione SMTP fallita");
    }

    // MAIL FROM
    await sendCmd(`MAIL FROM:<${config.from}>`);

    // RCPT TO
    await sendCmd(`RCPT TO:<${config.to}>`);

    // DATA
    await sendCmd("DATA");

    // Build email with headers
    const now = new Date().toUTCString();
    const messageId = `<${crypto.randomUUID()}@${config.host}>`;

    const emailData = [
      `From: ${config.from}`,
      `To: ${config.to}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(config.subject)))}?=`,
      `Date: ${now}`,
      `Message-ID: ${messageId}`,
      `X-Hotel-Request-ID: ${config.xHotelRequestId}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      btoa(unescape(encodeURIComponent(config.body))),
      `.`,
    ].join("\r\n");

    const dataResp = await sendCmd(emailData);
    if (!dataResp.includes("250")) {
      throw new Error("Errore nell'invio dell'email: " + dataResp);
    }

    await sendCmd("QUIT");
    conn.close();
  } catch (e) {
    try { conn.close(); } catch {}
    throw e;
  }
}
