-- ============================================================
-- LANE 5 — migración v4: HIIT desglosado en ejercicios
-- Ejecútala después de la v3.
-- ============================================================

update challenges
set kind = 'checklist',
    config = '{
      "blurb": "Two stages, about 10 minutes. Ten seconds of rest between exercises.",
      "share": "count",
      "items": [
        {"n": 1, "key": "jacks",    "group": "Stage 1 · TABATA", "name": "Jumping jacks",  "hint": "10s"},
        {"n": 2, "key": "knees",    "group": "Stage 1 · TABATA", "name": "High knees",     "hint": "10s"},
        {"n": 3, "key": "lunges",   "group": "Stage 1 · TABATA", "name": "Back lunges",    "hint": "10s"},
        {"n": 4, "key": "claps",    "group": "Stage 1 · TABATA", "name": "Arm claps",      "hint": "10s"},
        {"n": 5, "key": "rope",     "group": "Stage 1 · TABATA", "name": "Rope jumping",   "hint": "10s"},
        {"n": 6, "key": "underleg", "group": "Stage 2 · Core and legs", "name": "Under-leg claps",       "hint": "25 reps"},
        {"n": 7, "key": "kneelbow", "group": "Stage 2 · Core and legs", "name": "Knee-to-elbow touches", "hint": "25 reps"},
        {"n": 8, "key": "kneechest","group": "Stage 2 · Core and legs", "name": "Knee-to-chest presses", "hint": "25 reps"},
        {"n": 9, "key": "bwsquats", "group": "Stage 2 · Core and legs", "name": "Bodyweight squats",     "hint": "25 reps"}
      ],
      "daily_goal": 9
    }'::jsonb
where id = 'hiit';

-- El reto yóguico manda nombres al grupo; HIIT manda solo la cuenta.
update challenges
set config = jsonb_set(config, '{share}', '"names"')
where id = 'yogic';
