-- Sched Lane live-sync backend: run this once in your Supabase project's
-- SQL editor (Dashboard → SQL Editor → New query → paste → Run).
--
-- Security model: the group code is the capability. The table itself is not
-- readable or writable with the public anon key (RLS enabled, no policies),
-- so nobody can list groups. All access goes through the two SECURITY
-- DEFINER functions below, which require knowing a specific code. Codes are
-- generated client-side with ~120 bits of randomness.

create table if not exists public.sched_lane_groups (
  code text primary key check (length(code) between 16 and 64),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  -- Keep blobs sane; a real group is a few hundred KB at most.
  constraint state_size check (pg_column_size(state) < 1048576)
);

alter table public.sched_lane_groups enable row level security;
revoke all on table public.sched_lane_groups from anon, authenticated;

create or replace function public.get_group(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select state from public.sched_lane_groups where code = p_code;
$$;

create or replace function public.save_group(p_code text, p_state jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sched_lane_groups as g (code, state, updated_at)
  values (p_code, p_state, now())
  on conflict (code)
  do update set state = excluded.state, updated_at = now();
$$;

grant execute on function public.get_group(text) to anon;
grant execute on function public.save_group(text, jsonb) to anon;

-- Optional housekeeping: delete groups untouched for 90 days. Requires the
-- pg_cron extension (Dashboard → Database → Extensions → enable pg_cron),
-- then uncomment:
--
-- select cron.schedule('sched-lane-prune', '0 4 * * *',
--   $$delete from public.sched_lane_groups
--     where updated_at < now() - interval '90 days'$$);
