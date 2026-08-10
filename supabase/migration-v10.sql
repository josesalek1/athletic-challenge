-- ============================================================
-- ATHLETIC CHALLENGE — v10
-- Campaigns own a dated set of activities and preserve history.
-- Run after migration-v9.sql.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  description text not null default '' check (length(description) <= 500),
  starts_on date not null,
  ends_on date not null,
  duration_days integer generated always as (ends_on - starts_on + 1) stored,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_dates_valid check (ends_on >= starts_on)
);

create unique index if not exists campaigns_one_active
  on public.campaigns ((active)) where active;

alter table public.challenges
  add column if not exists campaign_id uuid references public.campaigns(id) on delete restrict;

-- Convert the previous flat challenge catalogue into a current campaign plus
-- one historical campaign for activities that were already archived.
do $$
declare
  current_campaign_id uuid;
  legacy_campaign_id uuid;
  campaign_start date;
  campaign_end date;
begin
  if not exists (select 1 from public.campaigns) then
    if exists (select 1 from public.challenges where active) then
      select coalesce(min(started_on), current_date)
      into campaign_start
      from public.challenges
      where active;

      campaign_end := greatest(campaign_start + 29, current_date);

      insert into public.campaigns (name, description, starts_on, ends_on, active)
      values (
        'Athletic Challenge',
        'The current group campaign, migrated from the original daily challenge.',
        campaign_start,
        campaign_end,
        true
      )
      returning id into current_campaign_id;

      update public.challenges
      set campaign_id = current_campaign_id
      where active;
    else
      insert into public.campaigns (name, description, starts_on, ends_on, active)
      values ('Athletic Challenge', 'The current group campaign.', current_date, current_date + 29, true)
      returning id into current_campaign_id;
    end if;

    if exists (select 1 from public.challenges where not active) then
      select coalesce(
        least(min(challenge.started_on), min(entry.day)),
        min(challenge.started_on),
        min(entry.day),
        current_date
      ),
      coalesce(
        greatest(max(challenge.started_on), max(entry.day)),
        max(challenge.started_on),
        max(entry.day),
        current_date
      )
      into campaign_start, campaign_end
      from public.challenges challenge
      left join public.entries entry on entry.challenge_id = challenge.id
      where not challenge.active;

      insert into public.campaigns (name, description, starts_on, ends_on, active)
      values (
        'Previous activities',
        'Historical activities saved before campaigns were introduced.',
        campaign_start,
        campaign_end,
        false
      )
      returning id into legacy_campaign_id;

      update public.challenges
      set campaign_id = legacy_campaign_id
      where not active;
    end if;
  end if;

  select id into current_campaign_id
  from public.campaigns
  where active
  limit 1;

  update public.challenges
  set campaign_id = current_campaign_id
  where campaign_id is null;
end;
$$;

alter table public.challenges alter column campaign_id set not null;
create index if not exists challenges_campaign_order
  on public.challenges (campaign_id, sort_order);

alter table public.campaigns enable row level security;

drop policy if exists "active members read campaigns" on public.campaigns;
create policy "active members read campaigns" on public.campaigns
  for select to authenticated
  using ((select public.is_active_member()));

grant select on public.campaigns to authenticated;
revoke insert, update, delete on public.campaigns from authenticated, anon;

create or replace function public.admin_create_campaign(
  new_name text,
  new_description text,
  new_starts_on date,
  new_ends_on date,
  make_active boolean default false
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.campaigns;
  clean_name text := trim(coalesce(new_name, ''));
  clean_description text := trim(coalesce(new_description, ''));
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if length(clean_name) < 2 or length(clean_name) > 80 then
    raise exception 'Campaign name must contain between 2 and 80 characters.';
  end if;
  if length(clean_description) > 500 then
    raise exception 'Campaign description cannot exceed 500 characters.';
  end if;
  if new_starts_on is null or new_ends_on is null or new_ends_on < new_starts_on then
    raise exception 'Campaign dates are invalid.';
  end if;

  make_active := make_active or not exists (select 1 from public.campaigns where active);
  if make_active then
    update public.campaigns set active = false, updated_at = now() where active;
  end if;

  insert into public.campaigns (name, description, starts_on, ends_on, active)
  values (clean_name, clean_description, new_starts_on, new_ends_on, make_active)
  returning * into created;

  return created;
end;
$$;

create or replace function public.admin_update_campaign(
  target_campaign_id uuid,
  new_name text,
  new_description text,
  new_starts_on date,
  new_ends_on date,
  make_active boolean
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.campaigns;
  updated public.campaigns;
  clean_name text := trim(coalesce(new_name, ''));
  clean_description text := trim(coalesce(new_description, ''));
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  select * into existing from public.campaigns where id = target_campaign_id;
  if not found then raise exception 'Campaign not found.'; end if;
  if existing.active and not make_active then
    raise exception 'Activate another campaign instead. One campaign must remain active.';
  end if;
  if length(clean_name) < 2 or length(clean_name) > 80 then
    raise exception 'Campaign name must contain between 2 and 80 characters.';
  end if;
  if length(clean_description) > 500 then
    raise exception 'Campaign description cannot exceed 500 characters.';
  end if;
  if new_starts_on is null or new_ends_on is null or new_ends_on < new_starts_on then
    raise exception 'Campaign dates are invalid.';
  end if;

  if make_active and not existing.active then
    update public.campaigns set active = false, updated_at = now() where active;
  end if;

  update public.campaigns
  set name = clean_name,
      description = clean_description,
      starts_on = new_starts_on,
      ends_on = new_ends_on,
      active = make_active,
      updated_at = now()
  where id = target_campaign_id
  returning * into updated;

  return updated;
end;
$$;

revoke all on function public.admin_create_campaign(text, text, date, date, boolean) from public, anon;
revoke all on function public.admin_update_campaign(uuid, text, text, date, date, boolean) from public, anon;
grant execute on function public.admin_create_campaign(text, text, date, date, boolean) to authenticated;
grant execute on function public.admin_update_campaign(uuid, text, text, date, date, boolean) to authenticated;

