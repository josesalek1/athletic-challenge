import { createClient } from '@/lib/supabase/server';
import CommunityFeed, { type FeedPost } from './CommunityFeed';

export const dynamic = 'force-dynamic';

export default async function Videos() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [profileResult, postsResult] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user!.id).single(),
    supabase
      .from('videos')
      .select('id, title, url, description, created_by')
      .eq('status', 'published')
      .order('created_at', { ascending: false }),
  ]);

  return <CommunityFeed
    currentUserId={user!.id}
    isAdmin={profileResult.data?.role === 'admin'}
    initialPosts={(postsResult.data ?? []) as FeedPost[]}
  />;
}
