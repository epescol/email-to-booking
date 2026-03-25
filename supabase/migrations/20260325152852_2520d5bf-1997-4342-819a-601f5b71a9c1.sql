
-- Languages table
CREATE TABLE public.languages (
  code text PRIMARY KEY,
  name text NOT NULL
);
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view languages" ON public.languages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage languages" ON public.languages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed common languages
INSERT INTO public.languages (code, name) VALUES
  ('it', 'Italiano'),
  ('de', 'Deutsch'),
  ('en', 'English'),
  ('fr', 'Français'),
  ('es', 'Español');

-- Hotel languages junction
CREATE TABLE public.hotel_languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  UNIQUE (hotel_id, language_code)
);
ALTER TABLE public.hotel_languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own hotel languages" ON public.hotel_languages FOR SELECT TO authenticated USING (hotel_id = get_user_hotel_id(auth.uid()));
CREATE POLICY "Admins can manage hotel languages" ON public.hotel_languages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Room translations
CREATE TABLE public.room_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  name text NOT NULL,
  UNIQUE (room_id, language_code)
);
ALTER TABLE public.room_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own room translations" ON public.room_translations FOR SELECT TO authenticated USING (room_id IN (SELECT id FROM rooms WHERE hotel_id = get_user_hotel_id(auth.uid())));
CREATE POLICY "Users can manage own room translations" ON public.room_translations FOR ALL TO authenticated USING (room_id IN (SELECT id FROM rooms WHERE hotel_id = get_user_hotel_id(auth.uid())));

-- Add language and template_group_id to offer_templates
ALTER TABLE public.offer_templates ADD COLUMN language text REFERENCES public.languages(code) DEFAULT 'it';
ALTER TABLE public.offer_templates ADD COLUMN template_group_id uuid DEFAULT gen_random_uuid();
