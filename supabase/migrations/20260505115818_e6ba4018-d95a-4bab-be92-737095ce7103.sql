DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP FUNCTION IF EXISTS public._profile_hotel_id_unchanged(uuid, uuid);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND hotel_id IS NOT DISTINCT FROM (
    SELECT p.hotel_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);