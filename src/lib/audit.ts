import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "booking_request.deleted"
  | "booking_request.archived"
  | "booking_request.unarchived"
  | "booking_request.status_changed"
  | "booking_request.offer_sent"
  | "booking_request.send_failed"
  | "email_settings.updated"
  | "auth.admin_login"
  | "pricing.period_created"
  | "pricing.period_deleted"
  | "pricing.price_updated"
  | "pricing.mode_changed"
  | "template.saved"
  | "template.deleted"
  | "template.set_default";

export type AuditEntityType =
  | "booking_request"
  | "hotel_email_settings"
  | "auth_user"
  | "price_period"
  | "room_price"
  | "hotel"
  | "offer_template";

/**
 * Best-effort audit logging from the client.
 * Failures are swallowed (logged to console) so they never block user actions.
 */
export async function logAudit(
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_audit_event", {
      _action: action,
      _entity_type: entityType,
      _entity_id: entityId as never,
      _metadata: metadata as never,
    });
    if (error) console.warn("audit log failed:", error.message);
  } catch (e) {
    console.warn("audit log threw:", e);
  }
}
