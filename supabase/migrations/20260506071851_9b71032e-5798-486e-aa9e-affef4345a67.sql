-- Revert admin-only RLS on hotel_email_settings: hotel users manage their own settings
DROP POLICY IF EXISTS "Admins can view their hotel email settings" ON public.hotel_email_settings;
DROP POLICY IF EXISTS "Admins can manage their hotel email settings" ON public.hotel_email_settings;
DROP POLICY IF EXISTS "Users can view their hotel email settings" ON public.hotel_email_settings;
DROP POLICY IF EXISTS "Users can manage their hotel email settings" ON public.hotel_email_settings;

CREATE POLICY "Users can view their hotel email settings"
ON public.hotel_email_settings
FOR SELECT
TO authenticated
USING (hotel_id = public.get_user_hotel_id(auth.uid()));

CREATE POLICY "Users can manage their hotel email settings"
ON public.hotel_email_settings
FOR ALL
TO authenticated
USING (hotel_id = public.get_user_hotel_id(auth.uid()))
WITH CHECK (hotel_id = public.get_user_hotel_id(auth.uid()));