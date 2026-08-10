import { createClient } from '@/lib/supabase/server';
import HabitForm from '../HabitForm';

export const dynamic = 'force-dynamic';

export default async function NewHabit() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <HabitForm userId={user!.id} />;
}
