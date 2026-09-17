import { createClient } from '@/lib/supabase/server';
import { today } from '@/lib/format';
import NutritionJournal from './NutritionJournal';

export const dynamic = 'force-dynamic';

export default async function NutritionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <NutritionJournal userId={user!.id} initialDay={today()} />;
}
