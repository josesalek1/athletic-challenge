'use client';

import { useEffect, useState } from 'react';
import { offlineMutationSummary, retryFailedMutations } from '@/lib/offline';

export default function OfflinePage() {
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState(0);
  useEffect(() => {
    void offlineMutationSummary().then((summary) => {
      setPending(summary.total);
      setErrors(summary.errors);
    });
  }, []);

  return (
    <main className="wrap offline-page">
      <p className="eyebrow">Athletic Challenge</p>
      <h1 className="display">You’re offline</h1>
      <p className="muted">
        Open Today or Training if you have visited them on this device before. New activity will wait here and sync automatically when the connection returns.
      </p>
      {pending > 0 && <p className="offline-pending num">{pending} {pending === 1 ? 'change' : 'changes'} waiting to sync</p>}
      {errors > 0 && (
        <button className="btn-rope" onClick={async () => { await retryFailedMutations(); window.location.reload(); }}>
          Retry {errors} failed {errors === 1 ? 'change' : 'changes'}
        </button>
      )}
      <div className="offline-actions">
        <a className="btn btn-water" href="/hoy">Open Today</a>
        <a className="btn btn-ghost" href="/training">Open Training</a>
        <button className="btn-ghost" onClick={() => window.location.reload()}>Try again</button>
      </div>
    </main>
  );
}
