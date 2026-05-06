ALTER TABLE public.hotel_email_settings
  DROP COLUMN IF EXISTS imap_host,
  DROP COLUMN IF EXISTS imap_port,
  DROP COLUMN IF EXISTS imap_user,
  DROP COLUMN IF EXISTS imap_password,
  DROP COLUMN IF EXISTS imap_use_ssl;