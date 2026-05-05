import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("FETCH_EMAILS_WEBHOOK_SECRET")!;

/**
 * E2E: recipient does not match any hotel_email_settings (no IMAP user).
 *
 * The webhook MUST skip the email (no booking_request, no booking_message
 * created) and return imported=0. No body.hotel_id is provided, so resolution
 * can only come from the recipient lookup — which must fail cleanly.
 */
Deno.test({
  name: "E2E: unknown recipient is rejected without creating any record",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const unknownRecipient = `unknown-${crypto.randomUUID()}@nowhere.example.com`;
    const unknownSender = `stranger-${crypto.randomUUID()}@example.com`;
    const messageId = `<orphan-${crypto.randomUUID()}@example.com>`;

    // Pre-flight: ensure no settings row matches this recipient
    const { data: preflight } = await admin
      .from("hotel_email_settings")
      .select("hotel_id")
      .or(`imap_user.ilike.${unknownRecipient},smtp_user.ilike.${unknownRecipient}`)
      .maybeSingle();
    assertEquals(preflight, null, "test recipient must not pre-exist");

    const payload = {
      emails: [
        {
          message_id: messageId,
          from: `Stranger <${unknownSender}>`,
          to: unknownRecipient,
          subject: "Richiesta soggiorno",
          body: "Vorrei prenotare una camera doppia dal 10 al 15 luglio.",
          date: new Date().toISOString(),
        },
      ],
    };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    assertEquals(res.status, 200, `webhook failed: ${JSON.stringify(json)}`);
    assertEquals(json.imported, 0, "unknown-recipient email must NOT be imported");

    // Verify no message was inserted with this message_id
    const { data: msg } = await admin
      .from("booking_messages")
      .select("id")
      .eq("email_message_id", messageId)
      .maybeSingle();
    assertEquals(msg, null, "no booking_message must be created for unknown recipient");

    // Verify no booking_request was created from this email
    const { data: reqs } = await admin
      .from("booking_requests")
      .select("id")
      .eq("source_email_id", messageId);
    assertEquals(reqs?.length ?? 0, 0, "no booking_request must be created for unknown recipient");

    // Also ensure no booking_request was created with the unknown sender email
    const { data: reqsBySender } = await admin
      .from("booking_requests")
      .select("id")
      .eq("email", unknownSender);
    assertEquals(
      reqsBySender?.length ?? 0,
      0,
      "no booking_request must be created from unknown sender",
    );
  },
});
