import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

    const xHotelRequestId = `${booking_id}`;

    // Send email via denomailer
    console.log(`Connecting to SMTP: ${settings.smtp_host}:${settings.smtp_port || 587}`);

    const client = new SMTPClient({
      connection: {
        hostname: settings.smtp_host,
        port: settings.smtp_port || 587,
        tls: settings.smtp_port === 465,
        auth: {
          username: settings.smtp_user,
          password: settings.smtp_password,
        },
      },
    });

    try {
      await client.send({
        from: settings.smtp_user,
        to: booking.email,
        subject: subject,
        content: body,
        headers: {
          "X-Hotel-Request-ID": xHotelRequestId,
        },
      });
      console.log("Email sent successfully");
    } finally {
      await client.close();
    }

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
