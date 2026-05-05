import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("FETCH_EMAILS_WEBHOOK_SECRET")!;

/**
 * E2E: two replies, two different hotels, no body.hotel_id provided.
 *
 * The fetch-emails webhook must resolve hotel_id PER EMAIL from the recipient
 * address (To/Delivered-To) by matching against hotel_email_settings.imap_user.
 * Each inbound reply must land in the cronologia of the correct hotel's
 * booking_request — never cross-tenant.
 */
Deno.test({
  name: "E2E: per-recipient hotel routing keeps replies in the correct request history",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const seedHotel = async (slug: string) => {
      const recipient = `reservations-${slug}-${crypto.randomUUID().slice(0, 8)}@example.com`;
      const { data: hotel, error: hErr } = await admin
        .from("hotels")
        .insert({ name: `e2e-route-${slug}-${crypto.randomUUID()}` })
        .select("id")
        .single();
      if (hErr) throw hErr;
      const hotelId = hotel!.id as string;

      const { error: sErr } = await admin.from("hotel_email_settings").insert({
        hotel_id: hotelId,
        imap_user: recipient,
        smtp_user: recipient,
      });
      if (sErr) throw sErr;

      const guestEmail = `guest-${slug}-${crypto.randomUUID()}@example.com`;
      const { data: req, error: rErr } = await admin
        .from("booking_requests")
        .insert({
          hotel_id: hotelId,
          first_name: "Guest",
          last_name: slug.toUpperCase(),
          email: guestEmail,
          check_in: "2030-06-01",
          check_out: "2030-06-05",
          status: "presa_in_carico",
        })
        .select("id")
        .single();
      if (rErr) throw rErr;
      const requestId = req!.id as string;

      const outboundMessageId = `<out-${slug}-${crypto.randomUUID()}@example.com>`;
      const xHotelRequestId = requestId;
      const { error: mErr } = await admin.from("booking_messages").insert({
        request_id: requestId,
        direction: "outbound",
        subject: `Offerta ${slug}`,
        body: "Offerta...",
        email_message_id: outboundMessageId,
        x_hotel_request_id: xHotelRequestId,
        sent_at: new Date().toISOString(),
      });
      if (mErr) throw mErr;

      return { hotelId, recipient, guestEmail, requestId, outboundMessageId, xHotelRequestId };
    };

    const a = await seedHotel("alpha");
    const b = await seedHotel("beta");

    // Sanity: distinct hotels and distinct recipients
    assertNotEquals(a.hotelId, b.hotelId);
    assertNotEquals(a.recipient, b.recipient);

    const inboundA = `<reply-alpha-${crypto.randomUUID()}@example.com>`;
    const inboundB = `<reply-beta-${crypto.randomUUID()}@example.com>`;

    // NOTE: no hotel_id in body — routing must come from each email's `to`.
    const payload = {
      emails: [
        {
          message_id: inboundA,
          in_reply_to: a.outboundMessageId,
          references: a.outboundMessageId,
          x_hotel_request_id: a.xHotelRequestId,
          from: `Guest Alpha <${a.guestEmail}>`,
          to: a.recipient,
          subject: "Re: Offerta alpha",
          body: "Confermo la prenotazione alpha.",
          date: new Date().toISOString(),
        },
        {
          message_id: inboundB,
          in_reply_to: b.outboundMessageId,
          references: b.outboundMessageId,
          x_hotel_request_id: b.xHotelRequestId,
          from: `Guest Beta <${b.guestEmail}>`,
          to: b.recipient,
          subject: "Re: Offerta beta",
          body: "Confermo la prenotazione beta.",
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
    assertEquals(json.imported, 2, "both inbound emails must be imported");

    // Verify each inbound landed in the correct request
    const { data: msgA } = await admin
      .from("booking_messages")
      .select("request_id, direction")
      .eq("email_message_id", inboundA)
      .maybeSingle();
    const { data: msgB } = await admin
      .from("booking_messages")
      .select("request_id, direction")
      .eq("email_message_id", inboundB)
      .maybeSingle();

    assertEquals(msgA?.direction, "inbound");
    assertEquals(msgB?.direction, "inbound");
    assertEquals(msgA?.request_id, a.requestId, "alpha reply must thread into alpha request");
    assertEquals(msgB?.request_id, b.requestId, "beta reply must thread into beta request");

    // Cross-tenant safety: alpha's reply must NOT land in beta's history (and vice versa)
    const { data: historyA } = await admin
      .from("booking_messages")
      .select("email_message_id, direction")
      .eq("request_id", a.requestId)
      .order("sent_at", { ascending: true });
    const { data: historyB } = await admin
      .from("booking_messages")
      .select("email_message_id, direction")
      .eq("request_id", b.requestId)
      .order("sent_at", { ascending: true });

    const idsA = (historyA || []).map((m) => m.email_message_id);
    const idsB = (historyB || []).map((m) => m.email_message_id);
    assertEquals(idsA.includes(inboundA), true);
    assertEquals(idsA.includes(inboundB), false, "beta reply must NOT appear in alpha history");
    assertEquals(idsB.includes(inboundB), true);
    assertEquals(idsB.includes(inboundA), false, "alpha reply must NOT appear in beta history");

    // Cleanup
    for (const h of [a, b]) {
      await admin.from("booking_messages").delete().eq("request_id", h.requestId);
      await admin.from("booking_accommodations").delete().eq("request_id", h.requestId);
      await admin.from("booking_requests").delete().eq("id", h.requestId);
      await admin.from("hotel_email_settings").delete().eq("hotel_id", h.hotelId);
      await admin.from("hotels").delete().eq("id", h.hotelId);
    }
  },
});
