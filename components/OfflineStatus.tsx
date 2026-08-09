'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { flushOfflineQueue, OFFLINE_EVENT, pendingMutationCount } from '@/lib/offline';

export default function OfflineStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setOnline(navigator.onLine);
    setPending(pendingMutationCount());
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine || pendingMutationCount() === 0) {
      refresh();
      return;
    }
    setSyncing(true);
    try {
      const result = await flushOfflineQueue(createClient());
      setPending(result.remaining);
    } catch {
      setPending(pendingMutationCount());
    } finally {
      setOnline(navigator.onLine);
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPending(pendingMutationCount());

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
    <aside className="offline-status" data-online={online} role="status">
      <span aria-hidden>{online ? '↻' : '◌'}</span>
      {syncing ? 'Syncing…' : !online ? `Offline${pending ? ` · ${pending} pending` : ''}` : `${pending} waiting to sync`}
    </aside>
  );
}
