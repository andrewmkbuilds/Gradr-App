ALTER TABLE public.subscribers DROP CONSTRAINT IF EXISTS subscribers_user_id_key;
ALTER TABLE public.subscribers ADD CONSTRAINT subscribers_user_id_environment_key UNIQUE (user_id, environment);

ALTER TABLE public.usage_credits DROP CONSTRAINT IF EXISTS usage_credits_user_id_key;
ALTER TABLE public.usage_credits ADD CONSTRAINT usage_credits_user_id_environment_key UNIQUE (user_id, environment);