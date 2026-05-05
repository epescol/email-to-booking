import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ImapFlow } from "npm:imapflow@1.0.164";
import { simpleParser } from "npm:mailparser@3.7.1";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("EMAIL_ENCRYPTION_KEY")!;
    const webhookSecret = Deno.env.get("FETCH_EMAILS_WEBHOOK_SECRET")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: "Non autenticato" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await admin
      .from("profiles").select("hotel_id").eq("user_id", user.id).single();
    if (!profile?.hotel_id) return json({ error: "Nessun hotel associato" }, 400);

    const { data: settings } = await admin
      .from("hotel_email_settings").select("*").eq("hotel_id", profile.hotel_id).maybeSingle();

    if (!settings?.imap_host || !settings?.imap_user || !settings?.imap_password) {
      return json({ error: "Credenziali IMAP non configurate" }, 400);
    }

    // Decrypt password
    let imapPassword = settings.imap_password as string;
    const { data: dec } = await admin.rpc("decrypt_value", {
      _ciphertext: imapPassword, _key: encryptionKey,
    });
    if (dec) imapPassword = dec;

    const client = new ImapFlow({
      host: settings.imap_host,
      port: settings.imap_port || 993,
      secure: settings.imap_use_ssl ?? true,
      auth: { user: settings.imap_user, pass: imapPassword },
      logger: false,
    });

    const errors: string[] = [];
    let fetched = 0;
    let forwarded = 0;
    let imported = 0;

    try {
      await client.connect();
    } catch (e) {
      return json({ error: `Connessione IMAP fallita: ${(e as Error).message}` }, 502);
    }

    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        // Fetch unseen messages from the last 7 days
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const uids = await client.search({ seen: false, since }, { uid: true }) || [];

        const emails: Array<Record<string, unknown>> = [];
        for (const uid of uids) {
          fetched++;
          try {
            const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
            if (!msg?.source) continue;
            const parsed = await simpleParser(msg.source as Uint8Array);
            const toField =
              parsed.to && (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
                .map((a: any) => a.text).join(", ");
            emails.push({
              message_id: parsed.messageId || `imap-${uid}`,
              subject: parsed.subject || "",
              from: parsed.from?.text || "",
              to: toField,
              date: parsed.date?.toISOString() || new Date().toISOString(),
              body: parsed.text || parsed.html || "",
              in_reply_to: parsed.inReplyTo || null,
              references: Array.isArray(parsed.references)
                ? parsed.references.join(" ")
                : parsed.references || null,
            });
          } catch (e) {
            errors.push(`UID ${uid}: ${(e as Error).message}`);
          }
        }

        if (emails.length > 0) {
          const res = await fetch(`${supabaseUrl}/functions/v1/fetch-emails`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret,
            },
            body: JSON.stringify({
              mode: "webhook",
              hotel_id: profile.hotel_id,
              emails,
            }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            errors.push(`Webhook: ${payload?.error || res.statusText}`);
          } else {
            forwarded = emails.length;
            imported = payload?.imported || 0;
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
    }

    return json({
      success: errors.length === 0,
      fetched, forwarded, imported,
      errors,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("fetch-emails-imap error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
