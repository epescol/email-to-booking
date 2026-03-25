-- Allow admins to manage offer_templates for any hotel
CREATE POLICY "Admins can manage templates"
ON public.offer_templates
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
