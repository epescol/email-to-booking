
CREATE TABLE public.booking_accommodations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  room_type text,
  treatment text,
  adults integer DEFAULT 1,
  children integer DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_accommodations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accommodations" ON public.booking_accommodations
  FOR SELECT TO authenticated
  USING (request_id IN (SELECT id FROM public.booking_requests WHERE hotel_id = get_user_hotel_id(auth.uid())));

CREATE POLICY "Users can manage accommodations" ON public.booking_accommodations
  FOR ALL TO authenticated
  USING (request_id IN (SELECT id FROM public.booking_requests WHERE hotel_id = get_user_hotel_id(auth.uid())));
