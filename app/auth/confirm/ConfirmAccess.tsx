'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ConfirmAccess({ tokenHash }: { tokenHash: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    if (!tokenHash || busy) return;
    setBusy(true);
    setError('');
    const supabase = createClient();
    const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (result.error) {
      setBusy(false);
      setError('This link is invalid, expired or already used. Request a new email.');
      return;
    }
    window.location.replace('/hoy');
  }

  return (
    <main className="wrap" style={{ paddingTop: 'calc(72px + env(safe-area-inset-top))' }}>
      <p className="eyebrow">Athletic Challenge</p>
      <h1 className="display" style={{ fontSize: 38, margin: '10px 0 24px' }}>Confirm sign in</h1>
      <div className="card">
        <p className="muted" style={{ marginBottom: 18 }}>
          This link signs you in to this browser. To sign in to the installed app, enter the
          six-digit code from the same email on its sign-in screen.
        </p>
        {tokenHash && !error && (
          <button className="btn-water" style={{ width: '100%' }} disabled={busy} onClick={confirm}>
            {busy ? 'Signing in…' : 'Confirm sign in'}
          </button>
        )}
        {!tokenHash && <p className="muted" role="alert">This link is incomplete. Request a new email.</p>}
        {error && <p className="muted" role="alert" style={{ color: 'var(--rope)' }}>{error}</p>}
        <Link className="btn btn-ghost" href="/login" style={{ width: '100%', marginTop: 14 }}>
          Request a new access email
        </Link>
      </div>
    </main>
  );
}
