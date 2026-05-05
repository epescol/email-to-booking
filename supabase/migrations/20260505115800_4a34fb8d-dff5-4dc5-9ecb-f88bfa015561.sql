DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public._profile_hotel_id_unchanged(_user_id uuid, _new_hotel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _new_hotel_id IS NOT DISTINCT FROM (SELECT hotel_id FROM public.profiles WHERE user_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public._profile_hotel_id_unchanged(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._profile_hotel_id_unchanged(uuid, uuid) TO authenticated;

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND public._profile_hotel_id_unchanged(auth.uid(), hotel_id)
);