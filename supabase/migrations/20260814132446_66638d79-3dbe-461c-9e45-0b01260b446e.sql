revoke all on function public.academic_domain_status(text) from public, anon, authenticated;
grant execute on function public.academic_domain_status(text) to service_role;