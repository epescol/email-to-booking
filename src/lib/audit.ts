import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "booking_request.deleted"
  | "booking_request.archived"
  | "booking_request.unarchived"
  | "booking_request.status_changed"
  | "booking_request.offer_sent";

/**
 * Best-effort audit logging from the client.
 * Failures are swallowed (logged to console) so they never block user actions.
 */
export async function logAudit(
  action: AuditAction,
  entityType: "booking_request",
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_audit_event", {
      _action: action,
      _entity_type: entityType,
      _entity_id: entityId,
      _metadata: metadata as never,
    });
    if (error) console.warn("audit log failed:", error.message);
  } catch (e) {
    console.warn("audit log threw:", e);
  }
}
