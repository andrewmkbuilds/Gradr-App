-- Sensitive OAuth params that must never be persisted.
CREATE OR REPLACE FUNCTION public.redact_oauth_url(_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result text := _url;
  p text;
BEGIN
  IF result IS NULL THEN RETURN NULL; END IF;
  FOREACH p IN ARRAY ARRAY[
    'code','access_token','refresh_token','id_token','client_secret',
    'authuser','session_state','credential','assertion','token','password'
  ] LOOP
    -- query params
    result := regexp_replace(result, '([?&#]' || p || '=)[^&#\s]*', '\1[REDACTED]', 'gi');
  END LOOP;
  RETURN result;
END;
$$;

CREATE TABLE public.oauth_flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'google',
  account_type text NOT NULL DEFAULT 'unknown',
  stage text NOT NULL,
  hop_index integer NOT NULL DEFAULT 0,
  source_url text,
  destination_url text,
  final_url text,
  state_result text NOT NULL DEFAULT 'not_applicable',
  nonce_result text NOT NULL DEFAULT 'not_applicable',
  deviation boolean NOT NULL DEFAULT false,
  deviation_type text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_flow_events_account_type_chk CHECK (account_type IN ('existing','new','unknown')),
  CONSTRAINT oauth_flow_events_state_chk CHECK (state_result IN ('ok','missing','mismatch','not_applicable')),
  CONSTRAINT oauth_flow_events_nonce_chk CHECK (nonce_result IN ('ok','missing','mismatch','not_applicable'))
);

CREATE INDEX oauth_flow_events_request_idx ON public.oauth_flow_events (request_id, hop_index);
CREATE INDEX oauth_flow_events_created_idx ON public.oauth_flow_events (created_at DESC);
CREATE INDEX oauth_flow_events_deviation_idx ON public.oauth_flow_events (deviation) WHERE deviation;

-- Server-side redaction: strip credentials from every stored URL / note / metadata.
CREATE OR REPLACE FUNCTION public.redact_oauth_flow_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  NEW.source_url := public.redact_oauth_url(NEW.source_url);
  NEW.destination_url := public.redact_oauth_url(NEW.destination_url);
  NEW.final_url := public.redact_oauth_url(NEW.final_url);
  NEW.note := left(public.redact_oauth_url(NEW.note), 500);
  FOREACH k IN ARRAY ARRAY[
    'code','access_token','refresh_token','id_token','client_secret',
    'credential','assertion','token','password','session_state'
  ] LOOP
    IF NEW.metadata ? k THEN
      NEW.metadata := jsonb_set(NEW.metadata, ARRAY[k], '"[REDACTED]"'::jsonb);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER oauth_flow_events_redact
BEFORE INSERT OR UPDATE ON public.oauth_flow_events
FOR EACH ROW EXECUTE FUNCTION public.redact_oauth_flow_event();

GRANT INSERT ON public.oauth_flow_events TO anon, authenticated;
GRANT SELECT ON public.oauth_flow_events TO authenticated;
GRANT ALL ON public.oauth_flow_events TO service_role;

ALTER TABLE public.oauth_flow_events ENABLE ROW LEVEL SECURITY;

-- Sign-in telemetry is written before a session exists, so inserts are open;
-- nothing can be read back except by admins, and the trigger strips secrets.
CREATE POLICY "oauth_flow_events_insert_any_signin"
ON public.oauth_flow_events FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "oauth_flow_events_admin_read"
ON public.oauth_flow_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));