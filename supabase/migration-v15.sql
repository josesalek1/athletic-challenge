-- ============================================================
-- ATHLETIC CHALLENGE — v15
-- Reinicio de actividad y control de la fecha de inicio.
-- ============================================================

-- Fija el arranque de una campaña. Todos ven el mismo número de día,
-- entre quien entre y cuando entre.
create or replace function public.admin_set_campaign_start(
  target_campaign_id uuid,
  new_start date,
  new_end date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if new_end < new_start then
    raise exception 'The end date must be on or after the start date.';
  end if;

  update public.campaigns
  set starts_on = new_start, ends_on = new_end, updated_at = now()
  where id = target_campaign_id;

  if not found then raise exception 'Campaign not found.'; end if;

  update public.challenges
  set started_on = new_start
  where campaign_id = target_campaign_id;
end;
$$;

revoke all on function public.admin_set_campaign_start(uuid, date, date) from public, anon;
grant execute on function public.admin_set_campaign_start(uuid, date, date) to authenticated;

-- Borra la actividad de una campaña. No toca miembros, retos ni hábitos.
create or replace function public.admin_reset_campaign_activity(target_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  -- El trigger sobre entries limpia group_checkins en cascada.
  delete from public.entries
  where challenge_id in (
    select id from public.challenges where campaign_id = target_campaign_id
  );

  delete from public.group_checkins
  where challenge_id in (
    select id from public.challenges where campaign_id = target_campaign_id
  );
end;
$$;

revoke all on function public.admin_reset_campaign_activity(uuid) from public, anon;
grant execute on function public.admin_reset_campaign_activity(uuid) to authenticated;

-- Borra TODA la actividad de todos los miembros. Solo para dejar la app
-- limpia antes del arranque real. No borra miembros ni la definición de
-- los retos.
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
end;
$$;

revoke all on function public.admin_reset_all_activity(text) from public, anon;
grant execute on function public.admin_reset_all_activity(text) to authenticated;
