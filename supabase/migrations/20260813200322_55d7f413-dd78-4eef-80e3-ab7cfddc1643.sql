DELETE FROM public.career_plans a USING public.career_plans b
  WHERE a.user_id = b.user_id AND a.ctid < b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS career_plans_user_id_key ON public.career_plans (user_id);