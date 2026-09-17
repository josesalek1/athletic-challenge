'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const ready = Boolean(email.trim());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'link_expired') {
      setState('error');
      setMessage('This access link expired or was already used. Request a fresh one below.');
    }
  }, []);

  async function send() {
    setState('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    if (error) {
      setState('error');
      setMessage('The access link could not be sent. Check your email address and try again.');
      return;
    }
    setState('sent');
  }

  return (
    <main className="wrap" style={{ paddingTop: 'calc(72px + env(safe-area-inset-top))' }}>
      <p className="eyebrow">Since December 2025</p>
      <h1 className="display" style={{ fontSize: 46, margin: '10px 0 8px' }}>
        Athletic Challenge
      </h1>
      <p className="muted" style={{ marginBottom: 30 }}>
        Sign in to your personal tracker with an email link.
      </p>

      {state === 'sent' ? (
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Check your inbox</p>
          <p className="muted">
            Open the email on <strong>this same device</strong> and tap the sign-in link.
            It expires in one hour. Once signed in, install or open Athletic Challenge
            from that same browser. Your session will stay active for daily use.
          </p>
        </div>
      ) : (
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 5 }}>Open Athletic Challenge</p>
          <p className="muted" style={{ marginBottom: 16 }}>Use your Athletic Challenge email address.</p>
          <label htmlFor="email">Your email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            placeholder="you@email.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ready && send()}
          />

          <button
            className="btn-water"
            style={{ width: '100%', marginTop: 14 }}
            disabled={!ready || state === 'sending'}
            onClick={send}
          >
            {state === 'sending' ? 'Sending…' : 'Send me an access link'}
          </button>
          {state === 'error' && (
            <p className="muted" style={{ marginTop: 12, color: 'var(--rope)' }}>{message}</p>
          )}
        </div>
      )}
    </main>
  );
}
