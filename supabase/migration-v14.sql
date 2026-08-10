-- ============================================================
-- ATHLETIC CHALLENGE — v14
-- Métricas corporales privadas.
-- ============================================================

create table if not exists public.body_metrics (
  user_id    uuid not null references auth.users on delete cascade,
  day        date not null default current_date,
  weight_kg  numeric(5,2) check (weight_kg > 0 and weight_kg < 500),
  waist_cm   numeric(5,1) check (waist_cm > 0 and waist_cm < 300),
  note       text check (length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.body_metrics enable row level security;

drop trigger if exists body_metrics_touch on public.body_metrics;
create trigger body_metrics_touch before update on public.body_metrics
  for each row execute function public.touch_updated_at();

drop policy if exists "body metrics are private" on public.body_metrics;
create policy "body metrics are private" on public.body_metrics
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

grant select, insert, update, delete on public.body_metrics to authenticated;
