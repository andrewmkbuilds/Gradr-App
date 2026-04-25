DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS digest_send_time time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS digest_timezone text NOT NULL DEFAULT 'America/New_York';

CREATE TABLE IF NOT EXISTS public.digest_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'prepared',
  sent_at timestamptz NOT NULL DEFAULT now(),
  jobs_count integer NOT NULL DEFAULT 0,
  reminders_count integer NOT NULL DEFAULT 0,
  error_message text,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.digest_send_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own digest logs" ON public.digest_send_logs;
CREATE POLICY "Users can view their own digest logs"
ON public.digest_send_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own digest logs" ON public.digest_send_logs;
CREATE POLICY "Users can create their own digest logs"
ON public.digest_send_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all digest logs" ON public.digest_send_logs;
CREATE POLICY "Admins can view all digest logs"
ON public.digest_send_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_digest_send_logs_user_sent ON public.digest_send_logs(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_preferences_digest_time ON public.user_preferences(digest_enabled, digest_send_time);