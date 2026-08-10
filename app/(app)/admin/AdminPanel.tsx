'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Challenge } from '@/lib/types';
import type { MemberAdmin, VideoAdmin } from './page';

type Section = 'members' | 'challenges' | 'videos';
type Feedback = { tone: 'success' | 'error'; text: string } | null;

function cleanId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function checklistToText(challenge: Challenge) {
  return (challenge.config.items ?? []).map((item) => `${item.name} | ${item.hint}`).join('\n');
}

function checklistFromText(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [namePart, ...hintParts] = line.split('|');
    const name = namePart.trim();
    return {
      n: index + 1,
      key: cleanId(name) || `practice-${index + 1}`,
      name,
      hint: hintParts.join('|').trim(),
    };
  });
}

function friendlyDate(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function targetOf(challenge: Challenge) {
  if (challenge.kind === 'timed') return challenge.config.target_s ?? 0;
  if (challenge.kind === 'reps') return challenge.config.target ?? 0;
  if (challenge.kind === 'checklist') return challenge.config.daily_goal ?? 3;
  return 1;
}

function challengeConfig(challenge: Challenge, kind: Challenge['kind'], target: number, blurb: string, checklistText?: string) {
  const config: Challenge['config'] = { blurb: blurb.trim() };
  if (kind === 'timed') config.target_s = target;
  if (kind === 'reps') config.target = target;
  if (kind === 'checklist') {
    config.daily_goal = target;
    config.items = checklistText == null ? challenge.config.items ?? [] : checklistFromText(checklistText);
  }
  return config;
}

function MemberEditor({
  member,
  isSelf,
  onSaved,
}: {
  member: MemberAdmin;
  isSelf: boolean;
  onSaved: (member: MemberAdmin) => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState(member.display_name);
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.active);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const memberStatus = !active ? 'Inactive' : member.last_sign_in_at ? 'Active' : 'Invited';

  async function sendAccessLink() {
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: member.email,
      options: { shouldCreateUser: false, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    });
    setBusy(false);
    setFeedback(error
      ? { tone: 'error', text: 'The access link could not be sent.' }
      : { tone: 'success', text: 'A fresh access link was sent.' });
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.rpc('admin_update_member', {
      target_user_id: member.id,
      new_display_name: name.trim(),
      new_role: role,
      new_active: active,
    });
    setBusy(false);
    if (error) {
      setFeedback({ tone: 'error', text: error.message || 'Member could not be updated.' });
      return;
    }
    onSaved({ ...member, display_name: name.trim(), role, active });
    setFeedback({ tone: 'success', text: 'Member updated.' });
  }

  return (
    <article className="admin-card">
      <div className="between admin-card-heading">
        <div>
          <h3>{member.display_name}{isSelf ? ' · You' : ''}</h3>
          <p className="muted admin-email">{member.email}</p>
        </div>
        <span className="status-dot" data-status={memberStatus.toLowerCase()}>{memberStatus}</span>
      </div>
      <div className="admin-form-grid">
        <div className="admin-wide"><label htmlFor={`name-${member.id}`}>Display name</label><input id={`name-${member.id}`} value={name} maxLength={50} onChange={(event) => setName(event.target.value)} /></div>
        <div><label htmlFor={`role-${member.id}`}>Role</label><select id={`role-${member.id}`} value={role} disabled={isSelf} onChange={(event) => setRole(event.target.value as MemberAdmin['role'])}><option value="member">Member</option><option value="admin">Admin</option></select></div>
        <label className="admin-toggle"><input type="checkbox" checked={active} disabled={isSelf} onChange={(event) => setActive(event.target.checked)} /><span>Account active</span></label>
      </div>
      <div className="member-activity">
        <span>Last activity <strong>{friendlyDate(member.last_activity_at)}</strong></span>
        <span>Last sign-in <strong>{friendlyDate(member.last_sign_in_at)}</strong></span>
      </div>
      <div className="admin-button-row">
        <button className="btn-water" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? 'Saving…' : 'Save member'}</button>
        <button className="btn-ghost" disabled={busy} onClick={sendAccessLink}>{member.last_sign_in_at ? 'Send access link' : 'Resend invitation'}</button>
      </div>
      {feedback && <p className="settings-feedback muted" data-tone={feedback.tone}>{feedback.text}</p>}
    </article>
  );
}

function ChallengeEditor({ challenge, onSaved }: { challenge: Challenge; onSaved: (challenge: Challenge) => void }) {
  const supabase = createClient();
  const [name, setName] = useState(challenge.name);
  const [kind, setKind] = useState(challenge.kind);
  const [category, setCategory] = useState(challenge.category);
  const [target, setTarget] = useState(String(targetOf(challenge)));
  const [blurb, setBlurb] = useState(challenge.config.blurb ?? '');
  const [sortOrder, setSortOrder] = useState(String(challenge.sort_order));
  const [startedOn, setStartedOn] = useState(challenge.started_on ?? '');
  const [active, setActive] = useState(challenge.active);
  const [checklistText, setChecklistText] = useState(checklistToText(challenge));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function save() {
    const numericTarget = Math.max(1, Number(target) || 1);
    setBusy(true);
    setFeedback(null);
    const next: Challenge = {
      ...challenge,
      name: name.trim(),
      kind,
      category,
      config: challengeConfig(challenge, kind, numericTarget, blurb, checklistText),
      sort_order: Number(sortOrder) || 0,
      started_on: startedOn,
      active,
    };
    const { error } = await supabase.from('challenges').update({
      name: next.name,
      kind: next.kind,
      category: next.category,
      config: next.config,
      sort_order: next.sort_order,
      started_on: next.started_on,
      active: next.active,
    }).eq('id', challenge.id);
    setBusy(false);
    if (error) {
      setFeedback({ tone: 'error', text: error.message || 'Challenge could not be updated.' });
      return;
    }
    onSaved(next);
    setFeedback({ tone: 'success', text: 'Challenge updated.' });
  }

  const targetLabel = kind === 'timed' ? 'Goal · seconds' : kind === 'checklist' ? 'Daily practices' : kind === 'done' ? 'Goal' : 'Goal · reps';

  return (
    <article className="admin-card">
      <div className="between admin-card-heading"><div><p className="eyebrow">{challenge.id}</p><h3>{challenge.name}</h3></div><span className="status-dot" data-active={active}>{active ? 'Live' : 'Archived'}</span></div>
      <div className="admin-form-grid">
        <div className="admin-wide"><label>Name</label><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></div>
        <div><label>Type</label><select value={kind} onChange={(event) => setKind(event.target.value as Challenge['kind'])}><option value="reps">Repetitions</option><option value="timed">Timed</option><option value="done">Done / not done</option><option value="checklist">Checklist</option></select></div>
        <div><label>Category</label><select value={category} onChange={(event) => setCategory(event.target.value as Challenge['category'])}><option value="traditional">Traditional</option><option value="yogic">Yogic</option></select></div>
        <div><label>{targetLabel}</label><input type="number" min="1" disabled={kind === 'done'} value={target} onChange={(event) => setTarget(event.target.value)} /></div>
        <div><label>Order</label><input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></div>
        <div><label>Start date</label><input type="date" value={startedOn} onChange={(event) => setStartedOn(event.target.value)} /></div>
        <label className="admin-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Challenge active</span></label>
        <div className="admin-wide"><label>Description</label><textarea rows={3} value={blurb} maxLength={220} onChange={(event) => setBlurb(event.target.value)} /></div>
      </div>
      {kind === 'checklist' && (
        <div className="admin-wide checklist-admin-field">
          <label>Practices · one per line, using Name | Hint</label>
          <textarea rows={Math.max(5, checklistText.split('\n').length)} value={checklistText} onChange={(event) => setChecklistText(event.target.value)} />
        </div>
      )}
      <div className="challenge-preview">
        <span>Preview</span>
        <strong>{name || challenge.name}</strong>
        <small>{kind === 'reps' ? `${target} repetitions` : kind === 'timed' ? `${target} seconds` : kind === 'checklist' ? `${target} of ${checklistFromText(checklistText).length} practices` : 'Done / not done'}</small>
        {blurb && <p>{blurb}</p>}
      </div>
      <button className="btn-water admin-save" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save challenge'}</button>
      {feedback && <p className="settings-feedback muted" data-tone={feedback.tone}>{feedback.text}</p>}
    </article>
  );
}

function VideoEditor({ video, challenges, onSaved, onDeleted }: { video: VideoAdmin; challenges: Challenge[]; onSaved: (video: VideoAdmin) => void; onDeleted: (id: string) => void }) {
  const supabase = createClient();
  const [title, setTitle] = useState(video.title);
  const [url, setUrl] = useState(video.url);
  const [challengeId, setChallengeId] = useState(video.challenge_id ?? '');
  const [sortOrder, setSortOrder] = useState(String(video.sort_order));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function save() {
    setBusy(true);
    setFeedback(null);
    const next = { ...video, title: title.trim(), url: url.trim(), challenge_id: challengeId || null, sort_order: Number(sortOrder) || 0 };
    const { error } = await supabase.from('videos').update(next).eq('id', video.id);
    setBusy(false);
    if (error) { setFeedback({ tone: 'error', text: error.message || 'Video could not be updated.' }); return; }
    onSaved(next);
    setFeedback({ tone: 'success', text: 'Video updated.' });
  }

  async function remove() {
    if (!window.confirm(`Remove “${video.title}” from the app?`)) return;
    setBusy(true);
    const { error } = await supabase.from('videos').delete().eq('id', video.id);
    setBusy(false);
    if (error) { setFeedback({ tone: 'error', text: 'Video could not be removed.' }); return; }
    onDeleted(video.id);
  }

  return (
    <article className="admin-card">
      <div className="admin-form-grid">
        <div className="admin-wide"><label>Title</label><input value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="admin-wide"><label>URL</label><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></div>
        <div><label>Challenge</label><select value={challengeId} onChange={(event) => setChallengeId(event.target.value)}><option value="">General</option>{challenges.map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.name}</option>)}</select></div>
        <div><label>Order</label><input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></div>
      </div>
      <div className="admin-button-row"><button className="btn-water" disabled={busy || !title.trim() || !url.trim()} onClick={save}>Save video</button><button className="btn-ghost" disabled={busy} onClick={remove}>Remove</button></div>
      {feedback && <p className="settings-feedback muted" data-tone={feedback.tone}>{feedback.text}</p>}
    </article>
  );
}

export default function AdminPanel({
  currentUserId,
  initialMembers,
  initialChallenges,
  initialVideos,
}: {
  currentUserId: string;
  initialMembers: MemberAdmin[];
  initialChallenges: Challenge[];
  initialVideos: VideoAdmin[];
}) {
  const supabase = createClient();
  const [section, setSection] = useState<Section>('members');
  const [members, setMembers] = useState(initialMembers);
  const [challenges, setChallenges] = useState(initialChallenges);
  const [videos, setVideos] = useState(initialVideos);
  const [newChallenge, setNewChallenge] = useState({ id: '', name: '', kind: 'reps' as Challenge['kind'], target: '25' });
  const [newVideo, setNewVideo] = useState({ title: '', url: '', challengeId: '', sortOrder: '0' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [invite, setInvite] = useState({ name: '', email: '' });

  function replaceMember(next: MemberAdmin) { setMembers((items) => items.map((item) => item.id === next.id ? next : item)); }
  function replaceChallenge(next: Challenge) { setChallenges((items) => items.map((item) => item.id === next.id ? next : item).sort((a, b) => a.sort_order - b.sort_order)); }
  function replaceVideo(next: VideoAdmin) { setVideos((items) => items.map((item) => item.id === next.id ? next : item).sort((a, b) => a.sort_order - b.sort_order)); }

  async function createChallenge() {
    const id = cleanId(newChallenge.id || newChallenge.name);
    if (!id || !newChallenge.name.trim()) return;
    setBusy(true); setFeedback(null);
    const target = Math.max(1, Number(newChallenge.target) || 1);
    const challenge: Challenge = {
      id,
      name: newChallenge.name.trim(),
      kind: newChallenge.kind,
      category: 'traditional',
      config: challengeConfig({ id, name: '', kind: newChallenge.kind, category: 'traditional', config: {}, active: true, sort_order: 0 }, newChallenge.kind, target, '', newChallenge.kind === 'checklist' ? 'Practice 1 | Describe the practice' : undefined),
      active: true,
      sort_order: Math.max(0, ...challenges.map((item) => item.sort_order)) + 1,
      started_on: new Date().toISOString().slice(0, 10),
    };
    const { error } = await supabase.from('challenges').insert(challenge);
    setBusy(false);
    if (error) { setFeedback({ tone: 'error', text: error.message || 'Challenge could not be created.' }); return; }
    setChallenges((items) => [...items, challenge]);
    setNewChallenge({ id: '', name: '', kind: 'reps', target: '25' });
    setFeedback({ tone: 'success', text: 'Challenge created. You can refine it below.' });
  }

  async function inviteMember() {
    const email = invite.email.trim().toLowerCase();
    const name = invite.name.trim();
    if (!email || name.length < 2) return;
    setBusy(true); setFeedback(null);
    const prepared = await supabase.rpc('admin_prepare_invitation', { new_email: email, new_display_name: name });
    if (prepared.error) {
      setBusy(false);
      setFeedback({ tone: 'error', text: prepared.error.message || 'Invitation could not be prepared.' });
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`, data: { display_name: name } },
    });
    setBusy(false);
    if (error) {
      setFeedback({ tone: 'error', text: 'The member was approved, but the email could not be sent. Try Send access link after refreshing.' });
      return;
    }
    setInvite({ name: '', email: '' });
    const refreshed = await supabase.rpc('admin_list_members');
    if (refreshed.data) setMembers(refreshed.data as MemberAdmin[]);
    setFeedback({ tone: 'success', text: `Invitation sent to ${email}. They only need to open the email and tap once.` });
  }

  async function deleteMember(member: MemberAdmin) {
    if (member.id === currentUserId || !window.confirm(`Permanently delete ${member.display_name} and their activity? This cannot be undone.`)) return;
    setBusy(true); setFeedback(null);
    const { error } = await supabase.rpc('admin_delete_member', { target_user_id: member.id });
    setBusy(false);
    if (error) { setFeedback({ tone: 'error', text: error.message || 'Member could not be deleted.' }); return; }
    setMembers((items) => items.filter((item) => item.id !== member.id));
    setFeedback({ tone: 'success', text: `${member.display_name} was deleted.` });
  }

  async function createVideo() {
    if (!newVideo.title.trim() || !newVideo.url.trim()) return;
    setBusy(true); setFeedback(null);
    const draft = { title: newVideo.title.trim(), url: newVideo.url.trim(), challenge_id: newVideo.challengeId || null, sort_order: Number(newVideo.sortOrder) || 0 };
    const { data, error } = await supabase.from('videos').insert(draft).select('id, challenge_id, title, url, sort_order').single();
    setBusy(false);
    if (error) { setFeedback({ tone: 'error', text: error.message || 'Video could not be added.' }); return; }
    setVideos((items) => [...items, data as VideoAdmin].sort((a, b) => a.sort_order - b.sort_order));
    setNewVideo({ title: '', url: '', challengeId: '', sortOrder: '0' });
    setFeedback({ tone: 'success', text: 'Video added.' });
  }

  return (
    <main className="wrap admin-page">
      <Link href="/settings" className="admin-back">← Back to Settings</Link>
      <p className="eyebrow">Athletic Challenge · Administrator only</p>
      <h1 className="display">Athletic Challenge Admin</h1>
      <p className="muted admin-intro">Changes take effect for the whole Athletic Challenge group.</p>

      <nav className="admin-tabs" aria-label="Administration sections">
        {([
          ['members', 'Members'], ['challenges', 'Challenges'], ['videos', 'Videos'],
        ] as [Section, string][]).map(([key, label]) => (
          <button key={key} data-on={section === key} onClick={() => { setSection(key); setFeedback(null); }}>{label}</button>
        ))}
      </nav>

      {feedback && <p className="settings-feedback muted admin-global-feedback" data-tone={feedback.tone}>{feedback.text}</p>}

      {section === 'members' && <section>
        <div className="section-heading"><div><p className="eyebrow">Access and roles</p><h2>{members.length} members</h2></div></div>
        <article className="admin-card admin-create-card">
          <h3>Invite member</h3>
          <p className="muted admin-help">They will receive a private email invitation. One tap opens Athletic Challenge; there is no registration form, group code or password.</p>
          <div className="admin-form-grid"><div><label>Name</label><input value={invite.name} maxLength={50} onChange={(event) => setInvite((value) => ({ ...value, name: event.target.value }))} /></div><div><label>Email</label><input type="email" value={invite.email} onChange={(event) => setInvite((value) => ({ ...value, email: event.target.value }))} /></div></div>
          <button className="btn-water admin-save" disabled={busy || invite.name.trim().length < 2 || !invite.email.includes('@')} onClick={inviteMember}>Send invitation</button>
        </article>
        <div className="admin-list">{members.map((member) => <div key={member.id}><MemberEditor member={member} isSelf={member.id === currentUserId} onSaved={replaceMember} />{member.id !== currentUserId && <button className="btn-rope admin-delete-member" disabled={busy} onClick={() => deleteMember(member)}>Delete member permanently</button>}</div>)}</div>
      </section>}

      {section === 'challenges' && <section>
        <div className="section-heading"><div><p className="eyebrow">Daily tracking</p><h2>Challenges</h2></div></div>
        <article className="admin-card admin-create-card"><h3>Add challenge</h3><div className="admin-form-grid"><div><label>ID</label><input placeholder="e.g. pullups" value={newChallenge.id} onChange={(event) => setNewChallenge((value) => ({ ...value, id: event.target.value }))} /></div><div><label>Name</label><input placeholder="Pull-ups" value={newChallenge.name} onChange={(event) => setNewChallenge((value) => ({ ...value, name: event.target.value }))} /></div><div><label>Type</label><select value={newChallenge.kind} onChange={(event) => setNewChallenge((value) => ({ ...value, kind: event.target.value as Challenge['kind'] }))}><option value="reps">Repetitions</option><option value="timed">Timed</option><option value="done">Done / not done</option><option value="checklist">Checklist</option></select></div><div><label>Goal</label><input type="number" min="1" disabled={newChallenge.kind === 'done'} value={newChallenge.target} onChange={(event) => setNewChallenge((value) => ({ ...value, target: event.target.value }))} /></div></div><button className="btn-water admin-save" disabled={busy || !newChallenge.name.trim()} onClick={createChallenge}>Add challenge</button></article>
        <div className="admin-list">{challenges.map((challenge) => <ChallengeEditor key={challenge.id} challenge={challenge} onSaved={replaceChallenge} />)}</div>
      </section>}

      {section === 'videos' && <section>
        <div className="section-heading"><div><p className="eyebrow">Training library</p><h2>Videos</h2></div></div>
        <article className="admin-card admin-create-card"><h3>Add video</h3><div className="admin-form-grid"><div className="admin-wide"><label>Title</label><input value={newVideo.title} onChange={(event) => setNewVideo((value) => ({ ...value, title: event.target.value }))} /></div><div className="admin-wide"><label>URL</label><input type="url" placeholder="https://…" value={newVideo.url} onChange={(event) => setNewVideo((value) => ({ ...value, url: event.target.value }))} /></div><div><label>Challenge</label><select value={newVideo.challengeId} onChange={(event) => setNewVideo((value) => ({ ...value, challengeId: event.target.value }))}><option value="">General</option>{challenges.map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.name}</option>)}</select></div><div><label>Order</label><input type="number" value={newVideo.sortOrder} onChange={(event) => setNewVideo((value) => ({ ...value, sortOrder: event.target.value }))} /></div></div><button className="btn-water admin-save" disabled={busy || !newVideo.title.trim() || !newVideo.url.trim()} onClick={createVideo}>Add video</button></article>
        {videos.length ? <div className="admin-list">{videos.map((video) => <VideoEditor key={video.id} video={video} challenges={challenges} onSaved={replaceVideo} onDeleted={(id) => setVideos((items) => items.filter((item) => item.id !== id))} />)}</div> : <p className="empty">No videos have been added yet.</p>}
      </section>}

    </main>
  );
}
