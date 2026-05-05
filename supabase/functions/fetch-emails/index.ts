import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const mode = body.mode || "webhook";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (mode === "webhook") {
      // Validate webhook secret (REQUIRED)
      const webhookSecret = Deno.env.get("FETCH_EMAILS_WEBHOOK_SECRET");
      if (!webhookSecret) {
        return new Response(JSON.stringify({ error: "Webhook secret not configured on server" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const providedSecret = req.headers.get("x-webhook-secret") || body.webhook_secret;
      if (providedSecret !== webhookSecret) {
        return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const defaultHotelId: string | undefined = body.hotel_id;

      const emails = body.emails || [body];
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

      // Cache: per-hotel sender filter, resolved on first use
      const filterCache = new Map<string, string | null>();
      const loadFilter = async (hid: string): Promise<string | null> => {
        if (filterCache.has(hid)) return filterCache.get(hid)!;
        const { data } = await supabase
          .from("hotel_email_settings")
          .select("filter_sender_email")
          .eq("hotel_id", hid)
          .maybeSingle();
        const f = data?.filter_sender_email?.trim().toLowerCase() || null;
        filterCache.set(hid, f);
        return f;
      };

      // Resolve hotel_id from the recipient address (To/Delivered-To) by
      // matching against hotel_email_settings.imap_user (or smtp_user).
      const resolveHotelIdFromRecipient = async (
        toField: string | undefined,
      ): Promise<string | null> => {
        const recipient = extractEmailFromField(toField);
        if (!recipient) return null;
        const { data } = await supabase
          .from("hotel_email_settings")
          .select("hotel_id, imap_user, smtp_user")
          .or(`imap_user.ilike.${recipient},smtp_user.ilike.${recipient}`)
          .limit(1)
          .maybeSingle();
        return data?.hotel_id ?? null;
      };

      let imported = 0;
      for (const email of emails) {
        const messageId = email.message_id || `gen-${Date.now()}-${imported}`;

        // Resolve target hotel for THIS email
        const recipientField = email.to || email.delivered_to || email.recipient;
        const hotelId =
          (email.hotel_id as string | undefined) ||
          defaultHotelId ||
          (await resolveHotelIdFromRecipient(recipientField));

        if (!hotelId) {
          console.log(
            `Skipping email ${messageId}: cannot resolve hotel_id (recipient="${recipientField || "unknown"}")`,
          );
          continue;
        }

        // Check if already imported
        const { data: existing } = await supabase
          .from("booking_messages")
          .select("id")
          .eq("email_message_id", messageId)
          .maybeSingle();
        if (existing) continue;

        // Filter by sender email if configured for this hotel
        const filterSender = await loadFilter(hotelId);
        if (filterSender) {
          const senderEmail = extractEmailFromField(email.from);
          if (!senderEmail || senderEmail !== filterSender) {
            console.log(`Skipping email from non-matching sender: ${email.from || "unknown"}`);
            continue;
          }
        }

        // Check if this is a reply to an existing conversation (always import replies)
        const isReply = !!(email.in_reply_to || email.references || email.x_hotel_request_id);

        // Parse with AI (includes classification)
        const parsed = await parseBookingWithAI(email, LOVABLE_API_KEY);
        if (!parsed) continue;

        // Skip non-booking emails that are not replies to existing conversations
        if (!parsed.is_booking_request && !isReply) {
          console.log(`Skipping non-booking email: ${email.subject || messageId}`);
          continue;
        }

        // --- THREADING: try to find existing request ---
        let requestId: string | null = null;

        // 1. Check X-Hotel-Request-ID header
        if (email.x_hotel_request_id) {
          const { data: existingReq } = await supabase
            .from("booking_messages")
            .select("request_id")
            .eq("x_hotel_request_id", email.x_hotel_request_id)
            .limit(1)
            .maybeSingle();
          if (existingReq) requestId = existingReq.request_id;
        }

        // 2. Check In-Reply-To / References headers against our sent message IDs
        if (!requestId && (email.in_reply_to || email.references)) {
          const refsToCheck: string[] = [];
          if (email.in_reply_to) refsToCheck.push(email.in_reply_to.trim());
          if (email.references) {
            const refs = email.references.split(/\s+/).map((r: string) => r.trim()).filter(Boolean);
            refsToCheck.push(...refs);
          }

          if (refsToCheck.length > 0) {
            const { data: matchedMsg } = await supabase
              .from("booking_messages")
              .select("request_id")
              .eq("direction", "outbound")
              .in("email_message_id", refsToCheck)
              .limit(1)
              .maybeSingle();
            if (matchedMsg) requestId = matchedMsg.request_id;
          }
        }

        // 3. Fallback: match by sender email + hotel to find existing request
        if (!requestId && (parsed.email || email.from)) {
          const senderEmail = parsed.email || extractEmailFromField(email.from);
          if (senderEmail) {
            const { data: existingReqs } = await supabase
              .from("booking_requests")
              .select("id")
              .eq("hotel_id", hotelId)
              .eq("email", senderEmail)
              .in("status", ["nuova", "presa_in_carico"])
              .order("created_at", { ascending: false })
              .limit(1);
            if (existingReqs && existingReqs.length > 0) {
              requestId = existingReqs[0].id;
            }
          }
        }

        // Create new request only if no match found
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

        // Insert accommodations: prefer structured XML data, fallback to AI-parsed
        const structuredAccommodations = parseStructuredData(email.body);
        if (structuredAccommodations && structuredAccommodations.length > 0 && requestId) {
          // Resolve room_code to room_id
          const roomCodes = structuredAccommodations.map(a => a.room_code).filter(Boolean) as string[];
          let roomCodeMap: Record<string, string> = {};
          if (roomCodes.length > 0) {
            const { data: matchedRooms } = await supabase
              .from("rooms")
              .select("id, room_code")
              .eq("hotel_id", hotelId)
              .in("room_code", roomCodes);
            if (matchedRooms) {
              for (const r of matchedRooms as any[]) {
                if (r.room_code) roomCodeMap[r.room_code] = r.id;
              }
            }
          }

          // Resolve treatment_code to treatment_id
          const treatmentCodes = structuredAccommodations.map(a => a.treatment_code).filter(Boolean) as string[];
          let treatmentCodeMap: Record<string, string> = {};
          if (treatmentCodes.length > 0) {
            const { data: matchedTreatments } = await supabase
              .from("treatments")
              .select("id, treatment_code")
              .eq("hotel_id", hotelId)
              .in("treatment_code", treatmentCodes);
            if (matchedTreatments) {
              for (const t of matchedTreatments as any[]) {
                if (t.treatment_code) treatmentCodeMap[t.treatment_code] = t.id;
              }
            }
          }

          for (const acc of structuredAccommodations) {
            const resolvedRoomId = acc.room_code ? (roomCodeMap[acc.room_code] || null) : null;
            const resolvedTreatmentId = acc.treatment_code ? (treatmentCodeMap[acc.treatment_code] || null) : null;
            await supabase.from("booking_accommodations").insert({
              request_id: requestId,
              room_id: resolvedRoomId,
              treatment_id: resolvedTreatmentId,
              room_type: null,
              treatment: null,
              adults: acc.adults || 1,
              children: acc.children || 0,
              children_ages: acc.children_ages || null,
              notes: acc.notes || null,
            });
          }
        } else if (parsed.accommodations && parsed.accommodations.length > 0 && requestId) {
          for (const acc of parsed.accommodations) {
            await supabase.from("booking_accommodations").insert({
              request_id: requestId,
              room_type: acc.room_type || null,
              treatment: acc.treatment || null,
              adults: acc.adults || 1,
              children: acc.children || 0,
              children_ages: acc.children_ages || null,
              notes: acc.notes || null,
            });
          }
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

        // Audit: email imported via webhook
        try {
          await supabase.rpc("log_audit_event_as", {
            _user_id: null,
            _action: "booking_request.email_imported",
            _entity_type: "booking_request",
            _entity_id: requestId,
            _metadata: {
              hotel_id: hotelId,
              message_id: messageId,
              from: email.from || null,
              subject: email.subject || null,
              is_reply: isReply,
            },
          });
        } catch { /* noop */ }

        imported++;
      }

      return new Response(
        JSON.stringify({ message: `Importate ${imported} nuove email.`, imported }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // --- MANUAL MODE ---
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

      const webhookUrl = `${supabaseUrl}/functions/v1/fetch-emails`;
      return new Response(
        JSON.stringify({
          message: "Usa un servizio esterno (Zapier, Make, n8n) per inviare le email a questo webhook.",
          webhook_url: webhookUrl,
          hotel_id: profile.hotel_id,
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

// ---- Helpers ----

function extractEmailFromField(from: string | undefined): string | null {
  if (!from) return null;
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  if (from.includes("@")) return from.trim().toLowerCase();
  return null;
}

// ---- XML Structured Data Parsing ----

interface StructuredAccommodation {
  room_code?: string;
  treatment_code?: string;
  adults?: number;
  children?: number;
  children_ages?: string;
  notes?: string;
}

function parseStructuredData(body: string | undefined): StructuredAccommodation[] | null {
  if (!body) return null;
  // Look for hidden XML block: <!--HOTEL_DATA ... -->
  const match = body.match(/<!--HOTEL_DATA\s*([\s\S]*?)-->/);
  if (!match) return null;

  const xml = match[1].trim();
  const accommodations: StructuredAccommodation[] = [];

  // Parse <room> elements: <room code="DBL-101" treatment_id="uuid" adults="2" children="0" notes="..."/>
  const roomRegex = /<room\s+([^>]*?)\/?>/g;
  let roomMatch: RegExpExecArray | null;
  while ((roomMatch = roomRegex.exec(xml)) !== null) {
    const attrs = roomMatch[1];
    const getAttr = (name: string): string | undefined => {
      const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1] : undefined;
    };
    accommodations.push({
      room_code: getAttr("code") || getAttr("room_code"),
      treatment_code: getAttr("treatment") || getAttr("treatment_code"),
      adults: getAttr("adults") ? parseInt(getAttr("adults")!) : undefined,
      children: getAttr("children") ? parseInt(getAttr("children")!) : undefined,
      children_ages: getAttr("children_ages"),
      notes: getAttr("notes"),
    });
  }

  return accommodations.length > 0 ? accommodations : null;
}

// ---- AI Parsing ----

interface ParsedAccommodation {
  room_type?: string;
  treatment?: string;
  adults?: number;
  children?: number;
  children_ages?: string;
  notes?: string;
}

interface ParsedBooking {
  is_booking_request: boolean;
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
  accommodations?: ParsedAccommodation[];
}

async function parseBookingWithAI(
  email: { subject?: string; body?: string; from?: string },
  apiKey: string
): Promise<ParsedBooking | null> {
  const prompt = `Analizza questa email e determina se è una richiesta di prenotazione hotel o una comunicazione correlata a un soggiorno/prenotazione. Se NON è una richiesta di prenotazione (es. newsletter, notifiche di servizi, spam, email commerciali, comunicazioni tecniche), imposta is_booking_request a false.

SOGGETTO: ${email.subject || ""}
DA: ${email.from || ""}
CORPO:
${(email.body || "").substring(0, 4000)}

Se è una richiesta di prenotazione, estrai i seguenti campi se presenti. Per le date usa il formato YYYY-MM-DD.
IMPORTANTE: Estrai anche le camere/alloggi richiesti (tipo camera, trattamento, numero adulti/bambini).`;

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
            "Sei un assistente che classifica le email e estrae dati di prenotazione hotel. Prima determina se l'email è una richiesta di prenotazione. Se non lo è, imposta is_booking_request a false e lascia gli altri campi vuoti. Rispondi SOLO con la funzione tool_call richiesta.",
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_booking",
            description: "Classifica l'email e, se è una richiesta di prenotazione, estrai i dati",
            parameters: {
              type: "object",
               properties: {
                 is_booking_request: { type: "boolean", description: "true se l'email è una richiesta di prenotazione hotel o una comunicazione relativa a un soggiorno. false se è newsletter, notifica di servizi, spam, email commerciale, comunicazione tecnica o altro non correlato a prenotazioni." },
                first_name: { type: "string", description: "Nome dell'ospite" },
                last_name: { type: "string", description: "Cognome dell'ospite" },
                email: { type: "string", description: "Email dell'ospite" },
                phone: { type: "string", description: "Telefono dell'ospite" },
                check_in: { type: "string", description: "Data check-in in formato YYYY-MM-DD" },
                check_out: { type: "string", description: "Data check-out in formato YYYY-MM-DD" },
                notes: { type: "string", description: "Note o richieste speciali" },
                language: { type: "string", description: "Lingua dell'ospite (it, de, en, ecc.)" },
                alternative_dates: { type: "string", description: "Date alternative richieste dall'ospite, se menzionate" },
                gender: { type: "string", description: "Genere (M/F) dedotto da salutation Mr./Mrs./Sig./Sig.ra" },
                address: { type: "string", description: "Indirizzo" },
                city: { type: "string", description: "Città" },
                country: { type: "string", description: "Paese" },
                zip_code: { type: "string", description: "CAP" },
                accommodations: {
                  type: "array",
                  description: "Lista delle camere/alloggi richiesti",
                  items: {
                    type: "object",
                    properties: {
                      room_type: { type: "string", description: "Tipo di camera richiesta (es. Doppia, Suite, ecc.)" },
                      treatment: { type: "string", description: "Trattamento richiesto (es. bed and breakfast, mezza pensione, pensione completa)" },
                      adults: { type: "number", description: "Numero di adulti" },
                      children: { type: "number", description: "Numero di bambini" },
                      children_ages: { type: "string", description: "Età dei bambini separata da virgola (es. '3,7,12')" },
                      notes: { type: "string", description: "Note specifiche per questa camera" },
                    },
                  },
                },
              },
              required: ["is_booking_request"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_booking" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI parsing error:", response.status, errText);
    try {
      const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await adminClient.rpc("log_audit_event_as", {
        _user_id: null,
        _action: "booking_request.ai_parse_failed",
        _entity_type: "booking_request",
        _entity_id: null,
        _metadata: { status: response.status, error: errText.slice(0, 500), subject: email.subject || null },
      });
    } catch { /* noop */ }
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
