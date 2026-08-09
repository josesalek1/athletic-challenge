/* El plan personal, en código porque es tuyo y no cambia a diario.
   Los pesos y repeticiones que registres sí van a la base de datos. */

export type Exercise = {
  key: string;
  name: string;
  sets: number;
  reps: string;
  cue: string;
  how: string;
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
        cue: 'Knee tracks the foot. Torso stable.',
        how: 'Stand one long step in front of a chair and rest the back foot on it. Lower the rear knee toward the floor, drive through the whole front foot, and finish tall.' },
      { key: 'pushup', name: 'Pushups', sets: 4, reps: '8–20', noLoad: true,
        cue: 'Chest close to the floor. Rotate variations weekly.',
        how: 'Place hands just wider than the shoulders and hold a straight line from head to heels. Bend the elbows about 30–45° from the body, lower the chest, then push the floor away.' },
      { key: 'rdl_pack', name: 'Romanian deadlift · backpack', sets: 4, reps: '10–15',
        cue: 'Hips back, neutral spine, pack close to the legs.',
        how: 'Hold the backpack close to your thighs with soft knees. Push the hips straight back until the hamstrings tighten, then squeeze the glutes to stand without leaning backward.' },
      { key: 'row_pack', name: 'Row · backpack or band', sets: 4, reps: '8–15',
        cue: 'Elbows back. One-second pause at the top.',
        how: 'Hinge forward with a long spine and brace the abdomen. Pull the load toward the lower ribs, pause with the shoulder blades together, and lower it under control.' },
      { key: 'plank', name: 'Plank', sets: 3, reps: '45–75s', timed: true,
        cue: 'Ribs down, glutes engaged.',
        how: 'Set the elbows below the shoulders and extend both legs. Press the floor away, tighten the abdomen and glutes, and keep ears, shoulders, hips and heels in one line.' },
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
        cue: 'No bar? One-arm backpack row instead. Never skip the pull.',
        how: 'Start with straight arms and shoulders gently pulled away from the ears. Lead with the chest, drive the elbows down and back, then return slowly to full arm extension.' },
      { key: 'pike', name: 'Pike push-up or backpack press', sets: 3, reps: '8–12',
        cue: 'Head passes between the arms. Do not collapse the shoulders.',
        how: 'Begin in an inverted V with hips high and hands shoulder-width apart. Bend the elbows to lower the crown of the head between the hands, then press back to straight arms.' },
      { key: 'hipthrust', name: 'Single-leg hip thrust', sets: 4, reps: '10–15', perSide: true,
        cue: 'One-second pause at the top.',
        how: 'Rest the upper back on a stable sofa or bench, plant one foot and lift the other. Drive through the planted heel until the hip is fully extended, pause, and lower without twisting.' },
      { key: 'lunge', name: 'Walking lunge', sets: 3, reps: '10–14', perSide: true,
        cue: 'Long, controlled step.',
        how: 'Step forward far enough that both knees can bend comfortably. Lower the back knee toward the floor, push through the front foot, and bring the rear leg through into the next step.' },
      { key: 'curl', name: 'Curl · backpack or band', sets: 3, reps: '10–15',
        cue: 'No torso swing.',
        how: 'Stand tall with elbows close to the ribs and palms facing forward. Curl the load without moving the upper arms, squeeze briefly, and lower until the elbows are straight.' },
      { key: 'deadbug', name: 'Dead bug or leg raise', sets: 3, reps: '10–15', noLoad: true,
        cue: 'Keep the lower back controlled.',
        how: 'Lie on your back and gently press the lower back into the floor. Slowly extend the opposite arm and leg, stop before the back arches, then return and change sides.' },
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
        cue: 'Main progress indicator. Record load and reps.',
        how: 'Set the feet at a comfortable width, brace before descending, and let the knees follow the toes. Reach a controlled depth, keep the whole foot planted, and drive the floor away.' },
      { key: 'rdl', name: 'Romanian deadlift', sets: 3, reps: '8–12',
        cue: 'Only as low as a neutral back allows.',
        how: 'Hold the bar close to the thighs, soften the knees and push the hips backward. Stop when the hamstrings are loaded, then extend the hips while keeping the bar close.' },
      { key: 'bench', name: 'Bench press or dumbbells', sets: 3, reps: '6–10',
        cue: 'Scapulae stable. Control the descent.',
        how: 'Plant the feet and draw the shoulder blades gently back into the bench. Lower the weight toward the lower chest with forearms vertical, then press up without lifting the shoulders.' },
      { key: 'pulldown', name: 'Lat pulldown', sets: 3, reps: '8–12',
        cue: 'Elbows to the ribs, not behind the neck.',
        how: 'Sit tall with thighs secured and begin with straight arms. Pull the elbows down toward the ribs until the bar reaches the upper chest, then return slowly overhead.' },
      { key: 'seated_row', name: 'Seated or machine row', sets: 3, reps: '8–12',
        cue: 'Do not round the back on the way out.',
        how: 'Sit tall, brace the trunk and begin with the shoulders reaching slightly forward. Pull the handle toward the lower ribs, pause, then extend the arms without collapsing the torso.' },
      { key: 'ohp', name: 'Shoulder press', sets: 2, reps: '8–12',
        cue: 'No pain, no excessive lower-back arch.',
        how: 'Start with the weights near shoulder height, ribs stacked over the pelvis. Press overhead until the arms are straight, then lower with control while keeping the neck relaxed.' },
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
        cue: 'Controlled pause at the bottom.',
        how: 'Hold the load close to the chest, sit between the hips and keep the feet fully planted. Pause for one second at a stable depth, then stand without bouncing.' },
      { key: 'pushup_elev', name: 'Feet-elevated pushup', sets: 4, reps: '8–15', noLoad: true,
        cue: 'Straight body. Adjust height to keep full range.',
        how: 'Place the feet on a stable low surface and hands slightly wider than the shoulders. Lower the chest with the body rigid, then press up; reduce the height if the hips sag.' },
      { key: 'row_pack_c', name: 'Row · backpack or band', sets: 4, reps: '10–15',
        cue: 'Pause at the top. Back first, not biceps.',
        how: 'Brace in a hip hinge and let the arms start long. Initiate by drawing the shoulder blades back, pull the elbows toward the ribs, pause, and lower slowly.' },
      { key: 'goodmorning', name: 'Good morning or single-leg deadlift', sets: 3, reps: '10–12',
        cue: 'Slow hip hinge.',
        how: 'Keep a soft knee and push the hips backward while the spine stays long. Lower only until the hamstrings load, then squeeze the glutes to return to standing.' },
      { key: 'lateral', name: 'Lateral raise', sets: 3, reps: '12–20',
        cue: 'Light. Do not shrug the traps.',
        how: 'Hold light weights with elbows slightly bent and shoulders relaxed. Raise the arms out to about shoulder height, lead with the elbows, and lower slowly.' },
      { key: 'sideplank', name: 'Side plank', sets: 3, reps: '30–45s', timed: true, perSide: true,
        cue: 'Hips high and aligned.',
        how: 'Place the elbow directly below the shoulder and stack or stagger the feet. Lift the hips until the body forms a straight line and keep the chest facing forward.' },
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
