-- ATHLETIC CHALLENGE — v18: diario personal de nutrición.
-- Ejecutar una sola vez después de migration-v17.sql.
begin;

create table if not exists public.nutrition_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (length(btrim(name)) between 1 and 120),
  food_groups text[] not null default '{}'
    check (food_groups <@ array['vegetables', 'fruit', 'whole_grains', 'legumes', 'protein', 'dairy_alternatives']::text[]),
  note text check (length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_meals_user_day_idx
  on public.nutrition_meals (user_id, day desc, created_at);

alter table public.nutrition_meals enable row level security;

create policy "owner nutrition meals" on public.nutrition_meals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger nutrition_meals_touch before update on public.nutrition_meals
  for each row execute function public.touch_updated_at();

revoke all on public.nutrition_meals from anon;
grant select, insert, update, delete on public.nutrition_meals to authenticated;

commit;
