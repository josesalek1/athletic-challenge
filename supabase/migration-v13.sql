-- ============================================================
-- ATHLETIC CHALLENGE — v13
-- Hábitos privados sobre la infraestructura de retos existente.
-- Ejecutar después de migration-v12.sql.
-- ============================================================

alter table public.challenges
  add column if not exists owner_id uuid references auth.users on delete cascade,
  add column if not exists visibility text not null default 'group';

alter table public.challenges drop constraint if exists challenges_visibility_check;
alter table public.challenges add constraint challenges_visibility_check
  check (visibility in ('group', 'private'));

alter table public.challenges drop constraint if exists challenges_owner_matches_visibility;
alter table public.challenges add constraint challenges_owner_matches_visibility
  check (
    (visibility = 'private' and owner_id is not null)
    or (visibility = 'group' and owner_id is null)
  );

alter table public.challenges alter column campaign_id drop not null;

create index if not exists challenges_owner_idx
  on public.challenges (owner_id) where owner_id is not null;

-- CRÍTICO: un hábito privado nunca genera check-in compartido.
create or replace function public.sync_group_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_kind text;
  challenge_config jsonb;
  challenge_visibility text;
begin
  if tg_op = 'DELETE' then
    delete from public.group_checkins
    where user_id = old.user_id
      and challenge_id = old.challenge_id
      and day = old.day;
    return old;
  end if;

  select kind, config, visibility
  into challenge_kind, challenge_config, challenge_visibility
  from public.challenges
  where id = new.challenge_id;

  if challenge_visibility is distinct from 'group' then
    delete from public.group_checkins
    where user_id = new.user_id
      and challenge_id = new.challenge_id
      and day = new.day;
    return new;
  end if;

  if private.entry_has_progress(challenge_kind, challenge_config, new.payload) then
    insert into public.group_checkins (user_id, challenge_id, day, goal_met)
    values (
      new.user_id, new.challenge_id, new.day,
      private.challenge_goal_met(challenge_kind, challenge_config, new.payload)
    )
    on conflict (user_id, challenge_id, day) do update
    set goal_met = excluded.goal_met, updated_at = now();
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

drop policy if exists "active members read challenges" on public.challenges;
create policy "members read group and own challenges" on public.challenges
  for select to authenticated
  using (
    (select public.is_active_member())
    and (visibility = 'group' or owner_id = (select auth.uid()))
  );

drop policy if exists "members create own habits" on public.challenges;
create policy "members create own habits" on public.challenges
  for insert to authenticated
  with check (
    (select public.is_active_member())
    and visibility = 'private'
    and owner_id = (select auth.uid())
  );

drop policy if exists "members update own habits" on public.challenges;
create policy "members update own habits" on public.challenges
  for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_member()))
  with check (owner_id = (select auth.uid()) and visibility = 'private');

drop policy if exists "members delete own habits" on public.challenges;
create policy "members delete own habits" on public.challenges
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and visibility = 'private'
    and (select public.is_active_member())
  );

grant insert (id, name, kind, config, active, sort_order, category,
              started_on, owner_id, visibility) on public.challenges to authenticated;
grant update (name, config, active, sort_order, started_on) on public.challenges
  to authenticated;

-- Limpieza del feed social. Ejecuta primero esta comprobación y solo
-- continúa si ambas cuentas son cero:
--   select (select count(*) from video_reactions), (select count(*) from video_comments);
drop table if exists public.video_comments;
drop table if exists public.video_reactions;
drop function if exists public.admin_moderate_video_comment(uuid, boolean);
