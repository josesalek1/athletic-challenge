-- ATHLETIC CHALLENGE — v20: registro de repeticiones en reserva por serie.
-- Ejecutar una sola vez después de migration-v19.sql.
begin;

alter table public.training_sets
  add column rir smallint check (rir between 0 and 10);

-- Mantiene la cola offline compatible con el nuevo campo sin debilitar
-- las comprobaciones de propietario y de escrituras posteriores.
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
    select owner_id into mutation_challenge_owner
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
      user_id, day, slot, exercise_key, set_index, weight_kg, reps, seconds, rir
    ) values (
      current_user_id,
      (mutation_data ->> 'day')::date,
      mutation_data ->> 'slot',
      mutation_data ->> 'exercise_key',
      (mutation_data ->> 'set_index')::integer,
      nullif(mutation_data ->> 'weight_kg', '')::numeric,
      nullif(mutation_data ->> 'reps', '')::integer,
      nullif(mutation_data ->> 'seconds', '')::integer,
      nullif(mutation_data ->> 'rir', '')::smallint
    )
    on conflict (user_id, day, slot, exercise_key, set_index)
    do update set
      weight_kg = excluded.weight_kg,
      reps = excluded.reps,
      seconds = excluded.seconds,
      rir = excluded.rir;

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
