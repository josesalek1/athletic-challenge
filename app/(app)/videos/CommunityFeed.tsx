'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type FeedPost = {
  id: string;
  title: string;
  url: string;
  description: string;
  created_by: string | null;
};

type Feedback = { tone: 'success' | 'error'; text: string } | null;
type LibraryAction = 'add' | 'delete';

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

function friendlyLibraryError(error: unknown, action: LibraryAction) {
  const details = typeof error === 'object' && error
    ? error as { code?: string; message?: string }
    : {};
  const message = details.message ?? '';
  const permissionError = details.code === '42501'
    || details.code === 'PGRST301'
    || /row-level security|permission denied|jwt/i.test(message);

  if (permissionError) return 'Your session or permissions changed. Refresh the app and try again.';
  if (/videos_title_length_check/i.test(message)) return 'The title must be between 2 and 80 characters.';
  if (/videos_description_length_check/i.test(message)) return 'The description must be 500 characters or fewer.';
  if (/videos_url_protocol_check/i.test(message)) return 'Enter a valid http or https video link.';
  if (action === 'delete') return 'The video could not be deleted. Refresh the app and try again.';
  return 'The video could not be added. Check the title, description and link, then try again.';
}

export default function CommunityFeed({
  currentUserId,
  isAdmin,
  initialPosts,
}: {
  currentUserId: string;
  isAdmin: boolean;
  initialPosts: FeedPost[];
}) {
  const supabase = createClient();
  const [posts, setPosts] = useState(initialPosts);
  const [draft, setDraft] = useState({ title: '', url: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function addPost() {
    if (busy) return;
    const title = draft.title.trim();
    const url = draft.url.trim();
    const description = draft.description.trim();

    if (title.length < 2 || title.length > 80) {
      setFeedback({ tone: 'error', text: 'The title must be between 2 and 80 characters.' });
      return;
    }
    if (!validExternalUrl(url)) {
      setFeedback({ tone: 'error', text: 'Enter a valid http or https video link.' });
      return;
    }
    if (description.length > 500) {
      setFeedback({ tone: 'error', text: 'The description must be 500 characters or fewer.' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    const { data, error } = await supabase
      .from('videos')
      .insert({ title, url, description, created_by: currentUserId, status: 'published', sort_order: 0 })
      .select('id, title, url, description, created_by')
      .single();
    setBusy(false);

    if (error || !data) {
      setFeedback({ tone: 'error', text: friendlyLibraryError(error, 'add') });
      return;
    }

    setPosts((items) => [data as FeedPost, ...items]);
    setDraft({ title: '', url: '', description: '' });
    setFeedback({ tone: 'success', text: 'Video added to the technique library.' });
  }

  async function deletePost(post: FeedPost) {
    if (busy) return;
    if (!window.confirm(`Delete “${post.title}”?`)) return;

    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.from('videos').delete().eq('id', post.id);
    setBusy(false);

    if (error) {
      setFeedback({ tone: 'error', text: friendlyLibraryError(error, 'delete') });
      return;
    }

    setPosts((items) => items.filter((item) => item.id !== post.id));
    setFeedback({ tone: 'success', text: 'Video deleted.' });
  }

  return (
    <main className="wrap feed-page">
      <p className="eyebrow">Training resources</p>
      <h1 className="display feed-title">Exercise technique library</h1>
      <p className="muted feed-intro">Use these videos as a reference for exercise form and movement technique.</p>

      <form className="feed-composer" onSubmit={(event) => { event.preventDefault(); void addPost(); }}>
        <p className="eyebrow">Add a video</p>
        <div className="feed-form">
          <div>
            <label htmlFor="feed-title">Title</label>
            <input id="feed-title" maxLength={80} placeholder="Push-up technique" value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} />
          </div>
          <div>
            <label htmlFor="feed-url">Video link</label>
            <input id="feed-url" type="url" placeholder="YouTube, Vimeo or Google Drive" value={draft.url} onChange={(event) => setDraft((value) => ({ ...value, url: event.target.value }))} />
          </div>
          <div>
            <div className="between">
              <label htmlFor="feed-description">Description</label>
              <small className="num">{draft.description.length}/500</small>
            </div>
            <textarea id="feed-description" rows={3} maxLength={500} placeholder="What should members focus on?" value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} />
          </div>
        </div>
        <button type="submit" className="btn-water feed-submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add video'}
        </button>
      </form>

      {feedback && <p className="settings-feedback feed-feedback" data-tone={feedback.tone}>{feedback.text}</p>}

      <section className="feed-list" aria-label="Exercise technique videos">
        {posts.length === 0 && <p className="empty">No technique videos have been added yet.</p>}
        {posts.map((post) => {
          const source = embedUrl(post.url);
          return (
            <article className="feed-post" key={post.id}>
              <header className="feed-post-header">
                <h2>{post.title}</h2>
              </header>
              {post.description && <p className="feed-description">{post.description}</p>}
              {source
                ? <div className="feed-video"><iframe src={source} title={post.title} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
                : <a className="btn btn-ghost feed-open" href={post.url} target="_blank" rel="noopener noreferrer">Open external video</a>}
              {(post.created_by === currentUserId || isAdmin) && (
                <footer className="feed-post-actions">
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => deletePost(post)}>Delete video</button>
                </footer>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
