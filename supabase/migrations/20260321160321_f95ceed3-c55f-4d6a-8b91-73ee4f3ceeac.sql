
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Hotels table
CREATE TABLE public.hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rooms table
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_occupancy INT NOT NULL DEFAULT 1,
  max_occupancy INT NOT NULL DEFAULT 2,
  beds TEXT,
  site_url TEXT,
  photo_url_1 TEXT,
  photo_url_2 TEXT,
  photo_url_3 TEXT,
  photo_url_4 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Price periods table
CREATE TABLE public.price_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Room prices
CREATE TABLE public.room_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.price_periods(id) ON DELETE CASCADE,
  price_per_night NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE(room_id, period_id)
);

-- Booking requests
CREATE TABLE public.booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'nuova' CHECK (status IN ('nuova', 'offerta_inviata', 'caparra_inviata', 'confermata')),
  check_in DATE,
  check_out DATE,
  alternative_dates TEXT,
  language TEXT,
  gender TEXT,
  first_name TEXT,
  last_name TEXT,
  address TEXT,
  zip_code TEXT,
  city TEXT,
  country TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  offer_id TEXT,
  source_email_id TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages thread
CREATE TABLE public.booking_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,
  body TEXT,
  email_message_id TEXT,
  x_hotel_request_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Offer templates
CREATE TABLE public.offer_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hotel email settings
CREATE TABLE public.hotel_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL UNIQUE REFERENCES public.hotels(id) ON DELETE CASCADE,
  imap_host TEXT,
  imap_port INT DEFAULT 993,
  imap_user TEXT,
  imap_password TEXT,
  imap_use_ssl BOOLEAN DEFAULT true,
  smtp_host TEXT,
  smtp_port INT DEFAULT 587,
  smtp_user TEXT,
  smtp_password TEXT,
  smtp_use_ssl BOOLEAN DEFAULT true,
  filter_sender_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_email_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Security definer function to get user's hotel_id
CREATE OR REPLACE FUNCTION public.get_user_hotel_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT hotel_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Hotels policies
CREATE POLICY "Users can view own hotel" ON public.hotels FOR SELECT TO authenticated USING (id = public.get_user_hotel_id(auth.uid()));
CREATE POLICY "Admins can manage hotels" ON public.hotels FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Rooms policies
CREATE POLICY "Users can view rooms of own hotel" ON public.rooms FOR SELECT TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));
CREATE POLICY "Users can manage rooms of own hotel" ON public.rooms FOR ALL TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));

-- Price periods policies
CREATE POLICY "Users can view price periods" ON public.price_periods FOR SELECT TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));
CREATE POLICY "Users can manage price periods" ON public.price_periods FOR ALL TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));

-- Room prices policies
CREATE POLICY "Users can view room prices" ON public.room_prices FOR SELECT TO authenticated USING (room_id IN (SELECT id FROM public.rooms WHERE hotel_id = public.get_user_hotel_id(auth.uid())));
CREATE POLICY "Users can manage room prices" ON public.room_prices FOR ALL TO authenticated USING (room_id IN (SELECT id FROM public.rooms WHERE hotel_id = public.get_user_hotel_id(auth.uid())));

-- Booking requests policies
CREATE POLICY "Users can view bookings" ON public.booking_requests FOR SELECT TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));
CREATE POLICY "Users can manage bookings" ON public.booking_requests FOR ALL TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));

-- Booking messages policies
CREATE POLICY "Users can view messages" ON public.booking_messages FOR SELECT TO authenticated USING (request_id IN (SELECT id FROM public.booking_requests WHERE hotel_id = public.get_user_hotel_id(auth.uid())));
CREATE POLICY "Users can manage messages" ON public.booking_messages FOR ALL TO authenticated USING (request_id IN (SELECT id FROM public.booking_requests WHERE hotel_id = public.get_user_hotel_id(auth.uid())));

-- Offer templates policies
CREATE POLICY "Users can view templates" ON public.offer_templates FOR SELECT TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));
CREATE POLICY "Users can manage templates" ON public.offer_templates FOR ALL TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));

-- Email settings policies
CREATE POLICY "Users can view email settings" ON public.hotel_email_settings FOR SELECT TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));
CREATE POLICY "Users can manage email settings" ON public.hotel_email_settings FOR ALL TO authenticated USING (hotel_id = public.get_user_hotel_id(auth.uid()));

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_hotels_updated_at BEFORE UPDATE ON public.hotels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_booking_requests_updated_at BEFORE UPDATE ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_offer_templates_updated_at BEFORE UPDATE ON public.offer_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hotel_email_settings_updated_at BEFORE UPDATE ON public.hotel_email_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
