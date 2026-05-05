CREATE TABLE public.edge_function_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  message text,
  hotel_id uuid,
  x_hotel_request_id text,
  message_id text,
  request_id uuid,
  metadata jsonb
);

CREATE INDEX idx_efl_created_at ON public.edge_function_logs (created_at DESC);
CREATE INDEX idx_efl_hotel ON public.edge_function_logs (hotel_id, created_at DESC);
CREATE INDEX idx_efl_xhrid ON public.edge_function_logs (x_hotel_request_id);
CREATE INDEX idx_efl_function ON public.edge_function_logs (function_name, created_at DESC);
CREATE INDEX idx_efl_level ON public.edge_function_logs (level);

ALTER TABLE public.edge_function_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view edge logs"
  ON public.edge_function_logs
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage edge logs"
  ON public.edge_function_logs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));