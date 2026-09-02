CREATE POLICY "Hotel users can view audit events for their bookings"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  entity_type = 'booking_request'
  AND entity_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.booking_requests br
    WHERE br.id = audit_log.entity_id
      AND br.hotel_id = public.get_user_hotel_id(auth.uid())
  )
);