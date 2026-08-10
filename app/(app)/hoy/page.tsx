import { createClient } from '@/lib/supabase/server';
import { today } from '@/lib/format';
import type { Campaign, Challenge, Entry } from '@/lib/types';
import TodayBoard from './TodayBoard';

export const dynamic = 'force-dynamic';

export default async function Hoy() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const day = today();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('active', true)
    .maybeSingle();

  const [groupResult, habitsResult, { data: entries }, { data: profile }] = await Promise.all([
    campaign
      ? supabase
          .from('challenges')
          .select('*')
          .eq('campaign_id', campaign.id)
          .eq('visibility', 'group')
          .eq('active', true)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
    supabase
      .from('challenges')
      .select('*')
      .eq('visibility', 'private')
      .eq('active', true)
      .order('sort_order'),
    supabase.from('entries').select('*').eq('day', day),
    supabase.from('profiles').select('display_name').eq('id', user!.id).single(),
  ]);

  const challenges = [...(groupResult.data ?? []), ...(habitsResult.data ?? [])];

  return (
    <TodayBoard
      challenges={(challenges ?? []) as Challenge[]}
      campaign={(campaign ?? null) as Campaign | null}
      entries={(entries ?? []) as Entry[]}
      day={day}
      name={profile?.display_name ?? ''}
      userId={user!.id}
    />
  );
}
