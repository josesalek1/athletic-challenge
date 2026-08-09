-- ============================================================
-- ATHLETIC CHALLENGE — v6
-- Active members, protected roles, private results and group check-ins.
-- Run after migration-v5.sql.
-- ============================================================

-- 1. Membership and authorization live in a protected database row.
alter table public.profiles
  add column if not exists role text not null default 'member',
  add column if not exists active boolean not null default true;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('member', 'admin'));

update public.profiles
set role = 'admin'
where id in (
  select id from auth.users where lower(email) = 'jose.salek1@gmail.com'
);

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active = true
  );
$$;

revoke all on function public.is_active_member() from public, anon;
grant execute on function public.is_active_member() to authenticated;

-- 2. Exact challenge payloads stay private. The group reads only this summary.
create table if not exists public.group_checkins (
  user_id      uuid not null references auth.users on delete cascade,
  challenge_id text not null references public.challenges on delete cascade,
  day          date not null,
  goal_met     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, challenge_id, day)
);

create index if not exists group_checkins_day_idx
  on public.group_checkins (day desc);

alter table public.group_checkins enable row level security;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.checklist_count(config jsonb, payload jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(distinct selected.value)::integer
  from jsonb_array_elements_text(coalesce(payload -> 'done', '[]'::jsonb)) as selected(value)
  where selected.value in (
    select item ->> 'key'
    from jsonb_array_elements(coalesce(config -> 'items', '[]'::jsonb)) as item
  );
$$;

create or replace function private.entry_has_progress(kind text, config jsonb, payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case kind
    when 'timed' then coalesce(nullif(payload ->> 'seconds', '')::numeric, 0) > 0
    when 'reps' then coalesce(nullif(payload ->> 'reps', '')::numeric, 0) > 0
    when 'checklist' then private.checklist_count(config, payload) > 0
    when 'done' then coalesce((payload ->> 'ok')::boolean, false)
    else false
  end;
$$;

create or replace function private.challenge_goal_met(kind text, config jsonb, payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case kind
    when 'timed' then
      coalesce(nullif(payload ->> 'seconds', '')::numeric, 0) >=
      coalesce(nullif(config ->> 'target_s', '')::numeric, 1)
    when 'reps' then
      coalesce(nullif(payload ->> 'reps', '')::numeric, 0) >=
      coalesce(nullif(config ->> 'target', '')::numeric, 1)
    when 'checklist' then
      private.checklist_count(config, payload) >=
      coalesce(nullif(config ->> 'daily_goal', '')::integer, 3)
    when 'done' then coalesce((payload ->> 'ok')::boolean, false)
    else false
  end;
$$;

create or replace function public.sync_group_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_kind text;
  challenge_config jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.group_checkins
    where user_id = old.user_id
      and challenge_id = old.challenge_id
      and day = old.day;
    return old;
  end if;

  select kind, config
  into challenge_kind, challenge_config
  from public.challenges
  where id = new.challenge_id;

  if private.entry_has_progress(challenge_kind, challenge_config, new.payload) then
    insert into public.group_checkins (user_id, challenge_id, day, goal_met)
    values (
      new.user_id,
      new.challenge_id,
      new.day,
      private.challenge_goal_met(challenge_kind, challenge_config, new.payload)
    )
    on conflict (user_id, challenge_id, day) do update
    set goal_met = excluded.goal_met,
        updated_at = now();
  else
    delete from public.group_checkins
    where user_id = new.user_id
      and challenge_id = new.challenge_id
      and day = new.day;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_group_checkin() from public, anon, authenticated;

drop trigger if exists entries_sync_group_checkin on public.entries;
create trigger entries_sync_group_checkin
  after insert or update or delete on public.entries
  for each row execute function public.sync_group_checkin();

-- Backfill the existing history without exposing exact payloads.
insert into public.group_checkins (user_id, challenge_id, day, goal_met)
select
  entry.user_id,
  entry.challenge_id,
  entry.day,
  private.challenge_goal_met(challenge.kind, challenge.config, entry.payload)
from public.entries as entry
join public.challenges as challenge on challenge.id = entry.challenge_id
where private.entry_has_progress(challenge.kind, challenge.config, entry.payload)
on conflict (user_id, challenge_id, day) do update
set goal_met = excluded.goal_met,
    updated_at = now();

-- 3. RLS: active members can read shared summaries; exact data is owner-only.
drop policy if exists "perfiles visibles para el grupo" on public.profiles;
drop policy if exists "edito mi perfil" on public.profiles;
drop policy if exists "active members read profiles" on public.profiles;
drop policy if exists "members update own profile" on public.profiles;

create policy "active members read profiles" on public.profiles
  for select to authenticated
  using ((select public.is_active_member()));

create policy "members update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_member()))
  with check (id = (select auth.uid()) and (select public.is_active_member()));

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "registros visibles para el grupo" on public.entries;
drop policy if exists "creo mis registros" on public.entries;
drop policy if exists "edito mis registros" on public.entries;
drop policy if exists "borro mis registros" on public.entries;
drop policy if exists "members read own entries" on public.entries;
drop policy if exists "members create own entries" on public.entries;
drop policy if exists "members update own entries" on public.entries;
drop policy if exists "members delete own entries" on public.entries;

create policy "members read own entries" on public.entries
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));

create policy "members create own entries" on public.entries
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

create policy "members update own entries" on public.entries
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

create policy "members delete own entries" on public.entries
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));

drop policy if exists "active members read group checkins" on public.group_checkins;
create policy "active members read group checkins" on public.group_checkins
  for select to authenticated
  using ((select public.is_active_member()));

grant select on public.group_checkins to authenticated;
revoke insert, update, delete on public.group_checkins from authenticated, anon;

drop policy if exists "challenges legibles" on public.challenges;
drop policy if exists "active members read challenges" on public.challenges;
create policy "active members read challenges" on public.challenges
  for select to authenticated using ((select public.is_active_member()));

drop policy if exists "videos legibles" on public.videos;
drop policy if exists "active members read videos" on public.videos;
create policy "active members read videos" on public.videos
  for select to authenticated using ((select public.is_active_member()));

drop policy if exists "la natacion es privada" on public.swim_sessions;
drop policy if exists "active members manage own swim sessions" on public.swim_sessions;
create policy "active members manage own swim sessions" on public.swim_sessions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

drop policy if exists "el plan es privado" on public.training_sessions;
drop policy if exists "active members manage own training sessions" on public.training_sessions;
create policy "active members manage own training sessions" on public.training_sessions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

drop policy if exists "mis series son privadas" on public.training_sets;
drop policy if exists "active members manage own training sets" on public.training_sets;
create policy "active members manage own training sets" on public.training_sets
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

-- Keep the legacy view sanitized if anything still queries it.
drop view if exists public.week_board;
create view public.week_board
with (security_invoker = on) as
select
  profile.id as user_id,
  profile.display_name,
  checkin.challenge_id,
  checkin.day,
  checkin.goal_met
from public.profiles as profile
left join public.group_checkins as checkin on checkin.user_id = profile.id;

grant select on public.week_board to authenticated;

