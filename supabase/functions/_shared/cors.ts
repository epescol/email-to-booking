// Shared CORS helpers for Edge Functions.
// Restricts Access-Control-Allow-Origin to an exact allowlist of this project's origins.

const ALLOWED_ORIGINS = [
  "https://requester.interpromotion.com",
  "https://email-to-booking.lovable.app",
  "https://id-preview--30f07c68-74b8-446a-aeb2-41f1642eb7d0.lovable.app",
];

// Local development only.
const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(:\d+)?$/i,
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };

  // Disallowed origins get no Access-Control-Allow-Origin header at all.
  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}
