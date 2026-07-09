
-- 1. Affiliate campaigns (saved UTM presets per affiliate)
CREATE TABLE public.affiliate_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_profile_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  landing_path TEXT NOT NULL DEFAULT '/',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  notes TEXT,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_campaigns TO authenticated;
GRANT ALL ON public.affiliate_campaigns TO service_role;
ALTER TABLE public.affiliate_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates manage their own campaigns"
  ON public.affiliate_campaigns FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.affiliate_profiles p
             WHERE p.id = affiliate_profile_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.affiliate_profiles p
             WHERE p.id = affiliate_profile_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Admins can view all campaigns"
  ON public.affiliate_campaigns FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_affiliate_campaigns_updated_at
  BEFORE UPDATE ON public.affiliate_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_affiliate_campaigns_profile ON public.affiliate_campaigns(affiliate_profile_id);

-- 2. In-app notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all notifications"
  ON public.notifications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_all ON public.notifications(user_id, created_at DESC);

-- 3. Helper to enqueue notifications (SECURITY DEFINER so RPCs can write to any user)
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _user_id UUID, _type TEXT, _title TEXT, _body TEXT DEFAULT NULL,
  _link TEXT DEFAULT NULL, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (_user_id, _type, _title, _body, _link, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO nid;
  RETURN nid;
END $$;

-- 4. Broadcast helper — notify every admin (used for new affiliate applications)
CREATE OR REPLACE FUNCTION public.notify_admins(
  _type TEXT, _title TEXT, _body TEXT DEFAULT NULL,
  _link TEXT DEFAULT NULL, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER := 0;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  SELECT ur.user_id, _type, _title, _body, _link, COALESCE(_metadata, '{}'::jsonb)
  FROM public.user_roles ur
  WHERE ur.role = 'admin';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- 5. Trigger: new affiliate application → notify all admins
CREATE OR REPLACE FUNCTION public.trg_notify_new_application()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_admins(
    'affiliate_application_new',
    'New affiliate application',
    COALESCE(NEW.full_name, NEW.email) || ' applied to the affiliate program',
    '/admin/affiliates',
    jsonb_build_object('application_id', NEW.id, 'user_id', NEW.user_id)
  );
  RETURN NEW;
END $$;
CREATE TRIGGER notify_new_affiliate_application
  AFTER INSERT ON public.affiliate_applications
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_new_application();

-- 6. Update approve function to also notify the applicant
CREATE OR REPLACE FUNCTION public.approve_affiliate_application(_application_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  app RECORD;
  new_profile_id UUID;
  generated_code TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can approve applications';
  END IF;

  SELECT * INTO app FROM public.affiliate_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  UPDATE public.affiliate_applications
    SET status='approved', reviewed_by=auth.uid(), reviewed_date=now()
    WHERE id = _application_id;

  SELECT id INTO new_profile_id FROM public.affiliate_profiles WHERE user_id = app.user_id;
  IF new_profile_id IS NULL THEN
    generated_code := public.generate_affiliate_code();
    INSERT INTO public.affiliate_profiles (user_id, affiliate_code, payout_email, payout_method)
    VALUES (app.user_id, generated_code, app.email, COALESCE(app.payout_details->>'method','paypal'))
    RETURNING id INTO new_profile_id;
  END IF;

  PERFORM public.enqueue_notification(
    app.user_id, 'affiliate_application_approved',
    'You''re in! Affiliate application approved',
    'Head to your affiliate dashboard to grab your referral link.',
    '/affiliate/dashboard',
    jsonb_build_object('application_id', _application_id, 'profile_id', new_profile_id)
  );

  RETURN new_profile_id;
END $function$;

-- 7. Reject function (new) — sets status + notifies applicant
CREATE OR REPLACE FUNCTION public.reject_affiliate_application(_application_id uuid, _reason text DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE app RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can reject applications';
  END IF;
  SELECT * INTO app FROM public.affiliate_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  UPDATE public.affiliate_applications
    SET status='rejected', reviewed_by=auth.uid(), reviewed_date=now(),
        rejection_reason = COALESCE(_reason, rejection_reason)
    WHERE id = _application_id;

  PERFORM public.enqueue_notification(
    app.user_id, 'affiliate_application_rejected',
    'Affiliate application update',
    COALESCE(_reason, 'Your affiliate application was not approved at this time.'),
    '/affiliate',
    jsonb_build_object('application_id', _application_id)
  );
END $$;

-- 8. Create payout (admin) — creates payout row + optionally links commissions
CREATE OR REPLACE FUNCTION public.admin_create_payout(
  _affiliate_profile_id UUID,
  _amount NUMERIC,
  _payout_method TEXT,
  _reference TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _commission_ids UUID[] DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE payout_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can create payouts';
  END IF;

  INSERT INTO public.affiliate_payouts
    (affiliate_profile_id, amount, payout_method, reference, notes, status, created_by)
  VALUES
    (_affiliate_profile_id, _amount, _payout_method, _reference, _notes, 'pending', auth.uid())
  RETURNING id INTO payout_id;

  IF _commission_ids IS NOT NULL THEN
    UPDATE public.affiliate_commissions
      SET affiliate_payout_id = payout_id
      WHERE id = ANY(_commission_ids)
        AND affiliate_profile_id = _affiliate_profile_id
        AND status IN ('approved','pending');
  END IF;

  RETURN payout_id;
END $$;

-- 9. Mark payout paid — flips payout + all linked commissions to paid, notifies affiliate
CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(
  _payout_id UUID,
  _reference TEXT DEFAULT NULL,
  _payout_method TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD; affiliate_user UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can mark payouts paid';
  END IF;

  SELECT * INTO p FROM public.affiliate_payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;

  UPDATE public.affiliate_payouts
    SET status='paid',
        payout_date = COALESCE(payout_date, now()),
        reference = COALESCE(_reference, reference),
        payout_method = COALESCE(_payout_method, payout_method)
    WHERE id = _payout_id;

  UPDATE public.affiliate_commissions
    SET status='paid', paid_date = now()
    WHERE affiliate_payout_id = _payout_id;

  SELECT user_id INTO affiliate_user FROM public.affiliate_profiles WHERE id = p.affiliate_profile_id;
  IF affiliate_user IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      affiliate_user, 'affiliate_payout_paid',
      'Payout sent: $' || to_char(p.amount, 'FM999999990.00'),
      'Your affiliate payout has been marked as paid.',
      '/affiliate/dashboard',
      jsonb_build_object('payout_id', _payout_id, 'amount', p.amount)
    );
  END IF;
END $$;

-- Add reference / created_by columns to payouts if missing
ALTER TABLE public.affiliate_payouts
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;
