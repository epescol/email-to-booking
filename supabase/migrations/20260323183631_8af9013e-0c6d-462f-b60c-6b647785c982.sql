
CREATE POLICY "Users can update own hotel"
ON public.hotels
FOR UPDATE
TO authenticated
USING (id = get_user_hotel_id(auth.uid()))
WITH CHECK (id = get_user_hotel_id(auth.uid()));
