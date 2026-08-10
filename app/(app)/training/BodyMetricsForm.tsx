'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BodyMetric } from '@/lib/types';

function friendlyBodyError(error: unknown) {
  const details = typeof error === 'object' && error
    ? error as { code?: string; message?: string }
    : {};
  const permissionError = details.code === '42501'
    || details.code === 'PGRST301'
    || /row-level security|permission denied|jwt/i.test(details.message ?? '');

  if (permissionError) return 'Your session or permissions changed. Refresh the app and try again.';
  if (details.code === '23514') return 'Check the weight, waist and note limits, then try again.';
  return 'Body metrics could not be saved. Check the fields and try again.';
}

export default function BodyMetricsForm({
  day,
  userId,
  initialMetric,
}: {
  day: string;
  userId: string;
  initialMetric: BodyMetric | null;
}) {
  const supabase = createClient();
  const [weight, setWeight] = useState(initialMetric?.weight_kg != null ? String(initialMetric.weight_kg) : '');
  const [waist, setWaist] = useState(initialMetric?.waist_cm != null ? String(initialMetric.waist_cm) : '');
  const [note, setNote] = useState(initialMetric?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function saveBodyMetrics() {
    if (busy) return;
    const weightValue = Number(weight);
    const waistValue = waist.trim() ? Number(waist) : null;
    const cleanNote = note.trim();

    if (!Number.isFinite(weightValue) || weightValue <= 0 || weightValue >= 500) {
      setFeedback('Enter a weight between 0 and 500 kg.');
      return;
    }
    if (waistValue != null && (!Number.isFinite(waistValue) || waistValue <= 0 || waistValue >= 300)) {
      setFeedback('Enter a waist measurement between 0 and 300 cm.');
      return;
    }
    if (cleanNote.length > 200) {
      setFeedback('The note must be 200 characters or fewer.');
      return;
    }

    setBusy(true);
    setFeedback('');
    const { error } = await supabase.from('body_metrics').upsert({
      user_id: userId,
      day,
      weight_kg: weightValue,
      waist_cm: waistValue,
      note: cleanNote || null,
    }, { onConflict: 'user_id,day' });
    setBusy(false);

    setFeedback(error ? friendlyBodyError(error) : 'Body metrics saved.');
  }

  return (
    <section className="body-section" id="body" aria-labelledby="body-heading">
      <div className="section-heading body-heading">
        <div><p className="eyebrow">Body</p><h2 id="body-heading">Daily measurements</h2></div>
        <span className="privacy-pill">Only you</span>
      </div>
      <form className="card body-metrics-form" onSubmit={(event) => { event.preventDefault(); void saveBodyMetrics(); }}>
        <div className="body-metrics-fields">
          <div>
            <label htmlFor="body-weight">Weight · kg</label>
            <input id="body-weight" type="number" inputMode="decimal" min="0.01" max="499.99" step="0.01" required value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="75.20" />
          </div>
          <div>
            <label htmlFor="body-waist">Waist · cm · optional</label>
            <input id="body-waist" type="number" inputMode="decimal" min="0.1" max="299.9" step="0.1" value={waist} onChange={(event) => setWaist(event.target.value)} placeholder="82.5" />
          </div>
          <div className="body-note">
            <div className="between"><label htmlFor="body-note">Note · optional</label><small className="num">{note.length}/200</small></div>
            <textarea id="body-note" rows={3} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Measurement conditions or context" />
          </div>
        </div>
        <button type="submit" className="btn-water" disabled={busy}>{busy ? 'Saving…' : initialMetric ? 'Update today’s measurements' : 'Save today’s measurements'}</button>
        {feedback && <p className="settings-feedback" data-tone={feedback === 'Body metrics saved.' ? 'success' : 'error'}>{feedback}</p>}
      </form>
    </section>
  );
}
