DROP POLICY IF EXISTS "Admins manage global email settings" ON public.global_email_settings;

REVOKE ALL ON public.global_email_settings FROM authenticated;
REVOKE ALL ON public.global_email_settings FROM anon;
GRANT ALL ON public.global_email_settings TO service_role;

ALTER TABLE public.global_email_settings ENABLE ROW LEVEL SECURITY;