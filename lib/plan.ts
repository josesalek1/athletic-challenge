/* El plan personal se define aquí porque cambia como una unidad versionada.
   Las sesiones, cargas, repeticiones y RIR registrados viven en Postgres. */

export type Exercise = {
  key: string;
  block: string;
  name: string;
  sets: number;
  reps: string;
  cue: string;
  how: string;
  targetRir?: string;
  perSide?: boolean;
  timed?: boolean;
  noLoad?: boolean;
};

export type PlanStep = { block: string; name: string; dose: string; cue: string };
export type SwimSet = PlanStep & { meters: number };

export type Slot = {
  key: string;
  weekday: number;
  name: string;
  intent: string;
  kind: 'strength' | 'swim' | 'recovery' | 'rest';
  exercises?: Exercise[];
  sets?: SwimSet[];
  steps?: PlanStep[];
  note?: string;
  optional?: boolean;
};

export const PLAN: Slot[] = [
  {
    key: 'strength_a', weekday: 1, name: 'Strength A · gym',
    intent: 'Full body with emphasis on squat, chest and rowing.', kind: 'strength',
    note: 'Warm up for 7 minutes on a bike or rower, then do progressive warm-up sets. Rest 2–3 minutes on main lifts and 60–90 seconds on accessories.',
    exercises: [
      { key: 'squat', block: 'Legs', name: 'Back squat or leg press', sets: 4, reps: '5–8', targetRir: '2', cue: 'Stable depth. Knees track over the feet.', how: 'Brace before descending, keep the whole foot planted and use a depth you can repeat without losing position. On the leg press, keep the pelvis stable against the pad.' },
      { key: 'bench', block: 'Push', name: 'Bench press', sets: 4, reps: '6–10', targetRir: '1–3', cue: 'Stable shoulder blades. Control the descent.', how: 'Plant the feet, draw the shoulder blades gently back and lower toward the lower chest with vertical forearms. Press without lifting the shoulders.' },
      { key: 'seated_row', block: 'Pull', name: 'Seated or supported row', sets: 4, reps: '6–10', targetRir: '1–3', cue: 'Pause the row. Keep the trunk still.', how: 'Start with long arms and a braced trunk. Pull toward the lower ribs, pause without leaning back, then return under control.' },
      { key: 'rdl', block: 'Posterior', name: 'Romanian deadlift', sets: 3, reps: '6–10', targetRir: '2', cue: 'Hips back. Stop before the spine changes position.', how: 'Keep the load close, soften the knees and push the hips back. Stop when the hamstrings are loaded, then extend the hips to stand.' },
      { key: 'pulldown', block: 'Back', name: 'Lat pulldown', sets: 3, reps: '8–12', targetRir: '1–3', cue: 'Elbows toward the ribs. No swinging.', how: 'Sit tall and begin with straight arms. Pull the elbows down toward the ribs, then return slowly overhead without shrugging.' },
      { key: 'pallof', block: 'Trunk', name: 'Pallof press or plank', sets: 3, reps: '10–15', targetRir: '2–3', noLoad: true, cue: 'Keep the pelvis still and breathe normally.', how: 'For the Pallof press, stand side-on to the cable or band and press straight out without rotating. If using a plank, keep ribs and pelvis stacked.' },
    ],
  },
  {
    key: 'swim_a', weekday: 2, name: 'Swim A · technique and endurance',
    intent: 'Controlled crawl technique and endurance · approximately 2,000 m.', kind: 'swim',
    note: '1 lap = 50 m in a 25 m pool. Use gloves only in the indicated repetitions and remove them if they shorten the stroke or load the shoulder.',
    sets: [
      { block: 'Warm up', name: '2 laps crawl + 2 breaststroke + 2 kickboard', dose: 'Easy', cue: 'Exhale continuously underwater.', meters: 300 },
      { block: 'Technique', name: '4 × 2 laps crawl', dose: 'Rest 20–30 s', cue: 'Long stroke, aligned body and clean hand entry.', meters: 400 },
      { block: 'Main', name: '8 × 2 laps crawl', dose: 'RPE 7 · rest 25–40 s', cue: 'Keep the repetitions at similar times.', meters: 800 },
      { block: 'Water strength', name: '4 × 2 laps with pull buoy · gloves on only 2 reps', dose: 'Controlled', cue: 'Low shoulders and a firm catch without crossing the hand.', meters: 400 },
      { block: 'Cool down', name: '2 easy laps', dose: 'Easy', cue: 'Recover breathing and lengthen the stroke.', meters: 100 },
    ],
  },
  {
    key: 'recovery', weekday: 3, name: 'Active recovery',
    intent: 'Easy aerobic work, mobility and trunk without high fatigue.', kind: 'recovery',
    note: 'Keep this session easy enough to speak in full sentences. Finish with more energy than you started.',
    steps: [
      { block: 'Warm up', name: 'Easy walk or bike', dose: '5 min', cue: 'Comfortable pace. Nasal breathing if it feels natural.' },
      { block: 'Aerobic', name: 'Incline walk, bike or elliptical · zone 2', dose: '30–35 min', cue: 'Do not turn this day into a test.' },
      { block: 'Spine', name: 'Thoracic rotation + cat-camel', dose: '2 × 8/side', cue: 'Move slowly without forcing range.' },
      { block: 'Shoulders', name: 'Wall slides + band external rotation', dose: '2 × 10', cue: 'Control the shoulder blades and stay pain free.' },
      { block: 'Hips', name: '90/90 hips + ankle mobility', dose: '2 × 8/side', cue: 'Keep the foot planted and control the knee.' },
      { block: 'Trunk', name: 'Dead bug or bird dog', dose: '2 × 10/side', cue: 'Avoid arching the lower back.' },
      { block: 'Cool down', name: 'Breathing + easy stretching', dose: '5 min', cue: 'Finish fresh.' },
    ],
  },
  {
    key: 'strength_b', weekday: 4, name: 'Strength B · gym',
    intent: 'Full body with emphasis on hinge, vertical pull and unilateral work.', kind: 'strength',
    note: 'Use the full range only while technique stays stable. Keep one to three repetitions in reserve unless the exercise specifies otherwise.',
    exercises: [
      { key: 'trap_deadlift', block: 'Hinge', name: 'Trap-bar or Romanian deadlift', sets: 3, reps: '4–6', targetRir: '2', cue: 'Every repetition looks the same. No jerking.', how: 'Brace before lifting and drive through the floor while the trunk remains stable. With a Romanian deadlift, push the hips back and keep the load close.' },
      { key: 'incline_press', block: 'Chest', name: 'Incline dumbbell press', sets: 3, reps: '8–12', targetRir: '1–3', cue: 'Stable shoulder blades. Use a pain-free range.', how: 'Set the bench to a moderate incline, keep the shoulder blades supported and lower the dumbbells under control before pressing up.' },
      { key: 'bulgarian', block: 'Legs', name: 'Bulgarian split squat', sets: 3, reps: '8–12', targetRir: '2', perSide: true, cue: 'Control the descent and drive through the whole foot.', how: 'Rest the rear foot on a stable support, lower under control and keep the front knee tracking with the foot. Stand through the whole front foot.' },
      { key: 'pullup', block: 'Back', name: 'Assisted pull-up or neutral pulldown', sets: 3, reps: '6–10', targetRir: '1–3', cue: 'Keep shoulders away from the ears. Lead with the chest.', how: 'Start with long arms and controlled shoulders. Drive the elbows down, bring the chest toward the bar or handle and return slowly.' },
      { key: 'ohp', block: 'Shoulders', name: 'Seated dumbbell press', sets: 3, reps: '8–12', targetRir: '1–3', cue: 'Keep the ribs controlled. Avoid excessive arching.', how: 'Begin with the dumbbells near shoulder height and the trunk supported. Press overhead while keeping the neck relaxed, then lower slowly.' },
      { key: 'leg_curl', block: 'Posterior', name: 'Leg curl', sets: 3, reps: '10–15', targetRir: '1–3', cue: 'Control both directions. Keep the hips still.', how: 'Set the machine so the knee lines up with its pivot. Curl without lifting the hips and return until the knee is almost straight.' },
      { key: 'face_pull', block: 'Posterior', name: 'Face pull', sets: 3, reps: '10–15', targetRir: '2–3', cue: 'Clean movement. Superset with the leg curl.', how: 'Pull the rope toward eye level while the elbows stay high and the shoulder blades rotate back. Return without losing trunk position.' },
    ],
  },
  {
    key: 'swim_b', weekday: 5, name: 'Swim B · speed and rhythm',
    intent: 'Stroke economy, consistent pace and controlled speed · approximately 1,700 m.', kind: 'swim',
    sets: [
      { block: 'Warm up', name: '4 laps crawl + 2 breaststroke', dose: 'Easy', cue: 'Use bilateral breathing only if comfortable.', meters: 300 },
      { block: 'Technique', name: '6 × 1 lap · alternate catch-up and fingertip recovery', dose: 'Rest 20 s', cue: 'Prioritise coordination.', meters: 300 },
      { block: 'Main', name: '8 × 2 laps crawl', dose: 'RPE 7–8 · rest 30–45 s', cue: 'Look for consistent times.', meters: 800 },
      { block: 'Speed + cool down', name: '4 × 1 fast lap · 1 easy lap after each pair + 2 easy laps', dose: 'Controlled speed', cue: 'Accelerate without shortening the stroke.', meters: 300 },
    ],
  },
  {
    key: 'strength_c', weekday: 6, name: 'Strength C · flexible',
    intent: 'Optional complementary volume at the gym or at home.', kind: 'strength', optional: true,
    note: 'Skip this session when recovery, sleep or schedule is poor. Do not compensate for it later. Finish fresh for the following week.',
    exercises: [
      { key: 'leg_extension', block: 'Legs', name: 'Leg extension or Bulgarian split squat', sets: 3, reps: '10–15', targetRir: '2–3', cue: 'Use a comfortable, controlled range.', how: 'On the machine, align the knee with the pivot and extend without snapping the joint. At home, use the Bulgarian split squat with a stable support.' },
      { key: 'machine_press', block: 'Chest', name: 'Machine press or backpack push-up', sets: 3, reps: '8–15', targetRir: '2', cue: 'Keep two repetitions in reserve.', how: 'Use a full pain-free range with stable shoulders. For a push-up, keep the body rigid and add only enough backpack load to preserve form.' },
      { key: 'row_unilateral', block: 'Back', name: 'One-arm cable or backpack row', sets: 3, reps: '8–15', targetRir: '2', perSide: true, cue: 'Pause at the top without rotating the trunk.', how: 'Brace the trunk and pull the elbow toward the ribs. Pause with the shoulder blade controlled, then lower without twisting.' },
      { key: 'hipthrust', block: 'Glutes', name: 'Machine or single-leg hip thrust', sets: 3, reps: '8–15', targetRir: '2', cue: 'Pause for one second at the top. Do not arch the back.', how: 'Drive through the foot until the hip is extended, pause while the ribs remain down, and lower without rotating.' },
      { key: 'lateral', block: 'Shoulders', name: 'Lateral raise', sets: 3, reps: '12–20', targetRir: '2–3', cue: 'Use light weight and relax the upper traps.', how: 'Raise the arms to about shoulder height with a soft elbow, lead with the elbows and lower slowly without shrugging.' },
      { key: 'curl', block: 'Arms', name: 'Curl', sets: 2, reps: '10–15', targetRir: '2–3', cue: 'Light superset. No torso swing.', how: 'Keep the elbows close to the ribs, curl without moving the upper arms and lower until the elbows are straight.' },
      { key: 'triceps', block: 'Arms', name: 'Triceps extension', sets: 2, reps: '10–15', targetRir: '2–3', cue: 'Pair with curls and keep the shoulders still.', how: 'Keep the upper arms fixed while extending the elbows. Use a cable, band or one dumbbell and return under control.' },
      { key: 'sideplank', block: 'Trunk', name: 'Side plank', sets: 2, reps: '30–45s', timed: true, perSide: true, noLoad: true, targetRir: '2–3', cue: 'Keep the hips high and finish fresh.', how: 'Place the elbow below the shoulder, lift the hips until the body forms a straight line and keep the chest facing forward.' },
    ],
  },
  { key: 'rest', weekday: 0, name: 'Rest', intent: 'Easy walking, enough food and recovery according to appetite.', kind: 'rest' },
];

export const PLAN_RULES = [
  'The two gym sessions are the required strength work. Saturday adds volume only when recovery, sleep and schedule allow.',
  'Finish most strength sets with 1–3 repetitions in reserve. Stop if technique deteriorates.',
  'Rest 2–3 minutes on main lifts and 60–90 seconds on accessories. Superset different muscle groups when needed.',
  'Log load, repetitions and RIR. Progress only after reaching the top of the range with clean technique.',
];

export const PROGRESSION = 'When you reach the top of the rep range at the planned RIR, add 2.5–5 kg to lower-body lifts or 1–2.5 kg to upper-body lifts, then return to the bottom of the range.';

export const ADJUSTMENTS = [
  'Only two gym days available: complete Strength A and B. Skip Strength C without compensating.',
  'Friday swim quality drops after Thursday: remove one leg set on Thursday or keep RIR 3 on the hinge for one week.',
  'Poor sleep or several days of fatigue: reduce sets by 30–40% for one week and work at RIR 3–4.',
];

export function slotForWeekday(weekday: number) {
  return PLAN.find((slot) => slot.weekday === weekday) ?? PLAN[PLAN.length - 1];
}
