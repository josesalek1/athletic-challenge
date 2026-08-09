import { createClient } from '@/lib/supabase/server';
import ProfileSettings from './ProfileSettings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role, active, created_at')
    .eq('id', user!.id)
    .single();

  return (
    <ProfileSettings
      userId={user!.id}
      initialName={profile?.display_name ?? ''}
      initialEmail={user?.email ?? ''}
      role={profile?.role === 'admin' ? 'admin' : 'member'}
      joinedAt={profile?.created_at ?? user?.created_at ?? ''}
    />
  );
}

