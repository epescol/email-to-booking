-- Allow admins to view booking data so they can open requests from edge logs
CREATE POLICY "Admins can view bookings"
ON public.booking_requests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view booking messages"
ON public.booking_messages
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view booking accommodations"
ON public.booking_accommodations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));