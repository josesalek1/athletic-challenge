import { createClient } from '@/lib/supabase/server';
import CommunityFeed, { type FeedComment, type FeedPerson, type FeedPost, type FeedReaction } from './CommunityFeed';

export const dynamic = 'force-dynamic';

export default async function Videos() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [profileResult, postsResult, reactionsResult, commentsResult, peopleResult] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user!.id).single(),
    supabase.from('videos').select('id, challenge_id, title, url, description, created_by, status, created_at').order('created_at', { ascending: false }),
    supabase.from('video_reactions').select('video_id, user_id, reaction'),
    supabase.from('video_comments').select('id, video_id, user_id, body, hidden, created_at').order('created_at'),
    supabase.from('profiles').select('id, display_name'),
  ]);

  return <CommunityFeed
    currentUserId={user!.id}
    isAdmin={profileResult.data?.role === 'admin'}
    initialPosts={(postsResult.data ?? []) as FeedPost[]}
    initialReactions={(reactionsResult.data ?? []) as FeedReaction[]}
    initialComments={(commentsResult.data ?? []) as FeedComment[]}
    people={(peopleResult.data ?? []) as FeedPerson[]}
  />;
}
