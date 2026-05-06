
-- 1) RLS hotel_email_settings: admin-only
DROP POLICY IF EXISTS "Users can view email settings" ON public.hotel_email_settings;
DROP POLICY IF EXISTS "Users can manage email settings" ON public.hotel_email_settings;

CREATE POLICY "Admins can view email settings"
  ON public.hotel_email_settings
  FOR SELECT
  TO authenticated
  USING (
    hotel_id = public.get_user_hotel_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can manage email settings"
  ON public.hotel_email_settings
  FOR ALL
  TO authenticated
  USING (
    hotel_id = public.get_user_hotel_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    hotel_id = public.get_user_hotel_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

-- 2) booking_requests.status CHECK aligned with app values
UPDATE public.booking_requests
SET status = 'nuova'
WHERE status NOT IN ('nuova', 'presa_in_carico', 'archiviata');

ALTER TABLE public.booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_status_check;

ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_status_check
  CHECK (status IN ('nuova', 'presa_in_carico', 'archiviata'));
