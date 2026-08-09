-- ============================================================
-- ATHLETIC CHALLENGE — v8
-- Detailed progress, member administration and offline conflicts.
-- Run after migration-v7.sql.
-- ============================================================

-- Every offline-writeable table exposes a server timestamp. The client uses
-- it to keep the newest edit when the same record changed on two devices.
alter table public.training_sets add column if not exists updated_at timestamptz not null default now();
alter table public.training_sessions add column if not exists updated_at timestamptz not null default now();
alter table public.swim_sessions add column if not exists updated_at timestamptz not null default now();

drop trigger if exists training_sets_touch on public.training_sets;
create trigger training_sets_touch before update on public.training_sets
  for each row execute function public.touch_updated_at();
drop trigger if exists training_sessions_touch on public.training_sessions;
create trigger training_sessions_touch before update on public.training_sessions
  for each row execute function public.touch_updated_at();
drop trigger if exists swim_sessions_touch on public.swim_sessions;
create trigger swim_sessions_touch before update on public.swim_sessions
  for each row execute function public.touch_updated_at();

-- The current product records one consolidated swim per user and day.
create unique index if not exists swim_sessions_user_day_unique
  on public.swim_sessions (user_id, day);

-- Include sign-in and actual product activity in the private admin member list.
drop function if exists public.admin_list_members();
create function public.admin_list_members()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select profile.id,
         auth_user.email::text,
         profile.display_name,
         profile.role,
         profile.active,
         profile.created_at,
         auth_user.last_sign_in_at,
         greatest(
           profile.created_at,
           auth_user.last_sign_in_at,
           (select max(activity.at)
            from (
              select entry.updated_at as at from public.entries entry where entry.user_id = profile.id
              union all
              select training.updated_at from public.training_sessions training where training.user_id = profile.id
              union all
              select training_set.updated_at from public.training_sets training_set where training_set.user_id = profile.id
              union all
              select swim.updated_at from public.swim_sessions swim where swim.user_id = profile.id
            ) activity)
         ) as last_activity_at
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  order by profile.active desc, lower(profile.display_name);
end;
$$;

revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

-- Preparing an invitation is intentionally separate from sending the magic
-- link. Once allow-listed, the normal Supabase auth flow creates the account
-- and uses the existing transactional-email hook.
create or replace function public.admin_prepare_invitation(new_email text, new_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(coalesce(new_email, '')));
  clean_name text := trim(coalesce(new_display_name, ''));
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if length(clean_name) < 2 or length(clean_name) > 50 then
    raise exception 'Display name must contain between 2 and 50 characters.';
  end if;

  insert into public.allowed_emails (email, display_name)
  values (clean_email, clean_name)
  on conflict (email) do update set display_name = excluded.display_name;
end;
$$;

revoke all on function public.admin_prepare_invitation(text, text) from public, anon;
grant execute on function public.admin_prepare_invitation(text, text) to authenticated;

create or replace function public.admin_delete_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'You cannot delete your own account.';
  end if;

  select lower(email) into target_email from auth.users where id = target_user_id;
  if target_email is null then raise exception 'Member not found.'; end if;
  delete from auth.users where id = target_user_id;
  delete from public.allowed_emails where lower(email) = target_email;
end;
$$;

revoke all on function public.admin_delete_member(uuid) from public, anon;
grant execute on function public.admin_delete_member(uuid) to authenticated;
