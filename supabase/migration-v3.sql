-- ============================================================
-- LANE 5 — migración v3: registro de series (privado)
-- Ejecútala después de la v2.
-- ============================================================

create table if not exists training_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  day          date not null default current_date,
  slot         text not null,          -- 'gym', 'strength_a', …
  exercise_key text not null,          -- 'squat', 'bench', …
  set_index    int  not null,          -- 1, 2, 3…
  weight_kg    numeric(5,1),           -- null en ejercicios sin carga
  reps         int,
  seconds      int,                    -- plancha y plancha lateral
  created_at   timestamptz not null default now(),
  unique (user_id, day, slot, exercise_key, set_index)
);

create index if not exists sets_lookup_idx
  on training_sets (user_id, exercise_key, day desc);

alter table training_sets enable row level security;

drop policy if exists "mis series son privadas" on training_sets;
create policy "mis series son privadas" on training_sets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- La sesión terminada vive en training_sessions (creada en la v2).
alter table training_sessions add column if not exists done boolean not null default false;

-- Una sesión por día y hueco.
create unique index if not exists training_sessions_unique
  on training_sessions (user_id, day, slot);
