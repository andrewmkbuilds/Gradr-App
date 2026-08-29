create or replace function public.set_analytics_event_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Client-side telemetry sometimes posts before the auth session has hydrated,
  -- leaving user_id null on rows from signed-in users. Attribute server-side.
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

revoke execute on function public.set_analytics_event_user() from public, anon, authenticated;

drop trigger if exists trg_set_analytics_event_user on public.analytics_events;
create trigger trg_set_analytics_event_user
  before insert on public.analytics_events
  for each row execute function public.set_analytics_event_user();