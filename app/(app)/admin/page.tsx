import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Challenge } from '@/lib/types';
import AdminPanel from './AdminPanel';

export const dynamic = 'force-dynamic';

export type MemberAdmin = {
  id: string;
  email: string;
  display_name: string;
  role: 'member' | 'admin';
  active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  last_activity_at: string | null;
};

export type VideoAdmin = {
  id: string;
  challenge_id: string | null;
  title: string;
  url: string;
  sort_order: number;
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', user!.id)
    .single();

  if (!profile?.active || profile.role !== 'admin') redirect('/settings');

  const [membersResult, challengesResult, videosResult] = await Promise.all([
    supabase.rpc('admin_list_members'),
    supabase.from('challenges').select('*').order('sort_order'),
    supabase.from('videos').select('id, challenge_id, title, url, sort_order').order('sort_order'),
  ]);

  return (
    <AdminPanel
      currentUserId={user!.id}
      initialMembers={(membersResult.data ?? []) as MemberAdmin[]}
      initialChallenges={(challengesResult.data ?? []) as Challenge[]}
      initialVideos={(videosResult.data ?? []) as VideoAdmin[]}
    />
  );
}
