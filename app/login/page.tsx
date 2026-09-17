'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'error'>('idle');
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
    setMessage('');
    setState('sent');
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code)) {
      setMessage('Enter the six-digit code from the email.');
      return;
    }
    setState('verifying');
    setMessage('');
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: 'magiclink',
    });
    if (error) {
      setState('sent');
      setMessage('The code is invalid or expired. Request a new email and try again.');
      return;
    }
    window.location.replace('/hoy');
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

      {state === 'sent' || state === 'verifying' ? (
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Check your inbox</p>
          <p className="muted">
            Enter the six-digit code below to sign in to this installed app.
            The email link opens the browser and signs in there instead.
          </p>
          <label htmlFor="access-code">Access code</label>
          <input id="access-code" type="text" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]*" maxLength={6} value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(event) => event.key === 'Enter' && void verifyCode()}
            placeholder="6-digit code" />
          <button className="btn-water" style={{ width: '100%', marginTop: 14 }}
            disabled={state === 'verifying' || code.length !== 6} onClick={verifyCode}>
            {state === 'verifying' ? 'Signing in…' : 'Sign in with code'}
          </button>
          {message && <p className="muted" role="alert" style={{ marginTop: 12, color: 'var(--rope)' }}>{message}</p>}
          <button className="btn-ghost" style={{ width: '100%', marginTop: 14 }}
            disabled={state === 'verifying'} onClick={() => { setCode(''); setMessage(''); setState('idle'); }}>
            Use another email or request a new code
          </button>
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
