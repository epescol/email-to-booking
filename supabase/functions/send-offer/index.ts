import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let auditCtx: { userId?: string; bookingId?: string; hotelId?: string; recipient?: string } = {};
  let auditClient: ReturnType<typeof createClient> | null = null;

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

    // Validate JWT server-side using getUser() (not getClaims which only decodes locally)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;
    auditCtx.userId = userId;
    auditClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { booking_id, subject, body, is_html } = await req.json();
    auditCtx.bookingId = booking_id;

    if (!booking_id || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Campi obbligatori: booking_id, subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    auditCtx.hotelId = profile.hotel_id;
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

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: settings } = await adminClient
      .from("global_email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();

    if (!settings?.smtp_host || !settings?.smtp_user || !settings?.smtp_password) {
      return new Response(
        JSON.stringify({ error: "Configura le credenziali SMTP globali nelle Impostazioni Email." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt SMTP password
    const encryptionKey = Deno.env.get("EMAIL_ENCRYPTION_KEY");
    let smtpPassword = settings.smtp_password;
    if (encryptionKey) {
      try {
        const { data, error } = await adminClient.rpc("decrypt_value", {
          _ciphertext: settings.smtp_password,
          _key: encryptionKey,
        });
        if (!error && data) smtpPassword = data;
      } catch {
        // If decryption fails, assume plaintext (pre-migration)
      }
    }

    const xHotelRequestId = `${booking_id}`;
    const fromAddress = settings.from_address || settings.smtp_user;
    const senderDomain = fromAddress.split("@")[1] || settings.smtp_host;
    const fromHeader = settings.from_name
      ? `"${String(settings.from_name).replace(/"/g, "")}" <${fromAddress}>`
      : fromAddress;
    const outboundMessageId = `<${crypto.randomUUID()}@${senderDomain}>`;

    await sendSmtpEmail({
      host: settings.smtp_host,
      port: settings.smtp_port || 587,
      username: settings.smtp_user,
      password: smtpPassword,
      from: fromAddress,
      fromHeader,
      to: booking.email,
      subject,
      body,
      isHtml: is_html === true,
      xHotelRequestId,
      ehloDomain: senderDomain,
      messageId: outboundMessageId,
    });

    await supabase.from("booking_messages").insert({
      request_id: booking_id,
      direction: "outbound",
      subject,
      body,
      email_message_id: outboundMessageId,
      x_hotel_request_id: xHotelRequestId,
      sent_at: new Date().toISOString(),
    });

    // Audit: offer sent
    await supabase.rpc("log_audit_event", {
      _action: "booking_request.offer_sent",
      _entity_type: "booking_request",
      _entity_id: booking_id,
      _metadata: {
        hotel_id: profile.hotel_id,
        recipient: booking.email,
        subject,
        message_id: outboundMessageId,
      } as never,
    });

    if (booking.status === "nuova") {
      await supabase
        .from("booking_requests")
        .update({ status: "presa_in_carico" })
        .eq("id", booking_id);
      await supabase.rpc("log_audit_event", {
        _action: "booking_request.status_changed",
        _entity_type: "booking_request",
        _entity_id: booking_id,
        _metadata: {
          hotel_id: profile.hotel_id,
          from: "nuova",
          to: "presa_in_carico",
          reason: "offer_sent",
        } as never,
      });
    }

    return new Response(
      JSON.stringify({ message: "Offerta inviata con successo" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-offer error:", e);
    const errMsg = e instanceof Error ? e.message : "Errore sconosciuto";
    if (auditClient && auditCtx.bookingId) {
      try {
        await auditClient.rpc("log_audit_event_as", {
          _user_id: auditCtx.userId ?? null,
          _action: "booking_request.send_failed",
          _entity_type: "booking_request",
          _entity_id: auditCtx.bookingId,
          _metadata: { hotel_id: auditCtx.hotelId, error: errMsg } as never,
        });
      } catch { /* noop */ }
    }
    return new Response(
      JSON.stringify({ error: errMsg }),
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
  from: string;
  fromHeader: string;
  to: string;
  subject: string;
  body: string;
  isHtml: boolean;
  xHotelRequestId: string;
  ehloDomain: string;
  messageId: string;
}

const SMTP_CONNECT_TIMEOUT_MS = 15000;
const SMTP_READ_TIMEOUT_MS = 15000;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms) as unknown as number;
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function sendSmtpEmail(config: SmtpConfig): Promise<void> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let conn: Deno.TlsConn | Deno.TcpConn;

  if (config.port === 465) {
    conn = await withTimeout(
      Deno.connectTls({ hostname: config.host, port: config.port }),
      SMTP_CONNECT_TIMEOUT_MS,
      "SMTP TLS connect",
    );
  } else {
    conn = await withTimeout(
      Deno.connect({ hostname: config.host, port: config.port }),
      SMTP_CONNECT_TIMEOUT_MS,
      "SMTP connect",
    );
  }

  async function readResp(): Promise<string> {
    const buf = new Uint8Array(4096);
    let result = "";
    const maxAttempts = 20;
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      const n = await withTimeout(conn.read(buf), SMTP_READ_TIMEOUT_MS, "SMTP read");
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n));
      const lines = result.split("\r\n").filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";
      // Final line has "CODE SP" (not "CODE-")
      if (/^\d{3} /.test(lastLine)) break;
    }
    return result;
  }

  async function sendCmd(cmd: string): Promise<string> {
    await withTimeout(conn.write(encoder.encode(cmd + "\r\n")), SMTP_READ_TIMEOUT_MS, "SMTP write");
    return await readResp();
  }

  function checkResp(resp: string, expectedCode: string, context: string) {
    if (!resp.startsWith(expectedCode) && !resp.includes(`${expectedCode} `) && !resp.includes(`${expectedCode}-`)) {
      throw new Error(`SMTP ${context} fallito: ${resp.trim()}`);
    }
  }

  try {
    // Read greeting
    const greeting = await readResp();
    console.log("SMTP greeting:", greeting.trim());

    // EHLO with sender domain (NOT localhost)
    const ehloResp = await sendCmd(`EHLO ${config.ehloDomain}`);
    console.log("EHLO response:", ehloResp.substring(0, 200));

    // STARTTLS if port 587
    if (config.port === 587 && ehloResp.includes("STARTTLS")) {
      const starttlsResp = await sendCmd("STARTTLS");
      checkResp(starttlsResp, "220", "STARTTLS");
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: config.host });
      // Re-EHLO after STARTTLS
      await sendCmd(`EHLO ${config.ehloDomain}`);
    }

    // AUTH LOGIN
    const authStartResp = await sendCmd("AUTH LOGIN");
    if (!authStartResp.includes("334")) {
      throw new Error("SMTP AUTH LOGIN non supportato: " + authStartResp.trim());
    }

    const userResp = await sendCmd(btoa(config.username));
    if (!userResp.includes("334")) {
      throw new Error("SMTP AUTH username rifiutato: " + userResp.trim());
    }

    const passResp = await sendCmd(btoa(config.password));
    if (!passResp.includes("235")) {
      throw new Error("Autenticazione SMTP fallita: " + passResp.trim());
    }

    // MAIL FROM
    const fromResp = await sendCmd(`MAIL FROM:<${config.from}>`);
    checkResp(fromResp, "250", "MAIL FROM");

    // RCPT TO
    const rcptResp = await sendCmd(`RCPT TO:<${config.to}>`);
    checkResp(rcptResp, "250", "RCPT TO");

    // DATA
    const dataResp = await sendCmd("DATA");
    if (!dataResp.includes("354")) {
      throw new Error("SMTP DATA rifiutato: " + dataResp.trim());
    }

    // Build email
    const now = new Date().toUTCString();

    const emailData = [
      `From: ${config.fromHeader}`,
      `To: ${config.to}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(config.subject)))}?=`,
      `Date: ${now}`,
      `Message-ID: ${config.messageId}`,
      `X-Hotel-Request-ID: ${config.xHotelRequestId}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${config.isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      btoa(unescape(encodeURIComponent(config.body))),
      `.`,
    ].join("\r\n");

    const sendResp = await sendCmd(emailData);
    if (!sendResp.includes("250")) {
      throw new Error("Errore nell'invio dell'email: " + sendResp.trim());
    }

    console.log("Email sent successfully to", config.to);
    await sendCmd("QUIT");
    try { conn.close(); } catch { /* ignore */ }
  } catch (e) {
    try { conn.close(); } catch { /* ignore */ }
    throw e;
  }
}
