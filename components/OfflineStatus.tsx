'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { flushOfflineQueue, OFFLINE_EVENT, offlineMutationSummary, retryFailedMutations } from '@/lib/offline';

export default function OfflineStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState(0);
  const [lastError, setLastError] = useState<string | undefined>();
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setOnline(navigator.onLine);
    void offlineMutationSummary().then((summary) => {
      setPending(summary.total);
      setErrors(summary.errors);
      setLastError(summary.lastError);
    });
  }, []);

  const sync = useCallback(async () => {
    const summary = await offlineMutationSummary();
    if (!navigator.onLine || summary.total === 0 || summary.pending === 0) {
      refresh();
      return;
    }
    setSyncing(true);
    try {
      const result = await flushOfflineQueue(createClient());
      setPending(result.remaining);
    } catch {
      const latest = await offlineMutationSummary();
      setPending(latest.total);
      setErrors(latest.errors);
      setLastError(latest.lastError);
    } finally {
      setOnline(navigator.onLine);
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void offlineMutationSummary().then((summary) => {
      setPending(summary.total);
      setErrors(summary.errors);
      setLastError(summary.lastError);
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    }

    const cameOnline = () => { setOnline(true); void sync(); };
    const wentOffline = () => { setOnline(false); refresh(); };
    window.addEventListener('online', cameOnline);
    window.addEventListener('offline', wentOffline);
    window.addEventListener(OFFLINE_EVENT, refresh);
    void sync();
    return () => {
      window.removeEventListener('online', cameOnline);
      window.removeEventListener('offline', wentOffline);
      window.removeEventListener(OFFLINE_EVENT, refresh);
    };
  }, [refresh, sync]);

  if (online && pending === 0 && !syncing) return null;

  return (
    <aside className="offline-status" data-online={online} data-error={errors > 0} role="status" title={lastError}>
      <span aria-hidden>{errors ? '!' : online ? '↻' : '◌'}</span>
      {syncing ? 'Syncing…' : errors ? `${errors} sync ${errors === 1 ? 'error' : 'errors'}` : !online ? `Offline${pending ? ` · ${pending} pending` : ''}` : `${pending} waiting to sync`}
      {errors > 0 && online && (
        <button onClick={async () => { await retryFailedMutations(); await sync(); }}>Retry</button>
      )}
    </aside>
  );
}
