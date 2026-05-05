import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Static-source assertions to guard the X-Hotel-Request-ID tracking contract.
 *
 * The header is set by the `send-offer` edge function and consumed by
 * `fetch-emails` to thread inbound replies back to the originating booking.
 * If any of these assertions fail, threading via the custom header is broken.
 */
describe("X-Hotel-Request-ID tracking contract", () => {
  const sendOffer = readFileSync(
    resolve(process.cwd(), "supabase/functions/send-offer/index.ts"),
    "utf-8"
  );
  const fetchEmails = readFileSync(
    resolve(process.cwd(), "supabase/functions/fetch-emails/index.ts"),
    "utf-8"
  );

  it("send-offer derives xHotelRequestId from the booking_id", () => {
    expect(sendOffer).toMatch(/xHotelRequestId\s*=\s*`\$\{booking_id\}`/);
  });

  it("send-offer emits the X-Hotel-Request-ID header in the SMTP DATA payload", () => {
    expect(sendOffer).toMatch(/`X-Hotel-Request-ID:\s*\$\{config\.xHotelRequestId\}`/);
  });

  it("send-offer persists x_hotel_request_id on the outbound booking_message", () => {
    expect(sendOffer).toMatch(/x_hotel_request_id:\s*xHotelRequestId/);
  });

  it("fetch-emails matches inbound replies by x_hotel_request_id", () => {
    expect(fetchEmails).toMatch(/\.eq\(["']x_hotel_request_id["'],\s*email\.x_hotel_request_id\)/);
  });

  it("fetch-emails treats x_hotel_request_id as a reply marker", () => {
    expect(fetchEmails).toMatch(/email\.x_hotel_request_id/);
    expect(fetchEmails).toMatch(/isReply/);
  });

  it("fetch-emails persists x_hotel_request_id on inbound booking_message", () => {
    expect(fetchEmails).toMatch(/x_hotel_request_id:\s*email\.x_hotel_request_id/);
  });
});
