-- ============================================================
-- ATHLETIC CHALLENGE — v16
-- Refuerzo de reinicios, permisos y enlaces de vídeo.
-- Ejecutar después de migration-v15.sql.
-- ============================================================

-- Un reinicio deja una marca que permite descartar escrituras offline antiguas.
create table if not exists public.activity_reset_cutoffs (
  scope text primary key,
  cutoff_at timestamptz not null default clock_timestamp(),
  constraint activity_reset_cutoffs_scope_check
    check (scope = 'global' or scope ~ '^campaign:[0-9a-f-]{36}$')
);

alter table public.activity_reset_cutoffs enable row level security;
revoke all on public.activity_reset_cutoffs from public, anon, authenticated;

-- Los nombres de confirmación también se comprueban en Postgres. Se eliminan
-- las firmas antiguas para que no quede una ruta RPC sin confirmación.
drop function if exists public.admin_set_campaign_start(uuid, date, date);
create function public.admin_set_campaign_start(
  target_campaign_id uuid,
  new_start date,
  new_end date,
  confirmation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_name text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  select name into campaign_name
  from public.campaigns
  where id = target_campaign_id;

  if not found then raise exception 'Campaign not found.'; end if;
  if confirmation is distinct from campaign_name then
    raise exception 'Confirmation phrase does not match.';
  end if;
  if new_end < new_start then
    raise exception 'The end date must be on or after the start date.';
  end if;

  update public.campaigns
  set starts_on = new_start, ends_on = new_end, updated_at = now()
  where id = target_campaign_id;

  update public.challenges
  set started_on = new_start
  where campaign_id = target_campaign_id;
end;
$$;

revoke all on function public.admin_set_campaign_start(uuid, date, date, text) from public, anon;
grant execute on function public.admin_set_campaign_start(uuid, date, date, text) to authenticated;

drop function if exists public.admin_reset_campaign_activity(uuid);
create function public.admin_reset_campaign_activity(
  target_campaign_id uuid,
  confirmation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_name text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  select name into campaign_name
  from public.campaigns
  where id = target_campaign_id;

  if not found then raise exception 'Campaign not found.'; end if;
  if confirmation is distinct from campaign_name then
    raise exception 'Confirmation phrase does not match.';
  end if;

  delete from public.entries
  where challenge_id in (
    select id from public.challenges where campaign_id = target_campaign_id
  );

  delete from public.group_checkins
  where challenge_id in (
    select id from public.challenges where campaign_id = target_campaign_id
  );

  insert into public.activity_reset_cutoffs (scope, cutoff_at)
  values ('campaign:' || target_campaign_id::text, clock_timestamp())
  on conflict (scope) do update set cutoff_at = excluded.cutoff_at;
end;
$$;

revoke all on function public.admin_reset_campaign_activity(uuid, text) from public, anon;
grant execute on function public.admin_reset_campaign_activity(uuid, text) to authenticated;

create or replace function public.admin_reset_all_activity(confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if confirmation <> 'RESET ALL ACTIVITY' then
    raise exception 'Confirmation phrase does not match.';
  end if;

  delete from public.entries;
  delete from public.group_checkins;
  delete from public.training_sets;
  delete from public.training_sessions;
  delete from public.swim_sessions;
  delete from public.body_metrics;

  insert into public.activity_reset_cutoffs (scope, cutoff_at)
  values ('global', clock_timestamp())
  on conflict (scope) do update set cutoff_at = excluded.cutoff_at;
end;
$$;

revoke all on function public.admin_reset_all_activity(text) from public, anon;
grant execute on function public.admin_reset_all_activity(text) to authenticated;

-- Toda sincronización offline pasa por el servidor. Si el cambio se creó antes
-- de un reinicio aplicable, se descarta en lugar de recrear la fila borrada.
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
  mutation_campaign_id uuid;
  mutation_challenge_owner uuid;
  mutation_challenge_visibility text;
  reset_cutoff timestamptz;
  server_updated_at timestamptz;
begin
  if current_user_id is null or not coalesce(public.is_active_member(), false) then
    raise exception 'Active membership required.' using errcode = '42501';
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
    select campaign_id, owner_id, visibility
    into mutation_campaign_id, mutation_challenge_owner, mutation_challenge_visibility
    from public.challenges
    where id = mutation_challenge_id;

    if not found then return false; end if;
    if mutation_challenge_visibility = 'private'
      and mutation_challenge_owner is distinct from current_user_id then
      return false;
    end if;

    if mutation_campaign_id is not null then
      select cutoff_at into reset_cutoff
      from public.activity_reset_cutoffs
      where scope = 'campaign:' || mutation_campaign_id::text;

      if reset_cutoff is not null and mutation_queued_at <= reset_cutoff then
        return false;
      end if;
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

-- El grant amplio de v7 anulaba la protección por columna añadida después.
revoke insert, update on public.challenges from authenticated;
grant insert (
  id, campaign_id, name, kind, config, active, sort_order, category,
  started_on, owner_id, visibility
) on public.challenges to authenticated;
grant update (
  name, kind, config, active, sort_order, category, started_on
) on public.challenges to authenticated;

-- Los enlaces nuevos quedan limitados a los tres proveedores que se embeben.
alter table public.videos drop constraint if exists videos_allowed_host_check;
alter table public.videos add constraint videos_allowed_host_check check (
  url ~* '^https?://((www|m|music)\.youtube\.com|youtu\.be|(www|player)\.vimeo\.com|drive\.google\.com)([/:?#]|$)'
) not valid;
