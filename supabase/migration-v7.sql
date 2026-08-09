-- ============================================================
-- ATHLETIC CHALLENGE — v7
-- In-app administration secured by database-level admin checks.
-- Run after migration-v6.sql.
-- ============================================================

-- The client can ask whether the current user is an active administrator,
-- but it can never choose the answer itself.
create or replace function public.is_admin()
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
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Auth emails live outside public tables. This function exposes them only to
-- active admins and returns the minimum fields needed by the member screen.
create or replace function public.admin_list_members()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  active boolean,
  created_at timestamptz
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
         profile.created_at
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  order by profile.active desc, lower(profile.display_name);
end;
$$;

revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

create or replace function public.admin_update_member(
  target_user_id uuid,
  new_display_name text,
  new_role text,
  new_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := trim(coalesce(new_display_name, ''));
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if length(clean_name) < 2 or length(clean_name) > 50 then
    raise exception 'Display name must contain between 2 and 50 characters.';
  end if;

  if new_role not in ('member', 'admin') then
    raise exception 'Invalid role.';
  end if;

  -- The signed-in admin cannot accidentally lock themselves out.
  if target_user_id = (select auth.uid()) and (new_role <> 'admin' or not new_active) then
    raise exception 'You cannot remove your own administrator access.';
  end if;

  update public.profiles
  set display_name = clean_name,
      role = new_role,
      active = new_active
  where id = target_user_id;

  if not found then
    raise exception 'Member not found.';
  end if;
end;
$$;

revoke all on function public.admin_update_member(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_update_member(uuid, text, text, boolean) to authenticated;

-- The plain registration code is never stored. Only its SHA-256 fingerprint
-- replaces the previous fingerprint.
create or replace function public.admin_update_invite_code(new_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_code text := trim(coalesce(new_code, ''));
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if length(clean_code) < 8 or length(clean_code) > 64 then
    raise exception 'The group code must contain between 8 and 64 characters.';
  end if;

  insert into public.registration_settings (id, invite_code_hash, updated_at)
  values (true, encode(extensions.digest(clean_code, 'sha256'), 'hex'), now())
  on conflict (id) do update
  set invite_code_hash = excluded.invite_code_hash,
      updated_at = now();
end;
$$;

revoke all on function public.admin_update_invite_code(text) from public, anon;
grant execute on function public.admin_update_invite_code(text) to authenticated;

-- Active members retain read-only access. These additional policies permit
-- mutations only when is_admin() is true.
drop policy if exists "admins create challenges" on public.challenges;
drop policy if exists "admins update challenges" on public.challenges;
create policy "admins create challenges" on public.challenges
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "admins update challenges" on public.challenges
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "admins create videos" on public.videos;
drop policy if exists "admins update videos" on public.videos;
drop policy if exists "admins delete videos" on public.videos;
create policy "admins create videos" on public.videos
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "admins update videos" on public.videos
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins delete videos" on public.videos
  for delete to authenticated
  using ((select public.is_admin()));

grant insert, update on public.challenges to authenticated;
grant insert, update, delete on public.videos to authenticated;

