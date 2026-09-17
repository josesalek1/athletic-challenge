-- ATHLETIC CHALLENGE — v17: uso personal.
-- Ejecutar una sola vez después de migration-v16.sql.
-- IMPORTANTE: sustituir CHANGE_OWNER_EMAIL antes de ejecutar.
-- Esta migración elimina las otras cuentas de Auth y sus datos por CASCADE.
-- El propietario conserva sus entradas, entrenamientos, métricas y vídeos.
begin;

do $$
declare
  owner_email text := 'CHANGE_OWNER_EMAIL';
  owner_user_id uuid;
begin
  if owner_email = 'CHANGE_OWNER_EMAIL' then
    raise exception 'Set owner_email in migration-v17.sql before running it.';
  end if;
  select id into owner_user_id from auth.users where lower(email) = lower(owner_email);
  if owner_user_id is null then
    raise exception 'Owner account % does not exist in auth.users.', owner_email;
  end if;
  if not exists (select 1 from public.profiles where id = owner_user_id) then
    raise exception 'The owner account has no profile.';
  end if;

  -- El catálogo y la biblioteca compartidos pasan a ser del propietario.
  update public.challenges set owner_id = owner_user_id where owner_id is null;
  update public.challenges set visibility = 'private';
  update public.videos set created_by = owner_user_id;
  update public.videos set status = 'published';

  -- La eliminación en Auth hace cascada sobre datos personales ajenos.
  delete from auth.users where id <> owner_user_id;
end;
$$;

-- Cerrar el alta de nuevas cuentas. El magic link del propietario sigue activo.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
create function public.reject_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'Athletic Challenge is a personal account.' using errcode = '42501';
end;
$$;
revoke all on function public.reject_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.reject_new_user();

-- Retirar la capa compartida y los RPC administrativos.
drop view if exists public.week_board;
drop trigger if exists entries_sync_group_checkin on public.entries;
drop function if exists public.sync_group_checkin();
drop table if exists public.group_checkins;
drop function if exists private.challenge_goal_met(text, jsonb, jsonb);
drop function if exists private.entry_has_progress(text, jsonb, jsonb);
drop function if exists private.checklist_count(jsonb, jsonb);

drop function if exists public.admin_set_campaign_start(uuid, date, date, text);
drop function if exists public.admin_reset_campaign_activity(uuid, text);
drop function if exists public.admin_reset_all_activity(text);
drop function if exists public.admin_create_campaign(text, text, date, date, boolean);
drop function if exists public.admin_update_campaign(uuid, text, text, date, date, boolean);
drop function if exists public.admin_moderate_video(uuid, boolean);
drop function if exists public.admin_list_members();
drop function if exists public.admin_update_member(uuid, text, text, boolean);
drop function if exists public.admin_prepare_invitation(text, text);
drop function if exists public.admin_delete_member(uuid);
drop function if exists public.admin_update_invite_code(text);

-- Las políticas anteriores referencian is_active_member(), así que se
-- sustituyen antes de retirar la función.
do $$
declare
  row_policy record;
begin
  for row_policy in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'challenges', 'entries', 'videos',
        'training_sessions', 'training_sets', 'swim_sessions', 'body_metrics')
  loop
    execute format('drop policy %I on %I.%I',
      row_policy.policyname, row_policy.schemaname, row_policy.tablename);
  end loop;
end;
$$;
drop function if exists public.is_admin();

alter table public.challenges drop constraint if exists challenges_owner_matches_visibility;
alter table public.challenges drop constraint if exists challenges_visibility_check;
alter table public.challenges drop column if exists visibility;
alter table public.challenges drop column if exists campaign_id;
alter table public.challenges alter column owner_id set not null;
drop table if exists public.campaigns;
drop function if exists public.is_active_member();

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop column if exists role;
alter table public.profiles drop column if exists active;
drop table if exists public.allowed_emails;
drop table if exists public.registration_settings;

-- Se conservan los cambios offline del propietario y el corte global previo.
delete from public.activity_reset_cutoffs where scope <> 'global';
alter table public.activity_reset_cutoffs
  drop constraint if exists activity_reset_cutoffs_scope_check;
alter table public.activity_reset_cutoffs
  add constraint activity_reset_cutoffs_scope_check check (scope = 'global');

-- RLS por propietario, sin roles ni comprobaciones de membresía.
create policy "owner profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "owner update profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "owner challenges" on public.challenges
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "owner entries" on public.entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "owner videos" on public.videos
  for all to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
create policy "owner training sessions" on public.training_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "owner training sets" on public.training_sets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "owner swim sessions" on public.swim_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "owner body metrics" on public.body_metrics
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.challenges, public.videos from anon;
grant select, insert, update, delete on public.challenges, public.videos to authenticated;

-- La función SECURITY DEFINER comprueba auth.uid y la propiedad del reto.
create or replace function public.sync_offline_mutation(
  mutation_kind text,
  mutation_data jsonb,
  mutation_queued_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  mutation_user_id uuid;
  mutation_challenge_id text;
  mutation_challenge_owner uuid;
  reset_cutoff timestamptz;
  server_updated_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if mutation_queued_at is null then
    raise exception 'The queued timestamp is required.';
  end if;

  mutation_user_id := nullif(mutation_data ->> 'user_id', '')::uuid;
  if mutation_user_id is distinct from current_user_id then
    raise exception 'A mutation can only be synced by its owner.' using errcode = '42501';
  end if;

  select cutoff_at into reset_cutoff
  from public.activity_reset_cutoffs
  where scope = 'global';

  if reset_cutoff is not null and mutation_queued_at <= reset_cutoff then
    return false;
  end if;

  if mutation_kind = 'entry' then
    mutation_challenge_id := mutation_data ->> 'challenge_id';
    select owner_id
    into mutation_challenge_owner
    from public.challenges
    where id = mutation_challenge_id;

    if not found then return false; end if;
    if mutation_challenge_owner is distinct from current_user_id then
      return false;
    end if;

    select updated_at into server_updated_at
    from public.entries
    where user_id = current_user_id
      and challenge_id = mutation_challenge_id
      and day = (mutation_data ->> 'day')::date;

    if server_updated_at is not null and server_updated_at > mutation_queued_at then
      return false;
    end if;

    insert into public.entries (user_id, challenge_id, day, payload)
    values (
      current_user_id,
      mutation_challenge_id,
      (mutation_data ->> 'day')::date,
      coalesce(mutation_data -> 'payload', '{}'::jsonb)
    )
    on conflict (user_id, challenge_id, day)
    do update set payload = excluded.payload;

  elsif mutation_kind = 'training_set' then
    select updated_at into server_updated_at
    from public.training_sets
    where user_id = current_user_id
      and day = (mutation_data ->> 'day')::date
      and slot = mutation_data ->> 'slot'
      and exercise_key = mutation_data ->> 'exercise_key'
      and set_index = (mutation_data ->> 'set_index')::integer;

    if server_updated_at is not null and server_updated_at > mutation_queued_at then
      return false;
    end if;

    insert into public.training_sets (
      user_id, day, slot, exercise_key, set_index, weight_kg, reps, seconds
    ) values (
      current_user_id,
      (mutation_data ->> 'day')::date,
      mutation_data ->> 'slot',
      mutation_data ->> 'exercise_key',
      (mutation_data ->> 'set_index')::integer,
      nullif(mutation_data ->> 'weight_kg', '')::numeric,
      nullif(mutation_data ->> 'reps', '')::integer,
      nullif(mutation_data ->> 'seconds', '')::integer
    )
    on conflict (user_id, day, slot, exercise_key, set_index)
    do update set
      weight_kg = excluded.weight_kg,
      reps = excluded.reps,
      seconds = excluded.seconds;

  elsif mutation_kind = 'training_session' then
    select updated_at into server_updated_at
    from public.training_sessions
    where user_id = current_user_id
      and day = (mutation_data ->> 'day')::date
      and slot = mutation_data ->> 'slot';

    if server_updated_at is not null and server_updated_at > mutation_queued_at then
      return false;
    end if;

    insert into public.training_sessions (user_id, day, slot, done)
    values (
      current_user_id,
      (mutation_data ->> 'day')::date,
      mutation_data ->> 'slot',
      coalesce((mutation_data ->> 'done')::boolean, false)
    )
    on conflict (user_id, day, slot)
    do update set done = excluded.done;

  elsif mutation_kind = 'swim_session' then
    select updated_at into server_updated_at
    from public.swim_sessions
    where user_id = current_user_id
      and day = (mutation_data ->> 'day')::date;

    if server_updated_at is not null and server_updated_at > mutation_queued_at then
      return false;
    end if;

    insert into public.swim_sessions (
      user_id, day, distance_m, duration_s, stroke, rpe, notes
    ) values (
      current_user_id,
      (mutation_data ->> 'day')::date,
      nullif(mutation_data ->> 'distance_m', '')::integer,
      nullif(mutation_data ->> 'duration_s', '')::integer,
      nullif(mutation_data ->> 'stroke', ''),
      nullif(mutation_data ->> 'rpe', '')::integer,
      nullif(mutation_data ->> 'notes', '')
    )
    on conflict (user_id, day)
    do update set
      distance_m = excluded.distance_m,
      duration_s = excluded.duration_s,
      stroke = excluded.stroke,
      rpe = excluded.rpe,
      notes = excluded.notes;
  else
    raise exception 'Unsupported offline mutation type.';
  end if;

  return true;
end;
$$;

revoke all on function public.sync_offline_mutation(text, jsonb, timestamptz) from public, anon;
grant execute on function public.sync_offline_mutation(text, jsonb, timestamptz) to authenticated;

commit;
