CREATE OR REPLACE FUNCTION public.encrypt_value(_plaintext text, _key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(pgp_sym_encrypt(_plaintext, _key), 'base64')
$$;

CREATE OR REPLACE FUNCTION public.decrypt_value(_ciphertext text, _key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_decrypt(decode(_ciphertext, 'base64'), _key)
$$;