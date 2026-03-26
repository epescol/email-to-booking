
CREATE TABLE public.hotel_room_card_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES public.languages(code),
  template text NOT NULL,
  UNIQUE (hotel_id, language_code)
);

ALTER TABLE public.hotel_room_card_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage room card templates"
  ON public.hotel_room_card_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own hotel room card templates"
  ON public.hotel_room_card_templates FOR SELECT TO authenticated
  USING (hotel_id = get_user_hotel_id(auth.uid()));

CREATE POLICY "Users can manage own hotel room card templates"
  ON public.hotel_room_card_templates FOR ALL TO authenticated
  USING (hotel_id = get_user_hotel_id(auth.uid()));
