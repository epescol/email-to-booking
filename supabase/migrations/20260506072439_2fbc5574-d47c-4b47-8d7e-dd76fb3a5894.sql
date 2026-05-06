-- Restrict hotel_email_settings access to admins only
DROP POLICY IF EXISTS "Users can manage their hotel email settings" ON public.hotel_email_settings;
DROP POLICY IF EXISTS "Users can view their hotel email settings" ON public.hotel_email_settings;
-- Keep existing admin policies ("Admins can manage email settings", "Admins can view email settings")