import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Campaign, Challenge } from '@/lib/types';
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
  description: string;
  created_by: string | null;
  status: 'published' | 'hidden';
  sort_order: number;
  created_at: string;
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

  const [membersResult, campaignsResult, challengesResult, videosResult] = await Promise.all([
    supabase.rpc('admin_list_members'),
    supabase.from('campaigns').select('*').order('starts_on', { ascending: false }),
    supabase.from('challenges').select('*').eq('visibility', 'group').order('sort_order'),
    supabase.from('videos').select('id, challenge_id, title, url, description, created_by, status, sort_order, created_at').order('created_at', { ascending: false }),
  ]);

  return (
    <AdminPanel
      currentUserId={user!.id}
      initialMembers={(membersResult.data ?? []) as MemberAdmin[]}
      initialCampaigns={(campaignsResult.data ?? []) as Campaign[]}
      initialChallenges={(challengesResult.data ?? []) as Challenge[]}
      initialVideos={(videosResult.data ?? []) as VideoAdmin[]}
    />
  );
}
