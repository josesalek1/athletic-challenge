'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clearOfflineData, flushOfflineQueue } from '@/lib/offline';
import type { Campaign } from '@/lib/types';

type Feedback = { tone: 'success' | 'error'; text: string } | null;
type BusyAction = 'dates' | 'campaign-reset' | 'all-reset' | null;
type ControlAction = Exclude<BusyAction, null>;

function durationInDays(startsOn: string, endsOn: string) {
  if (!startsOn || !endsOn) return 0;
  return Math.floor(
    (new Date(`${endsOn}T12:00:00`).getTime() - new Date(`${startsOn}T12:00:00`).getTime()) / 86400000
  ) + 1;
}

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function readableDate(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function controlError(error: unknown, action: ControlAction) {
  const details = typeof error === 'object' && error
    ? error as { code?: string; message?: string }
    : {};
  const message = details.message ?? '';

  if (details.code === '42501' || /administrator access|required|permission denied/i.test(message)) {
    return 'Your administrator session could not be verified. Sign in again and retry.';
  }
  if (details.code === 'PGRST202' || /schema cache|function.*not found/i.test(message)) {
    return 'Supabase has not loaded the latest campaign controls yet. Refresh this page and retry.';
  }
  if (/confirmation phrase/i.test(message)) {
    return 'The campaign changed while this panel was open. Refresh the page before retrying.';
  }
  if (action === 'dates') return 'The campaign dates could not be saved. Check both dates and retry.';
  if (action === 'campaign-reset') return 'The campaign activity could not be reset. Refresh the page and retry.';
  return 'All activity could not be reset. Refresh the page and retry.';
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
  const [campaignResetOpen, setCampaignResetOpen] = useState(false);
  const [campaignResetAcknowledged, setCampaignResetAcknowledged] = useState(false);
  const [allConfirmation, setAllConfirmation] = useState('');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const duration = durationInDays(startsOn, endsOn);
  const validDates = duration > 0;
  const datesChanged = startsOn !== campaign.starts_on || endsOn !== campaign.ends_on;

  useEffect(() => {
    setStartsOn(campaign.starts_on);
    setEndsOn(campaign.ends_on);
    setCampaignResetOpen(false);
    setCampaignResetAcknowledged(false);
    setAllConfirmation('');
  }, [campaign.id, campaign.name, campaign.starts_on, campaign.ends_on]);

  function changeStart(nextStart: string) {
    const preservedDuration = validDates ? duration : 30;
    setStartsOn(nextStart);
    setEndsOn(addDays(nextStart, preservedDuration - 1));
    setFeedback(null);
  }

  function setDuration(days: number) {
    setEndsOn(addDays(startsOn, days - 1));
    setFeedback(null);
  }

  async function saveDates() {
    if (busy) return;
    if (!validDates || !datesChanged) return;
    setBusy('dates');
    setFeedback(null);
    const { error } = await supabase.rpc('admin_set_campaign_start', {
      target_campaign_id: campaign.id,
      new_start: startsOn,
      new_end: endsOn,
      confirmation: campaign.name,
    });
    setBusy(null);
    if (error) {
      setFeedback({ tone: 'error', text: controlError(error, 'dates') });
      return;
    }
    onCampaignChanged({
      ...campaign,
      starts_on: startsOn,
      ends_on: endsOn,
      duration_days: duration,
    });
    setFeedback({ tone: 'success', text: `Saved. Day 1 is ${readableDate(startsOn)} for the whole group.` });
    router.refresh();
  }

  async function resetCampaignActivity() {
    if (busy) return;
    if (!campaignResetOpen || !campaignResetAcknowledged) return;
    setBusy('campaign-reset');
    setFeedback(null);
    const { error } = await supabase.rpc('admin_reset_campaign_activity', {
      target_campaign_id: campaign.id,
      confirmation: campaign.name,
    });
    if (error) {
      setBusy(null);
      setFeedback({ tone: 'error', text: controlError(error, 'campaign-reset') });
      return;
    }
    await flushOfflineQueue(supabase).catch(() => undefined);
    setBusy(null);
    setCampaignResetOpen(false);
    setCampaignResetAcknowledged(false);
    setFeedback({ tone: 'success', text: `Reset complete. ${campaign.name} now has no recorded campaign activity.` });
    router.refresh();
  }

  async function resetAllActivity() {
    if (busy) return;
    if (allConfirmation !== 'RESET ALL ACTIVITY') return;
    setBusy('all-reset');
    setFeedback(null);
    const { error } = await supabase.rpc('admin_reset_all_activity', {
      confirmation: allConfirmation,
    });
    if (error) {
      setBusy(null);
      setFeedback({ tone: 'error', text: controlError(error, 'all-reset') });
      return;
    }
    await clearOfflineData();
    setBusy(null);
    setAllConfirmation('');
    setFeedback({ tone: 'success', text: 'All member activity was deleted.' });
    router.refresh();
  }

  return (
    <article className="campaign-control-panel">
      <header className="campaign-control-heading">
        <div>
          <p className="eyebrow">Active campaign</p>
          <h3>{campaign.name}</h3>
        </div>
        <span className="status-dot" data-status="active">Live</span>
      </header>

      {feedback && (
        <p className="settings-feedback campaign-control-feedback" data-tone={feedback.tone} role="status" aria-live="polite">
          {feedback.text}
        </p>
      )}

      <section className="campaign-control-section campaign-schedule-card">
        <div className="campaign-control-title">
          <div><p className="eyebrow">Official schedule</p><h4>Campaign dates</h4></div>
          <strong className="num">{validDates ? `${duration} days` : 'Check dates'}</strong>
        </div>
        <p className="muted admin-help">The start date is Day 1 for every member. Changing it also moves the end date while keeping the current duration.</p>

        <div className="campaign-date-grid">
          <div>
            <label htmlFor="official-start">Day 1</label>
            <input id="official-start" type="date" value={startsOn} onChange={(event) => changeStart(event.target.value)} />
          </div>
          <div>
            <label htmlFor="official-end">Last day</label>
            <input id="official-end" type="date" min={startsOn} value={endsOn} onChange={(event) => { setEndsOn(event.target.value); setFeedback(null); }} />
          </div>
        </div>

        <div className="campaign-duration-block">
          <span className="campaign-field-label">Quick duration</span>
          <div className="campaign-duration-options" aria-label="Campaign duration">
            {[30, 60, 90].map((days) => (
              <button type="button" key={days} data-active={duration === days} onClick={() => setDuration(days)}>
                {days} days
              </button>
            ))}
          </div>
        </div>

        <button className="btn-water campaign-primary-action" disabled={Boolean(busy) || !validDates || !datesChanged} onClick={saveDates}>
          {busy === 'dates' ? 'Saving…' : datesChanged ? 'Save campaign dates' : 'Dates are up to date'}
        </button>
      </section>

      <section className="campaign-control-section campaign-reset-card">
        <div className="campaign-control-title">
          <div><p className="eyebrow">Campaign data</p><h4>Start with a clean campaign</h4></div>
        </div>
        <p className="muted admin-help">Deletes this campaign’s shared results for every member. It keeps members, activities, private habits, training, swimming and body measurements.</p>

        {!campaignResetOpen ? (
          <button className="btn-ghost campaign-secondary-action" disabled={Boolean(busy)} onClick={() => { setCampaignResetOpen(true); setFeedback(null); }}>
            Review campaign reset
          </button>
        ) : (
          <div className="campaign-reset-review">
            <p><strong>Reset {campaign.name}?</strong><span>This cannot be undone.</span></p>
            <label className="campaign-reset-check">
              <input type="checkbox" checked={campaignResetAcknowledged} onChange={(event) => setCampaignResetAcknowledged(event.target.checked)} />
              <span>I understand that every campaign result will be deleted.</span>
            </label>
            <div className="campaign-reset-actions">
              <button className="btn-ghost" disabled={Boolean(busy)} onClick={() => { setCampaignResetOpen(false); setCampaignResetAcknowledged(false); }}>Cancel</button>
              <button className="btn-rope" disabled={Boolean(busy) || !campaignResetAcknowledged} onClick={resetCampaignActivity}>
                {busy === 'campaign-reset' ? 'Resetting…' : 'Reset campaign'}
              </button>
            </div>
          </div>
        )}
      </section>

      <details className="campaign-advanced-reset">
        <summary>Advanced · reset all app activity</summary>
        <div className="campaign-advanced-reset-body">
          <p>This also deletes private training, swimming and body measurements for every member. It is irreversible.</p>
          <label htmlFor="all-reset-confirmation">Type RESET ALL ACTIVITY</label>
          <input id="all-reset-confirmation" value={allConfirmation} autoComplete="off" onChange={(event) => setAllConfirmation(event.target.value)} />
          <button className="btn-rope campaign-primary-action" disabled={Boolean(busy) || allConfirmation !== 'RESET ALL ACTIVITY'} onClick={resetAllActivity}>
            {busy === 'all-reset' ? 'Resetting everything…' : 'Reset all app activity'}
          </button>
        </div>
      </details>
    </article>
  );
}
