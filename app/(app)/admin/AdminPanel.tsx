'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Campaign, Challenge } from '@/lib/types';
import type { MemberAdmin, VideoAdmin } from './page';

type Section = 'members' | 'campaigns' | 'activities' | 'videos';
type Feedback = { tone: 'success' | 'error'; text: string } | null;
type ActivityDraft = {
  name: string;
  kind: Challenge['kind'];
  category: Challenge['category'];
  target: string;
  description: string;
  checklistText: string;
};

const ACTIVITY_CATEGORIES: { value: Challenge['category']; label: string }[] = [
  { value: 'yogic', label: 'Yoga & yogic practices' },
  { value: 'calisthenics', label: 'Calisthenics' },
  { value: 'strength', label: 'Strength' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'swimming', label: 'Swimming' },
  { value: 'running', label: 'Running' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'mindfulness', label: 'Mindfulness' },
  { value: 'traditional', label: 'Traditional' },
  { value: 'other', label: 'Other' },
];

const EMPTY_ACTIVITY: ActivityDraft = {
  name: '',
  kind: 'reps',
  category: 'calisthenics',
  target: '25',
  description: '',
  checklistText: '',
};

function cleanId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function activityIdFor(name: string, campaignId: string, challenges: Challenge[]) {
  const base = cleanId(name) || 'activity';
  if (!challenges.some((challenge) => challenge.id === base)) return base;
  const campaignSuffix = campaignId.slice(0, 6) || 'new';
  let candidate = `${base}-${campaignSuffix}`;
  let number = 2;
  while (challenges.some((challenge) => challenge.id === candidate)) {
    candidate = `${base}-${campaignSuffix}-${number}`;
    number += 1;
  }
  return candidate;
}

function normalizeWords(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function localActivityDraft(prompt: string): ActivityDraft {
  const normalized = normalizeWords(prompt);
  const firstNumber = Number(normalized.match(/\b\d+\b/)?.[0] ?? 1);
  const checklist = /checklist|lista|practicas|practices|selecciona|choose/.test(normalized);
  const timed = /segundo|second|minuto|minute|tiempo|timed|hold|plank/.test(normalized);
  const binary = /si\s*\/\s*no|yes\s*\/\s*no|completar|complete|done/.test(normalized);
  const kind: Challenge['kind'] = checklist ? 'checklist' : timed ? 'timed' : binary ? 'done' : 'reps';

  let category: Challenge['category'] = 'traditional';
  if (/yoga|yogic|pranayama|meditacion|meditation/.test(normalized)) category = 'yogic';
  else if (/nadar|natacion|swim/.test(normalized)) category = 'swimming';
  else if (/correr|running|run\b|jog/.test(normalized)) category = 'running';
  else if (/hiit|tabata|interval/.test(normalized)) category = 'hiit';
  else if (/fuerza|strength|peso|weight|deadlift|press|squat/.test(normalized)) category = 'strength';
  else if (/calistenia|calisthenics|push.?up|pull.?up|burpee/.test(normalized)) category = 'calisthenics';
  else if (/movilidad|mobility|stretch|estiramiento/.test(normalized)) category = 'mobility';
  else if (/recuperacion|recovery|descanso|rest day/.test(normalized)) category = 'recovery';
  else if (/respiracion|breath|mindful/.test(normalized)) category = 'mindfulness';
  else if (/cardio|ciclismo|cycling|bike|walk|caminar/.test(normalized)) category = 'cardio';

  const knownName = /push.?up/.test(normalized) ? 'Push-ups'
    : /pull.?up/.test(normalized) ? 'Pull-ups'
    : /squat/.test(normalized) ? 'Squats'
    : /plank/.test(normalized) ? 'Plank'
    : /hiit|tabata/.test(normalized) ? 'HIIT'
    : /nadar|natacion|swim/.test(normalized) ? 'Swimming'
    : /correr|running|run\b|jog/.test(normalized) ? 'Running'
    : /yoga|yogic/.test(normalized) ? 'Yogic practice'
    : '';
  const rawName = prompt.split(/[.!?\n:]/)[0]
    .replace(/^(crea|crear|create|add|agrega|anade)\s+(una?\s+)?(actividad\s+|reto\s+|challenge\s+)?/i, '')
    .replace(/\b(de|for|with|con)\s+\d+.*$/i, '')
    .trim();
  const name = knownName || titleCase(rawName.slice(0, 60)) || 'New activity';

  const minutes = /minuto|minute/.test(normalized);
  const numericTarget = kind === 'done' ? 1 : Math.max(1, firstNumber * (kind === 'timed' && minutes ? 60 : 1));
  const listSource = prompt.includes(':') ? prompt.split(':').slice(1).join(':') : '';
  const listItems = checklist
    ? listSource.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : [];

  return {
    name,
    kind,
    category,
    target: String(checklist && listItems.length ? Math.min(firstNumber || 3, listItems.length) : numericTarget),
    description: prompt.trim().slice(0, 220),
    checklistText: listItems.map((item) => `${titleCase(item)} |`).join('\n'),
  };
}

function normalizeGeneratedActivity(value: Record<string, unknown>, fallback: ActivityDraft): ActivityDraft {
  const category = ACTIVITY_CATEGORIES.some((option) => option.value === value.category)
    ? value.category as Challenge['category']
    : fallback.category;
  const kind = ['timed', 'reps', 'checklist', 'done'].includes(String(value.kind))
    ? value.kind as Challenge['kind']
    : fallback.kind;
  const checklistItems = Array.isArray(value.checklist_items)
    ? value.checklist_items.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
    : [];
  return {
    name: String(value.name ?? fallback.name).trim().slice(0, 60) || fallback.name,
    kind,
    category,
    target: String(Math.max(1, Number(value.target ?? fallback.target) || 1)),
    description: String(value.description ?? fallback.description).trim().slice(0, 220),
    checklistText: checklistItems.length
      ? checklistItems.map((item) => `${item} |`).join('\n')
      : fallback.checklistText,
  };
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

function addDays(iso: string, amount: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function campaignDuration(startsOn: string, endsOn: string) {
  if (!startsOn || !endsOn) return 0;
  return Math.max(0, Math.floor((new Date(`${endsOn}T12:00:00`).getTime() - new Date(`${startsOn}T12:00:00`).getTime()) / 86400000) + 1);
}

function rpcRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
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

function CampaignEditor({ campaign, onSaved }: { campaign: Campaign; onSaved: (campaign: Campaign) => void }) {
  const supabase = createClient();
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description);
  const [startsOn, setStartsOn] = useState(campaign.starts_on);
  const [endsOn, setEndsOn] = useState(campaign.ends_on);
  const [active, setActive] = useState(campaign.active);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const duration = campaignDuration(startsOn, endsOn);

  useEffect(() => setActive(campaign.active), [campaign.active]);

  async function save() {
    setBusy(true);
    setFeedback(null);
    const { data, error } = await supabase.rpc('admin_update_campaign', {
      target_campaign_id: campaign.id,
      new_name: name.trim(),
      new_description: description.trim(),
      new_starts_on: startsOn,
      new_ends_on: endsOn,
      make_active: active,
    });
    setBusy(false);
    if (error) {
      setFeedback({ tone: 'error', text: error.message || 'Campaign could not be updated.' });
      return;
    }
    const saved = rpcRow(data as Campaign | Campaign[] | null);
    if (!saved) {
      setFeedback({ tone: 'error', text: 'Campaign was saved but could not be refreshed.' });
      return;
    }
    onSaved(saved);
    setFeedback({ tone: 'success', text: active && !campaign.active ? 'Campaign activated. The previous campaign is now historical.' : 'Campaign updated.' });
  }

  return (
    <article className="admin-card campaign-admin-card">
      <div className="between admin-card-heading">
        <div><p className="eyebrow">{campaign.active ? 'Current campaign' : 'Campaign history'}</p><h3>{campaign.name}</h3></div>
        <span className="status-dot" data-status={campaign.active ? 'active' : 'invited'}>{campaign.active ? 'Active' : 'Historical'}</span>
      </div>
      <div className="admin-form-grid">
        <div className="admin-wide"><label>Name</label><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></div>
        <div><label>Start date</label><input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></div>
        <div><label>End date</label><input type="date" min={startsOn} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></div>
        <div className="admin-wide"><label>Description</label><textarea rows={3} value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></div>
        <label className="admin-toggle admin-wide"><input type="checkbox" checked={active} disabled={campaign.active} onChange={(event) => setActive(event.target.checked)} /><span>{campaign.active ? 'This is the active campaign' : 'Make this the active campaign'}</span></label>
      </div>
      <div className="campaign-preview between"><span>Duration</span><strong className="num">{duration || '—'} days</strong></div>
      <button className="btn-water admin-save" disabled={busy || name.trim().length < 2 || duration < 1} onClick={save}>{busy ? 'Saving…' : active && !campaign.active ? 'Save and activate' : 'Save campaign'}</button>
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
      active,
    };
    const { error } = await supabase.from('challenges').update({
      name: next.name,
      kind: next.kind,
      category: next.category,
      config: next.config,
      sort_order: next.sort_order,
      active: next.active,
    }).eq('id', challenge.id);
    setBusy(false);
    if (error) {
      setFeedback({ tone: 'error', text: error.message || 'Activity could not be updated.' });
      return;
    }
    onSaved(next);
    setFeedback({ tone: 'success', text: 'Activity updated.' });
  }

  const targetLabel = kind === 'timed' ? 'Goal · seconds' : kind === 'checklist' ? 'Daily practices' : kind === 'done' ? 'Goal' : 'Goal · reps';

  return (
    <article className="admin-card">
      <div className="between admin-card-heading"><div><p className="eyebrow">{challenge.id}</p><h3>{challenge.name}</h3></div><span className="status-dot" data-active={active}>{active ? 'Live' : 'Archived'}</span></div>
      <div className="admin-form-grid">
        <div className="admin-wide"><label>Name</label><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></div>
        <div><label>Type</label><select value={kind} onChange={(event) => setKind(event.target.value as Challenge['kind'])}><option value="reps">Repetitions</option><option value="timed">Timed</option><option value="done">Done / not done</option><option value="checklist">Checklist</option></select></div>
        <div><label>Category</label><select value={category} onChange={(event) => setCategory(event.target.value as Challenge['category'])}>{ACTIVITY_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        <div><label>{targetLabel}</label><input type="number" min="1" disabled={kind === 'done'} value={target} onChange={(event) => setTarget(event.target.value)} /></div>
        <div><label>Order</label><input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></div>
        <label className="admin-toggle admin-wide"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Activity enabled in Today</span></label>
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
      <button className="btn-water admin-save" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save activity'}</button>
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
        <div><label>Activity</label><select value={challengeId} onChange={(event) => setChallengeId(event.target.value)}><option value="">General</option>{challenges.map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.name}</option>)}</select></div>
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
  initialCampaigns,
  initialChallenges,
  initialVideos,
}: {
  currentUserId: string;
  initialMembers: MemberAdmin[];
  initialCampaigns: Campaign[];
  initialChallenges: Challenge[];
  initialVideos: VideoAdmin[];
}) {
  const supabase = createClient();
  const [section, setSection] = useState<Section>('members');
  const [members, setMembers] = useState(initialMembers);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [challenges, setChallenges] = useState(initialChallenges);
  const [videos, setVideos] = useState(initialVideos);
  const activeCampaign = initialCampaigns.find((campaign) => campaign.active) ?? initialCampaigns[0];
  const [selectedCampaignId, setSelectedCampaignId] = useState(activeCampaign?.id ?? '');
  const initialDate = new Date().toISOString().slice(0, 10);
  const [newCampaign, setNewCampaign] = useState({ name: '', description: '', startsOn: initialDate, endsOn: addDays(initialDate, 29), active: false });
  const [activityDraft, setActivityDraft] = useState<ActivityDraft>(EMPTY_ACTIVITY);
  const [activityPrompt, setActivityPrompt] = useState('');
  const [activityPreview, setActivityPreview] = useState<ActivityDraft | null>(null);
  const [activityConfirmed, setActivityConfirmed] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [newVideo, setNewVideo] = useState({ title: '', url: '', challengeId: '', sortOrder: '0' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [invite, setInvite] = useState({ name: '', email: '' });
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const previewActivityId = activityPreview && selectedCampaign
    ? activityIdFor(activityPreview.name, selectedCampaign.id, challenges)
    : '';

  function replaceMember(next: MemberAdmin) { setMembers((items) => items.map((item) => item.id === next.id ? next : item)); }
  function replaceCampaign(next: Campaign) {
    setCampaigns((items) => items
      .map((item) => item.id === next.id ? next : next.active ? { ...item, active: false } : item)
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on)));
    if (next.active) setSelectedCampaignId(next.id);
  }
  function replaceChallenge(next: Challenge) { setChallenges((items) => items.map((item) => item.id === next.id ? next : item).sort((a, b) => a.sort_order - b.sort_order)); }
  function replaceVideo(next: VideoAdmin) { setVideos((items) => items.map((item) => item.id === next.id ? next : item).sort((a, b) => a.sort_order - b.sort_order)); }

  function updateActivityDraft(patch: Partial<ActivityDraft>) {
    setActivityDraft((value) => ({ ...value, ...patch }));
    setActivityPreview(null);
    setActivityConfirmed(false);
  }

  async function createCampaign() {
    setBusy(true); setFeedback(null);
    const { data, error } = await supabase.rpc('admin_create_campaign', {
      new_name: newCampaign.name.trim(),
      new_description: newCampaign.description.trim(),
      new_starts_on: newCampaign.startsOn,
      new_ends_on: newCampaign.endsOn,
      make_active: newCampaign.active,
    });
    setBusy(false);
    if (error) { setFeedback({ tone: 'error', text: error.message || 'Campaign could not be created.' }); return; }
    const created = rpcRow(data as Campaign | Campaign[] | null);
    if (!created) { setFeedback({ tone: 'error', text: 'Campaign was created but could not be refreshed.' }); return; }
    setCampaigns((items) => [created, ...items.map((item) => created.active ? { ...item, active: false } : item)]);
    setSelectedCampaignId(created.id);
    setNewCampaign({ name: '', description: '', startsOn: initialDate, endsOn: addDays(initialDate, 29), active: false });
    setFeedback({ tone: 'success', text: created.active ? 'Campaign created and activated.' : 'Campaign created. Add its activities before activating it.' });
  }

  async function generateActivityDraft() {
    const prompt = activityPrompt.trim();
    if (prompt.length < 8) {
      setFeedback({ tone: 'error', text: 'Describe the activity in a little more detail first.' });
      return;
    }
    const localDraft = localActivityDraft(prompt);
    setFeedback(null);
    setAiBusy(true);
    const { data, error } = await supabase.functions.invoke('parse-activity', { body: { prompt } });
    setAiBusy(false);
    const generated = !error && data?.activity && typeof data.activity === 'object'
      ? normalizeGeneratedActivity(data.activity as Record<string, unknown>, localDraft)
      : localDraft;
    setActivityDraft(generated);
    setActivityPreview(null);
    setActivityConfirmed(false);
    setFeedback({
      tone: 'success',
      text: !error && data?.activity
        ? 'AI draft ready. Review every field before continuing.'
        : 'AI was unavailable, so a private local draft was prepared instead. Review every field before continuing.',
    });
  }

  function reviewActivity() {
    const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
    if (!selectedCampaign) {
      setFeedback({ tone: 'error', text: 'Select a campaign first.' });
      return;
    }
    if (activityDraft.name.trim().length < 2) {
      setFeedback({ tone: 'error', text: 'Add a name with at least two characters.' });
      return;
    }
    if (activityDraft.kind === 'checklist' && checklistFromText(activityDraft.checklistText).length < 1) {
      setFeedback({ tone: 'error', text: 'A checklist needs at least one item.' });
      return;
    }
    setActivityPreview({ ...activityDraft, name: activityDraft.name.trim(), description: activityDraft.description.trim() });
    setActivityConfirmed(false);
    setFeedback(null);
  }

  async function createChallenge() {
    const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
    const draft = activityPreview;
    if (!draft || !activityConfirmed || !selectedCampaign) return;
    const id = activityIdFor(draft.name, selectedCampaign.id, challenges);
    setBusy(true); setFeedback(null);
    const target = Math.max(1, Number(draft.target) || 1);
    const challenge: Challenge = {
      id,
      campaign_id: selectedCampaign.id,
      name: draft.name.trim(),
      kind: draft.kind,
      category: draft.category,
      config: challengeConfig({ id, campaign_id: selectedCampaign.id, name: '', kind: draft.kind, category: draft.category, config: {}, active: true, sort_order: 0 }, draft.kind, target, draft.description, draft.kind === 'checklist' ? draft.checklistText : undefined),
      active: true,
      sort_order: Math.max(0, ...challenges.filter((item) => item.campaign_id === selectedCampaign.id).map((item) => item.sort_order)) + 1,
      started_on: selectedCampaign.starts_on,
    };
    const { error } = await supabase.from('challenges').insert(challenge);
    setBusy(false);
    if (error) { setFeedback({ tone: 'error', text: error.message || 'Activity could not be created.' }); return; }
    setChallenges((items) => [...items, challenge]);
    setActivityDraft(EMPTY_ACTIVITY);
    setActivityPrompt('');
    setActivityPreview(null);
    setActivityConfirmed(false);
    setFeedback({ tone: 'success', text: `Activity added to ${selectedCampaign.name}.` });
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
          ['members', 'Members'], ['campaigns', 'Campaigns'], ['activities', 'Activities'], ['videos', 'Videos'],
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

      {section === 'campaigns' && <section>
        <div className="section-heading"><div><p className="eyebrow">Group challenge history</p><h2>Campaigns</h2></div></div>
        <article className="admin-card admin-create-card">
          <h3>Create campaign</h3>
          <p className="muted admin-help">A campaign defines the group challenge and its dates. Activate it when its activities are ready; the previous campaign will remain in history.</p>
          <div className="admin-form-grid">
            <div className="admin-wide"><label>Name</label><input placeholder="30-Day Athletic Challenge" value={newCampaign.name} maxLength={80} onChange={(event) => setNewCampaign((value) => ({ ...value, name: event.target.value }))} /></div>
            <div><label>Start date</label><input type="date" value={newCampaign.startsOn} onChange={(event) => setNewCampaign((value) => ({ ...value, startsOn: event.target.value, endsOn: value.endsOn < event.target.value ? addDays(event.target.value, 29) : value.endsOn }))} /></div>
            <div><label>End date</label><input type="date" min={newCampaign.startsOn} value={newCampaign.endsOn} onChange={(event) => setNewCampaign((value) => ({ ...value, endsOn: event.target.value }))} /></div>
            <div className="admin-wide"><label>Description</label><textarea rows={3} value={newCampaign.description} maxLength={500} onChange={(event) => setNewCampaign((value) => ({ ...value, description: event.target.value }))} /></div>
            <label className="admin-toggle admin-wide"><input type="checkbox" checked={newCampaign.active} onChange={(event) => setNewCampaign((value) => ({ ...value, active: event.target.checked }))} /><span>Activate immediately</span></label>
          </div>
          <div className="campaign-preview between"><span>Duration</span><strong className="num">{campaignDuration(newCampaign.startsOn, newCampaign.endsOn) || '—'} days</strong></div>
          <button className="btn-water admin-save" disabled={busy || newCampaign.name.trim().length < 2 || campaignDuration(newCampaign.startsOn, newCampaign.endsOn) < 1} onClick={createCampaign}>Create campaign</button>
        </article>
        <div className="admin-list">{campaigns.map((campaign) => <CampaignEditor key={campaign.id} campaign={campaign} onSaved={replaceCampaign} />)}</div>
      </section>}

      {section === 'activities' && <section>
        <div className="section-heading"><div><p className="eyebrow">Campaign content</p><h2>Activities</h2></div></div>
        <div className="campaign-select-card">
          <label htmlFor="activity-campaign">Campaign</label>
          <select id="activity-campaign" value={selectedCampaignId} onChange={(event) => { setSelectedCampaignId(event.target.value); setActivityPreview(null); setActivityConfirmed(false); }}>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.active ? '● ' : ''}{campaign.name} · {campaign.duration_days} days</option>)}
          </select>
        </div>
        {selectedCampaignId ? <>
          <article className="admin-card admin-create-card">
            <div className="between activity-creator-heading">
              <div><p className="eyebrow">{activityPreview ? 'Step 2 of 2' : 'Step 1 of 2'}</p><h3>{activityPreview ? 'Confirm activity' : 'Create activity'}</h3></div>
              <span className="status-dot" data-status={activityPreview ? 'active' : 'invited'}>{activityPreview ? 'Preview' : 'Draft'}</span>
            </div>
            {!activityPreview ? <>
              <p className="muted admin-help">Describe the activity in your own words or complete the guided fields. The ID is generated automatically.</p>
              <div className="activity-ai-box">
                <label htmlFor="activity-prompt">Optional · describe it naturally</label>
                <textarea id="activity-prompt" rows={4} maxLength={1000} placeholder="Example: Create a 90-second plank for the strength category. Keep the core tight and hips level." value={activityPrompt} onChange={(event) => setActivityPrompt(event.target.value)} />
                <button className="btn-ghost activity-ai-button" disabled={aiBusy || activityPrompt.trim().length < 8} onClick={generateActivityDraft}>{aiBusy ? 'Generating with AI…' : 'Generate draft with AI'}</button>
                <small className="activity-ai-privacy">Only this description is sent to OpenAI. No member or activity history is included.</small>
              </div>
              <div className="activity-form-divider"><span>Or configure manually</span></div>
              <div className="admin-form-grid">
                <div className="admin-wide"><label htmlFor="activity-name">Name</label><input id="activity-name" placeholder="Pull-ups" maxLength={60} value={activityDraft.name} onChange={(event) => updateActivityDraft({ name: event.target.value })} /></div>
                <div><label htmlFor="activity-type">Type</label><select id="activity-type" value={activityDraft.kind} onChange={(event) => updateActivityDraft({ kind: event.target.value as Challenge['kind'] })}><option value="reps">Repetitions</option><option value="timed">Timed</option><option value="done">Done / not done</option><option value="checklist">Checklist</option></select></div>
                <div><label htmlFor="activity-category">Category</label><select id="activity-category" value={activityDraft.category} onChange={(event) => updateActivityDraft({ category: event.target.value as Challenge['category'] })}>{ACTIVITY_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                <div><label htmlFor="activity-goal">{activityDraft.kind === 'timed' ? 'Goal · seconds' : activityDraft.kind === 'checklist' ? 'Items required' : activityDraft.kind === 'done' ? 'Goal' : 'Goal · reps'}</label><input id="activity-goal" type="number" min="1" disabled={activityDraft.kind === 'done'} value={activityDraft.target} onChange={(event) => updateActivityDraft({ target: event.target.value })} /></div>
                <div className="admin-wide"><label htmlFor="activity-description">Description</label><textarea id="activity-description" rows={3} maxLength={220} placeholder="Give members a short, useful instruction." value={activityDraft.description} onChange={(event) => updateActivityDraft({ description: event.target.value })} /></div>
              </div>
              {activityDraft.kind === 'checklist' && <div className="checklist-admin-field"><label htmlFor="activity-checklist">Checklist · one item per line, using Name | Hint</label><textarea id="activity-checklist" rows={6} placeholder={'Pranayama | Five minutes before coffee\nNature | Spend twenty minutes outside'} value={activityDraft.checklistText} onChange={(event) => updateActivityDraft({ checklistText: event.target.value })} /></div>}
              <div className="activity-auto-id"><span>Automatic ID</span><strong className="num">{activityIdFor(activityDraft.name, selectedCampaignId, challenges)}</strong></div>
              <button className="btn-water admin-save" disabled={busy || activityDraft.name.trim().length < 2} onClick={reviewActivity}>Review activity</button>
            </> : <>
              <p className="muted admin-help">Nothing has been saved yet. Verify the activity and campaign before confirming.</p>
              <div className="activity-confirm-preview">
                <div className="activity-preview-top"><span>{ACTIVITY_CATEGORIES.find((option) => option.value === activityPreview.category)?.label}</span><strong>{activityPreview.name}</strong><small className="num">{previewActivityId}</small></div>
                <dl className="activity-preview-grid">
                  <div><dt>Campaign</dt><dd>{selectedCampaign?.name}</dd></div>
                  <div><dt>Type</dt><dd>{activityPreview.kind === 'reps' ? `${activityPreview.target} repetitions` : activityPreview.kind === 'timed' ? `${activityPreview.target} seconds` : activityPreview.kind === 'checklist' ? `${activityPreview.target} required of ${checklistFromText(activityPreview.checklistText).length}` : 'Done / not done'}</dd></div>
                </dl>
                {activityPreview.description && <p>{activityPreview.description}</p>}
                {activityPreview.kind === 'checklist' && <ol className="activity-preview-list">{checklistFromText(activityPreview.checklistText).map((item) => <li key={item.key}><strong>{item.name}</strong>{item.hint && <span>{item.hint}</span>}</li>)}</ol>}
              </div>
              <label className="activity-confirm-check"><input type="checkbox" checked={activityConfirmed} onChange={(event) => setActivityConfirmed(event.target.checked)} /><span>I reviewed this activity and want to add it to {selectedCampaign?.name}.</span></label>
              <div className="admin-button-row activity-confirm-actions"><button className="btn-ghost" disabled={busy} onClick={() => { setActivityPreview(null); setActivityConfirmed(false); }}>Back to edit</button><button className="btn-water" disabled={busy || !activityConfirmed} onClick={createChallenge}>{busy ? 'Creating…' : 'Confirm and create'}</button></div>
            </>}
          </article>
          <div className="admin-list">
            {challenges.filter((challenge) => challenge.campaign_id === selectedCampaignId).map((challenge) => <ChallengeEditor key={challenge.id} challenge={challenge} onSaved={replaceChallenge} />)}
          </div>
          {challenges.every((challenge) => challenge.campaign_id !== selectedCampaignId) && <p className="empty">This campaign has no activities yet.</p>}
        </> : <p className="empty">Create a campaign before adding activities.</p>}
      </section>}

      {section === 'videos' && <section>
        <div className="section-heading"><div><p className="eyebrow">Training library</p><h2>Videos</h2></div></div>
        <article className="admin-card admin-create-card"><h3>Add video</h3><div className="admin-form-grid"><div className="admin-wide"><label>Title</label><input value={newVideo.title} onChange={(event) => setNewVideo((value) => ({ ...value, title: event.target.value }))} /></div><div className="admin-wide"><label>URL</label><input type="url" placeholder="https://…" value={newVideo.url} onChange={(event) => setNewVideo((value) => ({ ...value, url: event.target.value }))} /></div><div><label>Activity</label><select value={newVideo.challengeId} onChange={(event) => setNewVideo((value) => ({ ...value, challengeId: event.target.value }))}><option value="">General</option>{challenges.map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.name}</option>)}</select></div><div><label>Order</label><input type="number" value={newVideo.sortOrder} onChange={(event) => setNewVideo((value) => ({ ...value, sortOrder: event.target.value }))} /></div></div><button className="btn-water admin-save" disabled={busy || !newVideo.title.trim() || !newVideo.url.trim()} onClick={createVideo}>Add video</button></article>
        {videos.length ? <div className="admin-list">{videos.map((video) => <VideoEditor key={video.id} video={video} challenges={challenges} onSaved={replaceVideo} onDeleted={(id) => setVideos((items) => items.filter((item) => item.id !== id))} />)}</div> : <p className="empty">No videos have been added yet.</p>}
      </section>}

    </main>
  );
}
