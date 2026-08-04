/* El plan personal, en código porque es tuyo y no cambia a diario.
   Los pesos y repeticiones que registres sí van a la base de datos. */

export type Exercise = {
  key: string;
  name: string;
  sets: number;
  reps: string;
  cue: string;
  perSide?: boolean;
  timed?: boolean;   // se registra en segundos, no en repeticiones
  noLoad?: boolean;  // sin carga: solo repeticiones
};

export type SwimSet = { label: string; detail: string; meters: number };

export type Slot = {
  key: string;
  weekday: number;           // 0 domingo … 6 sábado
  name: string;
  intent: string;
  kind: 'strength' | 'swim' | 'rest';
  exercises?: Exercise[];
  sets?: SwimSet[];
  note?: string;
};

export const PLAN: Slot[] = [
  {
    key: 'strength_a',
    weekday: 1,
    name: 'Strength A · home',
    intent: 'Legs, chest, back and trunk.',
    kind: 'strength',
    exercises: [
      { key: 'bulgarian', name: 'Bulgarian split squat', sets: 4, reps: '8–15', perSide: true,
        cue: 'Knee tracks the foot. Torso stable.' },
      { key: 'pushup', name: 'Pushups', sets: 4, reps: '8–20', noLoad: true,
        cue: 'Chest close to the floor. Rotate variations weekly.' },
      { key: 'rdl_pack', name: 'Romanian deadlift · backpack', sets: 4, reps: '10–15',
        cue: 'Hips back, neutral spine, pack close to the legs.' },
      { key: 'row_pack', name: 'Row · backpack or band', sets: 4, reps: '8–15',
        cue: 'Elbows back. One-second pause at the top.' },
      { key: 'plank', name: 'Plank', sets: 3, reps: '45–75s', timed: true,
        cue: 'Ribs down, glutes engaged.' },
    ],
  },
  {
    key: 'swim_a',
    weekday: 2,
    name: 'Swim A',
    intent: 'Main session, around 2,000 m.',
    kind: 'swim',
    note: '1 lap = 50 m. Gloves only if shoulders and technique feel good. Pain means stop.',
    sets: [
      { label: 'Set 1', detail: '4 laps breast + 4 free + 4 kickboard', meters: 600 },
      { label: 'Set 2', detail: 'Gloves: 4 breast + 4 free + 4 pull buoy', meters: 600 },
      { label: 'Set 3', detail: 'Gloves: 4 breast + 6 crawl', meters: 500 },
      { label: 'Set 4', detail: '4 free at max speed', meters: 200 },
      { label: 'Cool down', detail: '2 easy laps', meters: 100 },
    ],
  },
  {
    key: 'strength_b',
    weekday: 3,
    name: 'Strength B · home',
    intent: 'Pull, posterior chain and shoulders.',
    kind: 'strength',
    exercises: [
      { key: 'pullup', name: 'Pull-ups or inverted row', sets: 4, reps: '6–12',
        cue: 'No bar? One-arm backpack row instead. Never skip the pull.' },
      { key: 'pike', name: 'Pike push-up or backpack press', sets: 3, reps: '8–12',
        cue: 'Head passes between the arms. Do not collapse the shoulders.' },
      { key: 'hipthrust', name: 'Single-leg hip thrust', sets: 4, reps: '10–15', perSide: true,
        cue: 'One-second pause at the top.' },
      { key: 'lunge', name: 'Walking lunge', sets: 3, reps: '10–14', perSide: true,
        cue: 'Long, controlled step.' },
      { key: 'curl', name: 'Curl · backpack or band', sets: 3, reps: '10–15',
        cue: 'No torso swing.' },
      { key: 'deadbug', name: 'Dead bug or leg raise', sets: 3, reps: '10–15', noLoad: true,
        cue: 'Keep the lower back controlled.' },
    ],
  },
  {
    key: 'gym',
    weekday: 4,
    name: 'Gym',
    intent: 'Progressive loading, full body.',
    kind: 'strength',
    note: 'This is the session where load progression matters most. Log every set.',
    exercises: [
      { key: 'squat', name: 'Squat or leg press', sets: 3, reps: '6–10',
        cue: 'Main progress indicator. Record load and reps.' },
      { key: 'rdl', name: 'Romanian deadlift', sets: 3, reps: '8–12',
        cue: 'Only as low as a neutral back allows.' },
      { key: 'bench', name: 'Bench press or dumbbells', sets: 3, reps: '6–10',
        cue: 'Scapulae stable. Control the descent.' },
      { key: 'pulldown', name: 'Lat pulldown', sets: 3, reps: '8–12',
        cue: 'Elbows to the ribs, not behind the neck.' },
      { key: 'seated_row', name: 'Seated or machine row', sets: 3, reps: '8–12',
        cue: 'Do not round the back on the way out.' },
      { key: 'ohp', name: 'Shoulder press', sets: 2, reps: '8–12',
        cue: 'No pain, no excessive lower-back arch.' },
    ],
  },
  {
    key: 'swim_b',
    weekday: 5,
    name: 'Swim B',
    intent: 'Technique and controlled aerobic work, around 1,600 m.',
    kind: 'swim',
    sets: [
      { label: 'Warm up', detail: '4 laps breast + 4 free', meters: 400 },
      { label: 'Technique', detail: '4 kickboard + 4 pull buoy', meters: 400 },
      { label: 'Main', detail: '6 × 2 laps crawl at 75–80%', meters: 600 },
      { label: 'Cool down', detail: '4 easy breast + 4 easy free', meters: 400 },
    ],
  },
  {
    key: 'strength_c',
    weekday: 6,
    name: 'Strength C · home',
    intent: 'Complementary hypertrophy volume.',
    kind: 'strength',
    exercises: [
      { key: 'paused_squat', name: 'Paused squat or goblet · backpack', sets: 4, reps: '10–15',
        cue: 'Controlled pause at the bottom.' },
      { key: 'pushup_elev', name: 'Feet-elevated pushup', sets: 4, reps: '8–15', noLoad: true,
        cue: 'Straight body. Adjust height to keep full range.' },
      { key: 'row_pack_c', name: 'Row · backpack or band', sets: 4, reps: '10–15',
        cue: 'Pause at the top. Back first, not biceps.' },
      { key: 'goodmorning', name: 'Good morning or single-leg deadlift', sets: 3, reps: '10–12',
        cue: 'Slow hip hinge.' },
      { key: 'lateral', name: 'Lateral raise', sets: 3, reps: '12–20',
        cue: 'Light. Do not shrug the traps.' },
      { key: 'sideplank', name: 'Side plank', sets: 3, reps: '30–45s', timed: true, perSide: true,
        cue: 'Hips high and aligned.' },
    ],
  },
  {
    key: 'rest',
    weekday: 0,
    name: 'Rest',
    intent: 'Walk, optional mobility, and eat enough.',
    kind: 'rest',
  },
];

export function slotForWeekday(weekday: number) {
  return PLAN.find((s) => s.weekday === weekday) ?? PLAN[PLAN.length - 1];
}

export const PROGRESSION =
  'When you hit the top of the rep range on every set with clean technique, add 2–5 kg or pick a harder variation, then go back to the bottom of the range.';
