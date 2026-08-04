-- ============================================================
-- LANE 5 — migración v2
-- Ejecútala entera en el SQL Editor. No borra nada de lo que ya tienes.
-- ============================================================

-- 1. Categoría: decide el color en el tablero de la semana.
alter table challenges add column if not exists category text
  not null default 'traditional'
  check (category in ('yogic', 'traditional'));

-- 2. Nuevo tipo: hecho / no hecho, sin número.
alter table challenges drop constraint if exists challenges_kind_check;
alter table challenges add constraint challenges_kind_check
  check (kind in ('timed', 'reps', 'checklist', 'done'));

-- 3. Los cinco retos activos, en inglés.
insert into challenges (id, name, kind, config, active, sort_order, category, started_on) values
  ('yogic', 'Yogic', 'checklist',
    '{"blurb": "Seven practices. Pick at least three.",
      "items": [
        {"n": 1, "key": "pranayama", "name": "Pranayama",       "hint": "5 min at sunrise, before coffee"},
        {"n": 2, "key": "surya",     "name": "Surya Namaskar",  "hint": "10 min of sun salutations"},
        {"n": 3, "key": "mauna",     "name": "Mauna",           "hint": "One meal, no screens"},
        {"n": 4, "key": "prakriti",  "name": "Nature",          "hint": "20 min outside"},
        {"n": 5, "key": "nidra",     "name": "Yoga Nidra",      "hint": "20 min of guided rest"},
        {"n": 6, "key": "sangha",    "name": "Sangha",          "hint": "One face-to-face conversation"},
        {"n": 7, "key": "viparita",  "name": "Viparita Karani", "hint": "10 min legs up the wall"}
      ], "daily_goal": 3}',
    true, 1, 'yogic', current_date),

  ('plank', 'Plank', 'timed',
    '{"target_s": 180, "blurb": "Hold as long as you can. Ribs down, glutes tight."}',
    true, 2, 'traditional', current_date),

  ('pushups', 'Pushups', 'reps',
    '{"target": 25, "blurb": "Chest to the floor. Rotate variations week to week."}',
    true, 3, 'traditional', current_date),

  ('squats', 'Squats', 'reps',
    '{"target": 25, "blurb": "Knee tracks the foot. Controlled on the way down."}',
    true, 4, 'traditional', current_date),

  ('hiit', 'HIIT', 'done',
    '{"blurb": "TABATA core and legs. 20s on, 10s off, 8 rounds."}',
    true, 5, 'traditional', current_date)

on conflict (id) do update
  set name = excluded.name,
      kind = excluded.kind,
      config = excluded.config,
      active = excluded.active,
      sort_order = excluded.sort_order,
      category = excluded.category;

-- 4. Los retos viejos quedan archivados: el historial se conserva,
--    el tablero no se ensucia.
update challenges set active = false where id in ('biceps', 'tabata');

-- 5. La fecha de arranque, común a todo el grupo.
--    Cámbiala por el día real en que empezáis.
update challenges set started_on = current_date where active = true;

-- ------------------------------------------------------------
-- 6. PLAN PERSONAL (privado, solo tú)
-- ------------------------------------------------------------
create table if not exists training_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  day        date not null default current_date,
  slot       text not null,   -- 'strength_a' | 'swim_a' | 'gym' | ...
  duration_s int,
  distance_m int,             -- solo natación
  rpe        int check (rpe between 1 and 10),
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists training_user_day_idx on training_sessions (user_id, day desc);

alter table training_sessions enable row level security;

drop policy if exists "el plan es privado" on training_sessions;
create policy "el plan es privado" on training_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Comprobación
-- select id, name, kind, category, active from challenges order by sort_order;
