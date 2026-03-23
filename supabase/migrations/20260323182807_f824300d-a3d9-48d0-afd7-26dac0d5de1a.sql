
ALTER TABLE public.hotels ADD COLUMN pricing_mode text NOT NULL DEFAULT 'per_room';

ALTER TABLE public.room_prices ADD COLUMN occupancy integer NULL;

-- Drop the existing unique constraint if any, and create a new one that includes occupancy
ALTER TABLE public.room_prices DROP CONSTRAINT IF EXISTS room_prices_room_id_period_id_key;
CREATE UNIQUE INDEX room_prices_room_period_occ_idx ON public.room_prices (room_id, period_id, COALESCE(occupancy, 0));
