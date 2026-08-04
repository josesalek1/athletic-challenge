-- ============================================================
-- LANE 5 — esquema completo
-- Pégalo entero en Supabase Studio > SQL Editor > Run.
-- Es idempotente: puedes volver a ejecutarlo sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LISTA BLANCA
-- Sin esto, cualquiera con el enlace puede pedir un magic link
-- y entrar. Con esto, solo los 5 correos que tú metas.
-- ------------------------------------------------------------
create table if not exists allowed_emails (
  email text primary key,
  display_name text not null,
  added_at timestamptz not null default now()
);

-- >>> CAMBIA ESTOS 5 CORREOS ANTES DE EJECUTAR <<<
insert into allowed_emails (email, display_name) values
  ('tu@correo.com',      'Tú'),
  ('marco@correo.com',   'Marco'),
  ('amigo3@correo.com',  'Amigo 3'),
  ('amigo4@correo.com',  'Amigo 4'),
  ('amigo5@correo.com',  'Amigo 5')
on conflict (email) do nothing;

-- ------------------------------------------------------------
-- 2. PERFILES
-- ------------------------------------------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- Al registrarse: se crea el perfil solo si el correo está en la lista.
-- Si no lo está, el registro falla y el usuario nunca existe.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  allowed allowed_emails%rowtype;
begin
  select * into allowed from allowed_emails where email = new.email;

  if not found then
    raise exception 'Este correo no pertenece al grupo.';
  end if;

  insert into profiles (id, display_name)
  values (new.id, allowed.display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------
-- 3. CATÁLOGO DE CHALLENGES
-- kind decide qué UI se pinta: reloj, contador o checklist.
-- Para añadir el challenge 6 solo insertas una fila. Sin migración.
-- ------------------------------------------------------------
create table if not exists challenges (
  id         text primary key,
  name       text not null,
  kind       text not null check (kind in ('timed', 'reps', 'checklist')),
  config     jsonb not null default '{}',
  active     boolean not null default true,
  sort_order int not null default 0,
  started_on date not null default current_date  -- para numerar "Día 27"
);

alter table challenges add column if not exists started_on date not null default current_date;

insert into challenges (id, name, kind, config, active, sort_order, started_on) values
  ('plank',   'Plancha 3 min',   'timed',  '{"target_s": 180}',  false, 1, '2025-12-01'),
  ('biceps',  'Curl bíceps x25', 'reps',   '{"target": 25}',     false, 2, '2026-01-15'),
  ('pushups', 'Flexiones x25',   'reps',   '{"target": 25}',     false, 3, '2026-03-01'),
  ('tabata',  'TABATA core',     'timed',  '{"work_s": 20, "rest_s": 10, "rounds": 8}', false, 4, '2026-05-01'),
  ('yogic',   'Reto yóguico',    'checklist',
     '{"items": [
        {"n": 1, "key": "pranayama", "name": "Pranayama",       "hint": "5 min al amanecer, antes del café"},
        {"n": 2, "key": "surya",     "name": "Surya Namaskar",  "hint": "10 min de saludos al sol"},
        {"n": 3, "key": "mauna",     "name": "Mauna",           "hint": "Una comida sin pantallas"},
        {"n": 4, "key": "prakriti",  "name": "Naturaleza",      "hint": "20 min fuera"},
        {"n": 5, "key": "nidra",     "name": "Yoga Nidra",      "hint": "20 min de descanso guiado"},
        {"n": 6, "key": "sangha",    "name": "Sangha",          "hint": "Una conversación cara a cara"},
        {"n": 7, "key": "viparita",  "name": "Viparita Karani", "hint": "10 min piernas en la pared"}
      ], "daily_goal": 3}', true, 5, '2026-07-09')
on conflict (id) do update
  set name = excluded.name,
      kind = excluded.kind,
      config = excluded.config,
      sort_order = excluded.sort_order,
      started_on = excluded.started_on;

-- ------------------------------------------------------------
-- 4. REGISTROS DIARIOS (compartidos con el grupo)
-- Una fila por persona / challenge / día. payload es jsonb:
--   timed     -> {"seconds": 187}
--   reps      -> {"reps": 25}
--   checklist -> {"done": ["pranayama", "surya", "nidra"]}
-- ------------------------------------------------------------
create table if not exists entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  challenge_id text not null references challenges on delete cascade,
  day          date not null default current_date,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, challenge_id, day)
);

create index if not exists entries_day_idx on entries (day desc);

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists entries_touch on entries;
create trigger entries_touch before update on entries
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------
-- 5. NATACIÓN (privado — solo tú)
-- Tabla aparte a propósito. La privacidad vive en la política,
-- no en el frontend.
-- ------------------------------------------------------------
create table if not exists swim_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  day        date not null default current_date,
  distance_m int,
  duration_s int,
  stroke     text,
  rpe        int check (rpe between 1 and 10),
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists swim_user_day_idx on swim_sessions (user_id, day desc);

-- ------------------------------------------------------------
-- 6. VÍDEOS DEL ENTRENADOR
-- url = enlace de YouTube "no listado" o Drive. No alojamos nada.
-- ------------------------------------------------------------
create table if not exists videos (
  id           uuid primary key default gen_random_uuid(),
  challenge_id text references challenges on delete set null,
  title        text not null,
  url          text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- Sin esto, la tabla de natación es pública. Con esto, Postgres
-- devuelve cero filas aunque alguien manipule el cliente.
-- ============================================================
alter table profiles      enable row level security;
alter table challenges    enable row level security;
alter table entries       enable row level security;
alter table swim_sessions enable row level security;
alter table videos        enable row level security;
alter table allowed_emails enable row level security;
-- allowed_emails: sin ninguna política = nadie la lee desde el cliente.
-- El trigger la consulta con security definer, así que sigue funcionando.

-- PERFILES: todo el grupo se ve entre sí; cada uno edita el suyo.
drop policy if exists "perfiles visibles para el grupo" on profiles;
create policy "perfiles visibles para el grupo" on profiles
  for select to authenticated using (true);

drop policy if exists "edito mi perfil" on profiles;
create policy "edito mi perfil" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- CHALLENGES y VÍDEOS: solo lectura. Se administran desde Supabase Studio.
drop policy if exists "challenges legibles" on challenges;
create policy "challenges legibles" on challenges
  for select to authenticated using (true);

drop policy if exists "videos legibles" on videos;
create policy "videos legibles" on videos
  for select to authenticated using (true);

-- ENTRIES: todos leen todo (es un reto en grupo),
-- pero cada uno solo escribe lo suyo.
drop policy if exists "registros visibles para el grupo" on entries;
create policy "registros visibles para el grupo" on entries
  for select to authenticated using (true);

drop policy if exists "creo mis registros" on entries;
create policy "creo mis registros" on entries
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "edito mis registros" on entries;
create policy "edito mis registros" on entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "borro mis registros" on entries;
create policy "borro mis registros" on entries
  for delete to authenticated using (user_id = auth.uid());

-- NATACIÓN: una sola política para las cuatro operaciones.
-- Nadie más que el dueño ve una sola fila.
drop policy if exists "la natacion es privada" on swim_sessions;
create policy "la natacion es privada" on swim_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- 8. VISTA DE LA SEMANA
-- security_invoker = las políticas RLS del que consulta siguen
-- aplicando. Sin esto, una vista puede filtrar datos privados.
-- ------------------------------------------------------------
create or replace view week_board
with (security_invoker = on) as
select
  p.id            as user_id,
  p.display_name,
  e.challenge_id,
  e.day,
  e.payload
from profiles p
left join entries e
  on e.user_id = p.id
 and e.day >= current_date - interval '6 days';

-- ============================================================
-- COMPROBACIÓN
-- Ejecuta esto después. Las 6 tablas deben salir con rls = true.
-- ============================================================
-- select relname, relrowsecurity as rls
--   from pg_class
--  where relname in ('profiles','challenges','entries',
--                    'swim_sessions','videos','allowed_emails');
