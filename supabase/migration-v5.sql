-- ============================================================
-- ATHLETIC CHALLENGE — migración v5: registro con código interno
-- ============================================================

create extension if not exists pgcrypto;

-- La aplicación solo guarda la huella SHA-256 del código, nunca el código.
create table if not exists registration_settings (
  id               boolean primary key default true check (id),
  invite_code_hash text not null,
  updated_at       timestamptz not null default now()
);

alter table registration_settings enable row level security;

insert into registration_settings (id, invite_code_hash)
values (true, '428d8df3e75283966614bfd52c3040457e8e104c8051c46341497025943ec290')
on conflict (id) do update
set invite_code_hash = excluded.invite_code_hash,
    updated_at = now();

-- Los correos existentes siguen entrando normalmente. Un correo nuevo debe
-- aportar nombre y el código correcto; después queda añadido al grupo.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  allowed       allowed_emails%rowtype;
  display_name  text;
  provided_code text;
  expected_hash text;
begin
  select * into allowed
  from allowed_emails
  where lower(email) = lower(new.email);

  if found then
    display_name := allowed.display_name;
  else
    display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
    provided_code := coalesce(new.raw_user_meta_data ->> 'invite_code', '');

    select invite_code_hash into expected_hash
    from registration_settings
    where id = true;

    if expected_hash is null
       or encode(digest(provided_code, 'sha256'), 'hex') <> expected_hash then
      raise exception 'Código de registro inválido.';
    end if;

    if display_name = '' or length(display_name) > 50 then
      raise exception 'El nombre es obligatorio.';
    end if;

    insert into allowed_emails (email, display_name)
    values (lower(new.email), display_name)
    on conflict (email) do nothing;
  end if;

  insert into profiles (id, display_name)
  values (new.id, display_name);

  -- El código se usa una sola vez y no queda guardado en los metadatos.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'invite_code'
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

