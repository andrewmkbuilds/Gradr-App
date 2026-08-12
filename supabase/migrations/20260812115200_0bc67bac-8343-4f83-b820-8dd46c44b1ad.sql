CREATE POLICY "Admins read all paddle customers"
ON public.paddle_customers FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read all paddle subscriptions"
ON public.paddle_subscriptions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));