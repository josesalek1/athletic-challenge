'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Campaign } from '@/lib/types';

type Feedback = { tone: 'success' | 'error'; text: string } | null;

function durationInDays(startsOn: string, endsOn: string) {
  if (!startsOn || !endsOn) return 0;
  return Math.floor(
    (new Date(`${endsOn}T12:00:00`).getTime() - new Date(`${startsOn}T12:00:00`).getTime()) / 86400000
  ) + 1;
}

export default function CampaignControl({
  campaign,
  onCampaignChanged,
}: {
  campaign: Campaign;
  onCampaignChanged: (campaign: Campaign) => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [startsOn, setStartsOn] = useState(campaign.starts_on);
  const [endsOn, setEndsOn] = useState(campaign.ends_on);
  const [dateConfirmation, setDateConfirmation] = useState('');
  const [campaignConfirmation, setCampaignConfirmation] = useState('');
  const [allConfirmation, setAllConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const validDates = durationInDays(startsOn, endsOn) > 0;

  useEffect(() => {
    setStartsOn(campaign.starts_on);
    setEndsOn(campaign.ends_on);
    setDateConfirmation('');
    setCampaignConfirmation('');
  }, [campaign.id, campaign.name, campaign.starts_on, campaign.ends_on]);

  async function setCampaignStart() {
    if (busy) return;
    if (!validDates || dateConfirmation !== campaign.name) return;
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.rpc('admin_set_campaign_start', {
      target_campaign_id: campaign.id,
      new_start: startsOn,
      new_end: endsOn,
    });
    setBusy(false);
    if (error) {
      setFeedback({ tone: 'error', text: 'The official campaign dates could not be updated.' });
      return;
    }
    onCampaignChanged({
      ...campaign,
      starts_on: startsOn,
      ends_on: endsOn,
      duration_days: durationInDays(startsOn, endsOn),
    });
    setDateConfirmation('');
    setFeedback({ tone: 'success', text: `${startsOn} is now Day 1 for the whole group.` });
    router.refresh();
  }

  async function resetCampaignActivity() {
    if (busy) return;
    if (campaignConfirmation !== campaign.name) return;
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.rpc('admin_reset_campaign_activity', {
      target_campaign_id: campaign.id,
    });
    setBusy(false);
    if (error) {
      setFeedback({ tone: 'error', text: 'Campaign activity could not be reset.' });
      return;
    }
    setCampaignConfirmation('');
    setFeedback({ tone: 'success', text: `All activity for ${campaign.name} was deleted.` });
    router.refresh();
  }

  async function resetAllActivity() {
    if (busy) return;
    if (allConfirmation !== 'RESET ALL ACTIVITY') return;
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.rpc('admin_reset_all_activity', {
      confirmation: allConfirmation,
    });
    setBusy(false);
    if (error) {
      setFeedback({ tone: 'error', text: 'All activity could not be reset.' });
      return;
    }
    setAllConfirmation('');
    setFeedback({ tone: 'success', text: 'All member activity was deleted.' });
    router.refresh();
  }

  return (
    <article className="admin-card campaign-control-card">
      <div className="between admin-card-heading">
        <div><p className="eyebrow">Official schedule and resets</p><h3>Campaign control</h3></div>
        <span className="status-dot" data-status="active">{campaign.name}</span>
      </div>

      <section className="campaign-control-section">
        <h4>Set the official start</h4>
        <p className="muted admin-help">The start date becomes Day 1 for every member. You can set it again after the campaign begins.</p>
        <div className="admin-form-grid">
          <div><label htmlFor="official-start">Start date</label><input id="official-start" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></div>
          <div><label htmlFor="official-end">End date</label><input id="official-end" type="date" min={startsOn} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></div>
          <div className="admin-wide"><label htmlFor="date-confirmation">Type {campaign.name} to confirm</label><input id="date-confirmation" value={dateConfirmation} autoComplete="off" onChange={(event) => setDateConfirmation(event.target.value)} /></div>
        </div>
        <div className="campaign-preview between"><span>Duration</span><strong className="num">{validDates ? durationInDays(startsOn, endsOn) : '—'} days</strong></div>
        <button className="btn-water admin-save" disabled={busy || !validDates || dateConfirmation !== campaign.name} onClick={setCampaignStart}>{busy ? 'Working…' : 'Set start date'}</button>
      </section>

      <section className="campaign-control-section campaign-danger-zone">
        <h4>Reset campaign activity</h4>
        <p>This permanently deletes every member’s results for this campaign. Members, activities and private habits remain intact.</p>
        <label htmlFor="campaign-reset-confirmation">Type {campaign.name} to confirm</label>
        <input id="campaign-reset-confirmation" value={campaignConfirmation} autoComplete="off" onChange={(event) => setCampaignConfirmation(event.target.value)} />
        <button className="btn-rope admin-save" disabled={busy || campaignConfirmation !== campaign.name} onClick={resetCampaignActivity}>{busy ? 'Working…' : 'Reset campaign activity'}</button>
      </section>

      <section className="campaign-control-section campaign-danger-zone campaign-danger-all">
        <h4>Reset ALL activity</h4>
        <p>This is irreversible and affects every member. It deletes campaign results, training, swimming and body measurements across the entire app.</p>
        <label htmlFor="all-reset-confirmation">Type RESET ALL ACTIVITY to confirm</label>
        <input id="all-reset-confirmation" value={allConfirmation} autoComplete="off" onChange={(event) => setAllConfirmation(event.target.value)} />
        <button className="btn-rope admin-save" disabled={busy || allConfirmation !== 'RESET ALL ACTIVITY'} onClick={resetAllActivity}>{busy ? 'Working…' : 'Reset ALL activity'}</button>
      </section>

      {feedback && <p className="settings-feedback muted" data-tone={feedback.tone}>{feedback.text}</p>}
    </article>
  );
}
