import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("FETCH_EMAILS_WEBHOOK_SECRET")!;

/**
 * E2E:
 *  1. Seed an existing booking_request + outbound booking_message with an
 *     x_hotel_request_id (this simulates an offer previously sent by send-offer).
 *  2. POST a simulated reply email to the fetch-emails webhook carrying the
 *     same x_hotel_request_id + an In-Reply-To pointing at the outbound
 *     Message-ID.
 *  3. Assert that the inbound message landed under the SAME request_id —
 *     i.e. it was threaded into the existing conversation history, not a
 *     brand-new request.
 *  4. Cleanup.
 */
Deno.test("E2E: inbound reply threads into the originating booking request", async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // --- 1. Seed hotel + request + outbound message ----------------------
  const hotelName = `e2e-thread-${crypto.randomUUID()}`;
  const { data: hotel, error: hErr } = await admin
    .from("hotels")
    .insert({ name: hotelName })
    .select("id")
    .single();
  if (hErr) throw hErr;
  const hotelId = hotel!.id as string;

  const guestEmail = `guest-${crypto.randomUUID()}@example.com`;
  const { data: req, error: rErr } = await admin
    .from("booking_requests")
    .insert({
      hotel_id: hotelId,
      first_name: "Mario",
      last_name: "Rossi",
      email: guestEmail,
      check_in: "2030-01-01",
      check_out: "2030-01-05",
      status: "presa_in_carico",
    })
    .select("id")
    .single();
  if (rErr) throw rErr;
  const requestId = req!.id as string;

  // Outbound offer message — exactly what send-offer would persist
  const outboundMessageId = `<${crypto.randomUUID()}@example.com>`;
  const xHotelRequestId = requestId; // send-offer uses booking_id as x-hotel-request-id

  const { error: mErr } = await admin.from("booking_messages").insert({
    request_id: requestId,
    direction: "outbound",
    subject: "La tua offerta",
    body: "Ecco la nostra offerta...",
    email_message_id: outboundMessageId,
    x_hotel_request_id: xHotelRequestId,
    sent_at: new Date().toISOString(),
  });
  if (mErr) throw mErr;

  // --- 2. POST a simulated reply to the fetch-emails webhook -----------
  const inboundMessageId = `<reply-${crypto.randomUUID()}@example.com>`;
  const replyPayload = {
    hotel_id: hotelId,
    emails: [
      {
        message_id: inboundMessageId,
        in_reply_to: outboundMessageId,
        references: outboundMessageId,
        x_hotel_request_id: xHotelRequestId,
        from: `Mario Rossi <${guestEmail}>`,
        subject: "Re: La tua offerta",
        body: `Ciao, confermo la prenotazione dal 1 al 5 gennaio 2030. Grazie!`,
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
    body: JSON.stringify(replyPayload),
  });
  const json = await res.json();
  assertEquals(res.status, 200, `webhook failed: ${JSON.stringify(json)}`);
  assertEquals(json.imported, 1, "expected exactly one inbound import");

  // --- 3. Verify threading ---------------------------------------------
  const { data: inboundMsg, error: imErr } = await admin
    .from("booking_messages")
    .select("id, request_id, direction, subject, x_hotel_request_id")
    .eq("email_message_id", inboundMessageId)
    .maybeSingle();
  if (imErr) throw imErr;

  assertEquals(inboundMsg !== null, true, "inbound message should be persisted");
  assertEquals(inboundMsg!.direction, "inbound");
  assertEquals(
    inboundMsg!.request_id,
    requestId,
    "inbound reply must thread into the original booking_request",
  );
  assertEquals(inboundMsg!.x_hotel_request_id, xHotelRequestId);

  // No duplicate booking_request must have been created for this guest
  const { data: requestsForGuest } = await admin
    .from("booking_requests")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("email", guestEmail);
  assertEquals(
    requestsForGuest?.length,
    1,
    "no new booking_request should be created for a threaded reply",
  );

  // History on the original request now contains both messages
  const { data: history } = await admin
    .from("booking_messages")
    .select("direction")
    .eq("request_id", requestId)
    .order("sent_at", { ascending: true });
  assertEquals(history?.length, 2, "request history must contain outbound + inbound");
  assertEquals(history?.[0].direction, "outbound");
  assertEquals(history?.[1].direction, "inbound");

  // --- 4. Cleanup ------------------------------------------------------
  await admin.from("booking_messages").delete().eq("request_id", requestId);
  await admin.from("booking_accommodations").delete().eq("request_id", requestId);
  await admin.from("booking_requests").delete().eq("id", requestId);
  await admin.from("hotels").delete().eq("id", hotelId);
});
