import { createClient } from '@/lib/supabase/server';
import { today } from '@/lib/format';
import type { Challenge, Entry } from '@/lib/types';
import TodayBoard from './TodayBoard';

export const dynamic = 'force-dynamic';

export default async function Hoy() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const day = today();

  const [{ data: challenges }, { data: entries }, { data: profile }] = await Promise.all([
    supabase.from('challenges').select('*').eq('active', true).order('sort_order'),
    supabase.from('entries').select('*').eq('user_id', user!.id).eq('day', day),
    supabase.from('profiles').select('display_name').eq('id', user!.id).single(),
  ]);

  return (
    <TodayBoard
      challenges={(challenges ?? []) as Challenge[]}
      entries={(entries ?? []) as Entry[]}
      day={day}
      name={profile?.display_name ?? ''}
      userId={user!.id}
    />
  );
}
