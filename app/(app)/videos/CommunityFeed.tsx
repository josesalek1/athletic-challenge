'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type FeedPost = {
  id: string;
  challenge_id: string | null;
  title: string;
  url: string;
  description: string;
  created_by: string | null;
  status: 'published' | 'hidden';
  created_at: string;
};

export type FeedReaction = {
  video_id: string;
  user_id: string;
  reaction: ReactionKind;
};

export type FeedComment = {
  id: string;
  video_id: string;
  user_id: string;
  body: string;
  hidden: boolean;
  created_at: string;
};

export type FeedPerson = { id: string; display_name: string };
type ReactionKind = 'strong' | 'fire' | 'clap';
type Feedback = { tone: 'success' | 'error'; text: string } | null;

const REACTIONS: { value: ReactionKind; emoji: string; label: string }[] = [
  { value: 'strong', emoji: '💪', label: 'Strong' },
  { value: 'fire', emoji: '🔥', label: 'Fire' },
  { value: 'clap', emoji: '👏', label: 'Applause' },
];

function embedUrl(url: string) {
  const youtube = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/))([\w-]{11})/i);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function validExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function friendlyTime(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CommunityFeed({
  currentUserId,
  isAdmin,
  initialPosts,
  initialReactions,
  initialComments,
  people,
}: {
  currentUserId: string;
  isAdmin: boolean;
  initialPosts: FeedPost[];
  initialReactions: FeedReaction[];
  initialComments: FeedComment[];
  people: FeedPerson[];
}) {
  const supabase = createClient();
  const [posts, setPosts] = useState(initialPosts);
  const [reactions, setReactions] = useState(initialReactions);
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState({ title: '', url: '', description: '' });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person.display_name])), [people]);

  function authorName(userId: string | null) {
    if (!userId) return 'Coach';
    if (userId === currentUserId) return 'You';
    return peopleById.get(userId) ?? 'Member';
  }

  async function addPost() {
    const title = draft.title.trim();
    const url = draft.url.trim();
    const description = draft.description.trim();
    if (title.length < 2 || !validExternalUrl(url)) {
      setFeedback({ tone: 'error', text: 'Add a title and a valid http or https video link.' });
      return;
    }
    setBusy('post');
    setFeedback(null);
    const { data, error } = await supabase
      .from('videos')
      .insert({ title, url, description, created_by: currentUserId, status: 'published', sort_order: 0 })
      .select('id, challenge_id, title, url, description, created_by, status, created_at')
      .single();
    setBusy('');
    if (error || !data) {
      setFeedback({ tone: 'error', text: error?.message || 'The video could not be shared.' });
      return;
    }
    setPosts((items) => [data as FeedPost, ...items]);
    setDraft({ title: '', url: '', description: '' });
    setFeedback({ tone: 'success', text: 'Video shared with the group.' });
  }

  async function toggleReaction(videoId: string, reaction: ReactionKind) {
    const existing = reactions.find((item) => item.video_id === videoId && item.user_id === currentUserId);
    setBusy(`reaction-${videoId}`);
    setFeedback(null);
    if (existing?.reaction === reaction) {
      const { error } = await supabase.from('video_reactions').delete().eq('video_id', videoId).eq('user_id', currentUserId);
      setBusy('');
      if (error) { setFeedback({ tone: 'error', text: 'The reaction could not be removed.' }); return; }
      setReactions((items) => items.filter((item) => !(item.video_id === videoId && item.user_id === currentUserId)));
      return;
    }
    const next: FeedReaction = { video_id: videoId, user_id: currentUserId, reaction };
    const { error } = await supabase.from('video_reactions').upsert(next, { onConflict: 'video_id,user_id' });
    setBusy('');
    if (error) { setFeedback({ tone: 'error', text: 'The reaction could not be saved.' }); return; }
    setReactions((items) => [...items.filter((item) => !(item.video_id === videoId && item.user_id === currentUserId)), next]);
  }

  async function addComment(videoId: string) {
    const body = (commentDrafts[videoId] ?? '').trim();
    if (!body || body.length > 100) return;
    setBusy(`comment-${videoId}`);
    setFeedback(null);
    const { data, error } = await supabase
      .from('video_comments')
      .insert({ video_id: videoId, user_id: currentUserId, body })
      .select('id, video_id, user_id, body, hidden, created_at')
      .single();
    setBusy('');
    if (error || !data) { setFeedback({ tone: 'error', text: error?.message || 'The comment could not be added.' }); return; }
    setComments((items) => [...items, data as FeedComment]);
    setCommentDrafts((items) => ({ ...items, [videoId]: '' }));
  }

  async function deleteComment(comment: FeedComment) {
    if (!window.confirm('Delete this comment?')) return;
    setBusy(`comment-${comment.id}`);
    const { error } = await supabase.from('video_comments').delete().eq('id', comment.id);
    setBusy('');
    if (error) { setFeedback({ tone: 'error', text: 'The comment could not be deleted.' }); return; }
    setComments((items) => items.filter((item) => item.id !== comment.id));
  }

  async function moderateComment(comment: FeedComment) {
    setBusy(`comment-${comment.id}`);
    const { error } = await supabase.rpc('admin_moderate_video_comment', { target_comment_id: comment.id, should_hide: !comment.hidden });
    setBusy('');
    if (error) { setFeedback({ tone: 'error', text: error.message || 'The comment could not be moderated.' }); return; }
    setComments((items) => items.map((item) => item.id === comment.id ? { ...item, hidden: !item.hidden } : item));
  }

  async function moderatePost(post: FeedPost) {
    const shouldHide = post.status === 'published';
    setBusy(`post-${post.id}`);
    const { error } = await supabase.rpc('admin_moderate_video', { target_video_id: post.id, should_hide: shouldHide });
    setBusy('');
    if (error) { setFeedback({ tone: 'error', text: error.message || 'The post could not be moderated.' }); return; }
    setPosts((items) => items.map((item) => item.id === post.id ? { ...item, status: shouldHide ? 'hidden' : 'published' } : item));
  }

  async function deletePost(post: FeedPost) {
    if (!window.confirm(`Delete “${post.title}” and all its reactions and comments?`)) return;
    setBusy(`post-${post.id}`);
    const { error } = await supabase.from('videos').delete().eq('id', post.id);
    setBusy('');
    if (error) { setFeedback({ tone: 'error', text: 'The post could not be deleted.' }); return; }
    setPosts((items) => items.filter((item) => item.id !== post.id));
    setReactions((items) => items.filter((item) => item.video_id !== post.id));
    setComments((items) => items.filter((item) => item.video_id !== post.id));
  }

  return (
    <main className="wrap feed-page">
      <p className="eyebrow">Athletic Challenge community</p>
      <h1 className="display feed-title">Video feed</h1>
      <p className="muted feed-intro">Share an external video, celebrate the work and keep feedback short.</p>

      <article className="feed-composer">
        <div className="between"><div><p className="eyebrow">New post</p><h2>Share a video</h2></div><span className="feed-permission">Members</span></div>
        <div className="feed-form">
          <div><label htmlFor="feed-title">Title</label><input id="feed-title" maxLength={80} placeholder="Morning mobility" value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></div>
          <div><label htmlFor="feed-url">External video link</label><input id="feed-url" type="url" placeholder="YouTube, Vimeo or Google Drive" value={draft.url} onChange={(event) => setDraft((value) => ({ ...value, url: event.target.value }))} /></div>
          <div><div className="between"><label htmlFor="feed-description">Description</label><small className="num">{draft.description.length}/500</small></div><textarea id="feed-description" rows={3} maxLength={500} placeholder="What should the group notice or try?" value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></div>
        </div>
        <button className="btn-water feed-submit" disabled={busy === 'post' || draft.title.trim().length < 2 || !validExternalUrl(draft.url.trim())} onClick={addPost}>{busy === 'post' ? 'Sharing…' : 'Share with the group'}</button>
        <p className="feed-rule">Only links are stored. Authors can delete their posts; administrators can hide or restore any post or comment.</p>
      </article>

      {feedback && <p className="settings-feedback feed-feedback" data-tone={feedback.tone}>{feedback.text}</p>}

      <section className="feed-list" aria-label="Community video posts">
        {posts.length === 0 && <p className="empty">No videos have been shared yet.</p>}
        {posts.map((post) => {
          const source = embedUrl(post.url);
          const postReactions = reactions.filter((item) => item.video_id === post.id);
          const myReaction = postReactions.find((item) => item.user_id === currentUserId)?.reaction;
          const postComments = comments.filter((item) => item.video_id === post.id);
          const commentDraft = commentDrafts[post.id] ?? '';
          return (
            <article className="feed-post" data-hidden={post.status === 'hidden'} key={post.id}>
              <header className="feed-post-header between">
                <div><span>{authorName(post.created_by)} · {friendlyTime(post.created_at)}</span><h2>{post.title}</h2></div>
                {post.status === 'hidden' && <strong>Hidden</strong>}
              </header>
              {post.description && <p className="feed-description">{post.description}</p>}
              {source ? <div className="feed-video"><iframe src={source} title={post.title} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div> : <a className="btn btn-ghost feed-open" href={post.url} target="_blank" rel="noopener noreferrer">Open external video</a>}

              <div className="feed-reactions" aria-label={`Reactions to ${post.title}`}>
                {REACTIONS.map((option) => {
                  const count = postReactions.filter((item) => item.reaction === option.value).length;
                  return <button key={option.value} aria-label={option.label} aria-pressed={myReaction === option.value} data-on={myReaction === option.value} disabled={busy === `reaction-${post.id}` || post.status === 'hidden'} onClick={() => toggleReaction(post.id, option.value)}><span>{option.emoji}</span><small className="num">{count}</small></button>;
                })}
              </div>

              <div className="feed-comments">
                <div className="feed-comments-heading between"><h3>Comments</h3><span>{postComments.filter((comment) => !comment.hidden).length}</span></div>
                {postComments.map((comment) => <div className="feed-comment" data-hidden={comment.hidden} key={comment.id}>
                  <div><strong>{authorName(comment.user_id)}</strong><p>{comment.hidden ? 'Comment hidden by an administrator.' : comment.body}</p></div>
                  <div className="feed-comment-actions">
                    {isAdmin && <button disabled={busy === `comment-${comment.id}`} onClick={() => moderateComment(comment)}>{comment.hidden ? 'Restore' : 'Hide'}</button>}
                    {(comment.user_id === currentUserId || isAdmin) && <button disabled={busy === `comment-${comment.id}`} onClick={() => deleteComment(comment)}>Delete</button>}
                  </div>
                </div>)}
                {post.status === 'published' && <div className="feed-comment-form">
                  <div className="between"><label htmlFor={`comment-${post.id}`}>Add a short comment</label><small className="num">{commentDraft.length}/100</small></div>
                  <div className="row"><input id={`comment-${post.id}`} maxLength={100} placeholder="Keep it constructive" value={commentDraft} onChange={(event) => setCommentDrafts((items) => ({ ...items, [post.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter' && commentDraft.trim()) addComment(post.id); }} /><button className="btn-water" disabled={!commentDraft.trim() || busy === `comment-${post.id}`} onClick={() => addComment(post.id)}>Send</button></div>
                </div>}
              </div>

              {(post.created_by === currentUserId || isAdmin) && <footer className="feed-moderation">
                {isAdmin && <button className="btn-ghost" disabled={busy === `post-${post.id}`} onClick={() => moderatePost(post)}>{post.status === 'hidden' ? 'Restore post' : 'Hide post'}</button>}
                <button className="btn-ghost" disabled={busy === `post-${post.id}`} onClick={() => deletePost(post)}>Delete post</button>
              </footer>}
            </article>
          );
        })}
      </section>
    </main>
  );
}
