import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Challenge } from '@/lib/types';
import HabitForm from '../HabitForm';

export const dynamic = 'force-dynamic';

export default async function EditHabit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: habit } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', id)
    .eq('visibility', 'private')
    .single();

  if (!habit) notFound();

  return <HabitForm userId={user!.id} habit={habit as Challenge} />;
}
