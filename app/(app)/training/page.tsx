import { createClient } from '@/lib/supabase/server';
import { today } from '@/lib/format';
import { slotForWeekday, PLAN } from '@/lib/plan';
import TrainingDay from './TrainingDay';

export const dynamic = 'force-dynamic';

export default async function Training({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const { slot: wanted } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const day = today();

  const weekday = new Date(day + 'T12:00:00').getDay();
  const slot = (wanted && PLAN.find((s) => s.key === wanted)) || slotForWeekday(weekday);

  // Sin filtro por usuario: la RLS ya devuelve solo lo tuyo.
  const [{ data: todaySets }, { data: history }, { data: session }, { data: swim }] = await Promise.all([
    supabase.from('training_sets').select('*').eq('day', day).eq('slot', slot.key),
    supabase.from('training_sets').select('*').lt('day', day)
      .eq('slot', slot.key).order('day', { ascending: false }).limit(200),
    supabase.from('training_sessions').select('*').eq('day', day).eq('slot', slot.key).maybeSingle(),
    slot.kind === 'swim'
      ? supabase.from('swim_sessions').select('distance_m, duration_s, stroke, rpe, notes').eq('day', day).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <TrainingDay
      slotKey={slot.key}
      day={day}
      todaySets={todaySets ?? []}
      history={history ?? []}
      done={Boolean(session?.done)}
      userId={user!.id}
      todaySwim={swim ?? null}
    />
  );
}
