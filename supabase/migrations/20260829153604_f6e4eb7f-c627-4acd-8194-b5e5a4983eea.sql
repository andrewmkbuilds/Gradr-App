alter table public.voice_provider_events
  add column if not exists latency_ms integer,
  add column if not exists provider text,
  add column if not exists cache_hit boolean not null default false;

create index if not exists voice_provider_events_created_idx
  on public.voice_provider_events (created_at desc);
create index if not exists voice_provider_events_persona_idx
  on public.voice_provider_events (persona_id, created_at desc);

create table if not exists public.voice_audio_cache (
  cache_key text primary key,
  persona_id text not null,
  voice_id text not null,
  provider text not null,
  storage_path text not null,
  byte_size integer not null default 0,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

grant all on public.voice_audio_cache to service_role;
alter table public.voice_audio_cache enable row level security;

create index if not exists voice_audio_cache_last_used_idx
  on public.voice_audio_cache (last_used_at desc);

create or replace function public.touch_voice_audio_cache(_cache_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.voice_audio_cache
     set hits = hits + 1,
         last_used_at = now()
   where cache_key = _cache_key;
$$;

revoke all on function public.touch_voice_audio_cache(text) from public, anon, authenticated;
grant execute on function public.touch_voice_audio_cache(text) to service_role;