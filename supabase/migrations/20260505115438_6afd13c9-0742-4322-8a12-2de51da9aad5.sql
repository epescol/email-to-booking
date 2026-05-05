-- 1. Move btree_gist out of public
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
ALTER EXTENSION btree_gist SET SCHEMA extensions;

-- 2. Public bucket "room-photos": drop broad SELECT policy (files still served via public URL),
--    keep upload/update/delete restricted to authenticated users.
DROP POLICY IF EXISTS "Anyone can view room photos" ON storage.objects;

-- 3. SECURITY DEFINER hardening
-- 3a. Functions only intended for the service role / triggers
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_value(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_value(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event_as(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 3b. Functions that signed-in users legitimately need: revoke anon only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_hotel_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb) FROM PUBLIC, anon;

-- Ensure authenticated still has what it needs
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_hotel_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb) TO authenticated;