
ALTER TABLE public.booking_accommodations
  ADD COLUMN room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL;
