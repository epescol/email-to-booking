-- Storage: scope room-photos write access by hotel_id (first folder in path)
DROP POLICY IF EXISTS "Authenticated users can upload room photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update room photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete room photos" ON storage.objects;

CREATE POLICY "Hotel users can upload own room photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'room-photos'
  AND (storage.foldername(name))[1] = public.get_user_hotel_id(auth.uid())::text
);

CREATE POLICY "Hotel users can update own room photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'room-photos'
  AND (storage.foldername(name))[1] = public.get_user_hotel_id(auth.uid())::text
);

CREATE POLICY "Hotel users can delete own room photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'room-photos'
  AND (storage.foldername(name))[1] = public.get_user_hotel_id(auth.uid())::text
);

-- Profiles: prevent users from self-assigning a hotel_id
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND hotel_id IS NULL);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND hotel_id IS NOT DISTINCT FROM (SELECT hotel_id FROM public.profiles WHERE user_id = auth.uid())
);