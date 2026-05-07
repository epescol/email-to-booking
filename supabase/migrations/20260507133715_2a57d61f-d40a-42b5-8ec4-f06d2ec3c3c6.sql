-- Global email settings table (single row), admin-only
CREATE TABLE public.global_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  smtp_host text,
  smtp_port integer DEFAULT 587,
  smtp_user text,
  smtp_password text,
  smtp_use_ssl boolean DEFAULT true,
  from_address text,
  from_name text,
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage global email settings"
  ON public.global_email_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_global_email_settings_updated_at
  BEFORE UPDATE ON public.global_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Drop per-hotel email settings (no longer used)
DROP TABLE IF EXISTS public.hotel_email_settings;

-- Drop hotel.email column (hotels no longer have their own email address)
ALTER TABLE public.hotels DROP COLUMN IF EXISTS email;