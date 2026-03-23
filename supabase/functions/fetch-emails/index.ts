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
    const body = await req.json();

    // Determine mode: "webhook" (external service pushes emails) or "manual" (user triggers from dashboard)
    const mode = body.mode || "webhook";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (mode === "webhook") {
      // --- WEBHOOK MODE: External service (Zapier/Make/n8n) pushes email data ---
      // Validate webhook secret
      const webhookSecret = Deno.env.get("FETCH_EMAILS_WEBHOOK_SECRET");
      const providedSecret = req.headers.get("x-webhook-secret") || body.webhook_secret;

      if (webhookSecret && providedSecret !== webhookSecret) {
        return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Expected body format:
      // { emails: [{ subject, body, from, date, message_id, x_hotel_request_id? }], hotel_id: "..." }
      // OR single email: { subject, body, from, date, message_id, hotel_id }
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      let hotelId = body.hotel_id;
      if (!hotelId) {
        return new Response(JSON.stringify({ error: "hotel_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const emails = body.emails || [body];
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

      let imported = 0;
      for (const email of emails) {
        const messageId = email.message_id || `gen-${Date.now()}-${imported}`;

        // Check if already imported
        const { data: existing } = await supabase
          .from("booking_messages")
          .select("id")
          .eq("email_message_id", messageId)
          .maybeSingle();

        if (existing) continue;

        // Parse with AI
        const parsed = await parseBookingWithAI(email, LOVABLE_API_KEY);
        if (!parsed) continue;

        // Check for existing request via X-Hotel-Request-ID
        let requestId: string | null = null;
        if (email.x_hotel_request_id) {
          const { data: existingReq } = await supabase
            .from("booking_messages")
            .select("request_id")
            .eq("x_hotel_request_id", email.x_hotel_request_id)
            .limit(1)
            .maybeSingle();
          if (existingReq) requestId = existingReq.request_id;
        }

        // Create new request if needed
        if (!requestId) {
          const { data: newReq, error: reqError } = await supabase
            .from("booking_requests")
            .insert({
              hotel_id: hotelId,
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
              source_email_id: messageId,
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
          subject: email.subject || "(Nessun oggetto)",
          body: email.body || "",
          email_message_id: messageId,
          x_hotel_request_id: email.x_hotel_request_id || null,
          sent_at: email.date || new Date().toISOString(),
        });

        imported++;
      }

      return new Response(
        JSON.stringify({ message: `Importate ${imported} nuove email.`, imported }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // --- MANUAL MODE: User triggers from dashboard (returns webhook info) ---
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("hotel_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.hotel_id) {
        return new Response(JSON.stringify({ error: "Nessun hotel associato" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return webhook configuration info
      const webhookUrl = `${supabaseUrl}/functions/v1/fetch-emails`;
      return new Response(
        JSON.stringify({
          message: "Usa un servizio esterno (Zapier, Make, n8n) per inviare le email a questo webhook.",
          webhook_url: webhookUrl,
          hotel_id: profile.hotel_id,
          example_payload: {
            mode: "webhook",
            hotel_id: profile.hotel_id,
            emails: [
              {
                subject: "Richiesta prenotazione",
                body: "Testo dell'email...",
                from: "cliente@esempio.com",
                date: "2026-03-23T10:00:00Z",
                message_id: "unique-message-id",
              },
            ],
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("fetch-emails error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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
  email: { subject?: string; body?: string; from?: string },
  apiKey: string
): Promise<ParsedBooking | null> {
  const prompt = `Analizza questa email di richiesta prenotazione hotel ed estrai i dati strutturati.

SOGGETTO: ${email.subject || ""}
DA: ${email.from || ""}
CORPO:
${(email.body || "").substring(0, 4000)}

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
