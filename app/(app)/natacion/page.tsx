import { createClient } from '@/lib/supabase/server';
import SwimLog from './SwimLog';

export const dynamic = 'force-dynamic';

export default async function Natacion() {
  const supabase = await createClient();

  // Sin filtro por usuario: la política RLS ya devuelve solo tus filas.
  const { data } = await supabase
    .from('swim_sessions')
    .select('*')
    .order('day', { ascending: false })
    .limit(30);

  return <SwimLog sessions={data ?? []} />;
}
