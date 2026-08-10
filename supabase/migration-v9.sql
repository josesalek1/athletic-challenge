-- ============================================================
-- ATHLETIC CHALLENGE — v9
-- Invitation-only membership. Public group-code registration is retired.
-- Run after migration-v8.sql.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invited public.allowed_emails%rowtype;
begin
  select * into invited
  from public.allowed_emails
  where lower(email) = lower(new.email);

  if not found then
    raise exception 'An administrator invitation is required.';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, invited.display_name);

  -- Remove credentials from the retired registration flow if an older client
  -- still sends them. Membership is now controlled only by the allow-list.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'invite_code'
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.admin_update_invite_code(text) from authenticated;
