
-- 1. Validation trigger for booking dates (avoid CHECK with mutable expressions)
CREATE OR REPLACE FUNCTION public.validate_booking_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.check_in IS NOT NULL AND NEW.check_out IS NOT NULL AND NEW.check_in >= NEW.check_out THEN
    RAISE EXCEPTION 'check_in must be before check_out';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_booking_dates ON public.booking_requests;
CREATE TRIGGER trg_validate_booking_dates
BEFORE INSERT OR UPDATE ON public.booking_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_dates();

-- 2. Prevent overlapping price periods per hotel
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.price_periods
  DROP CONSTRAINT IF EXISTS price_periods_no_overlap;

ALTER TABLE public.price_periods
  ADD CONSTRAINT price_periods_valid_range CHECK (start_date <= end_date);

ALTER TABLE public.price_periods
  ADD CONSTRAINT price_periods_no_overlap
  EXCLUDE USING gist (
    hotel_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );

-- 3. Performance indexes on foreign-key-like columns
CREATE INDEX IF NOT EXISTS idx_booking_requests_hotel_id ON public.booking_requests(hotel_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON public.booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_booking_messages_request_id ON public.booking_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_booking_messages_email_message_id ON public.booking_messages(email_message_id);
CREATE INDEX IF NOT EXISTS idx_booking_accommodations_request_id ON public.booking_accommodations(request_id);
CREATE INDEX IF NOT EXISTS idx_booking_accommodations_room_id ON public.booking_accommodations(room_id);
CREATE INDEX IF NOT EXISTS idx_booking_accommodations_treatment_id ON public.booking_accommodations(treatment_id);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id ON public.rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_treatments_hotel_id ON public.treatments(hotel_id);
CREATE INDEX IF NOT EXISTS idx_room_prices_room_id ON public.room_prices(room_id);
CREATE INDEX IF NOT EXISTS idx_room_prices_period_id ON public.room_prices(period_id);
CREATE INDEX IF NOT EXISTS idx_room_prices_treatment_id ON public.room_prices(treatment_id);
CREATE INDEX IF NOT EXISTS idx_room_translations_room_id ON public.room_translations(room_id);
CREATE INDEX IF NOT EXISTS idx_price_periods_hotel_id ON public.price_periods(hotel_id);
CREATE INDEX IF NOT EXISTS idx_offer_templates_hotel_id ON public.offer_templates(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_languages_hotel_id ON public.hotel_languages(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_room_card_templates_hotel_id ON public.hotel_room_card_templates(hotel_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_hotel_id ON public.profiles(hotel_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- 4. Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log"
ON public.audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert audit log" ON public.audit_log;
CREATE POLICY "Admins can insert audit log"
ON public.audit_log FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
