
-- Create treatments table
CREATE TABLE public.treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view treatments of own hotel"
  ON public.treatments FOR SELECT TO authenticated
  USING (hotel_id = get_user_hotel_id(auth.uid()));

CREATE POLICY "Users can manage treatments of own hotel"
  ON public.treatments FOR ALL TO authenticated
  USING (hotel_id = get_user_hotel_id(auth.uid()));

-- Add treatment_id to room_prices (nullable for backward compat)
ALTER TABLE public.room_prices ADD COLUMN treatment_id uuid REFERENCES public.treatments(id) ON DELETE CASCADE;
