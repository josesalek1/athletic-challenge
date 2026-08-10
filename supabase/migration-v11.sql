-- ============================================================
-- ATHLETIC CHALLENGE — v11
-- Expanded activity categories for the guided activity creator.
-- Run after migration-v10.sql.
-- ============================================================

alter table public.challenges
  drop constraint if exists challenges_category_check;

alter table public.challenges
  add constraint challenges_category_check
  check (category in (
    'yogic',
    'calisthenics',
    'strength',
    'hiit',
    'cardio',
    'mobility',
    'swimming',
    'running',
    'recovery',
    'mindfulness',
    'traditional',
    'other'
  ));

comment on column public.challenges.category is
  'Activity family used for administration, filtering and future analytics.';
