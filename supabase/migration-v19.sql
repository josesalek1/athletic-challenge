-- ATHLETIC CHALLENGE — v19: opciones privadas del plan y calorías opcionales del diario.
-- Ejecutar una sola vez después de migration-v18.sql.
begin;

create table public.nutrition_plan_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  name text not null check (length(btrim(name)) between 1 and 120),
  detail text not null default '' check (length(detail) <= 280),
  food_groups text[] not null default '{}'
    check (food_groups <@ array['vegetables', 'fruit', 'whole_grains', 'legumes', 'protein', 'dairy_alternatives']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nutrition_plan_options_user_meal_idx
  on public.nutrition_plan_options (user_id, meal_type, created_at);

create unique index nutrition_plan_options_unique_name_idx
  on public.nutrition_plan_options (user_id, meal_type, lower(name));

alter table public.nutrition_plan_options enable row level security;

create policy "owner nutrition plan options" on public.nutrition_plan_options
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger nutrition_plan_options_touch before update on public.nutrition_plan_options
  for each row execute function public.touch_updated_at();

revoke all on public.nutrition_plan_options from anon;
grant select, insert, update, delete on public.nutrition_plan_options to authenticated;

alter table public.nutrition_meals
  add column calories_kcal integer check (calories_kcal between 1 and 5000);

commit;
