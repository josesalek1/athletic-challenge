'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const ready = Boolean(
    email.trim() &&
    (mode === 'login' || (displayName.trim() && inviteCode.trim()))
  );

  async function send() {
    setState('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
        ...(mode === 'register' && {
          data: {
            display_name: displayName.trim(),
            invite_code: inviteCode.trim(),
          },
        }),
      },
    });

    if (error) {
      setState('error');
      setMessage(
        mode === 'register'
          ? 'Registration failed. Check your name and group code.'
          : 'The sign-in link could not be sent. Check your email and try again.'
      );
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
        Your group’s daily challenge. Sign in with your email — no password needed.
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
          <div className="chips" role="tablist" style={{ marginBottom: 18 }}>
            <button className="chip" role="tab" data-on={mode === 'login'}
                    aria-selected={mode === 'login'} onClick={() => {
                      setMode('login');
                      setState('idle');
                    }}>
              Sign in
            </button>
            <button className="chip" role="tab" data-on={mode === 'register'}
                    aria-selected={mode === 'register'} onClick={() => {
                      setMode('register');
                      setState('idle');
                    }}>
              Register
            </button>
          </div>

          {mode === 'register' && (
            <>
              <label htmlFor="display-name">Your name</label>
              <input
                id="display-name"
                type="text"
                autoComplete="name"
                value={displayName}
                placeholder="First and last name"
                maxLength={50}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </>
          )}

          <label htmlFor="email" style={{ marginTop: mode === 'register' ? 14 : 0 }}>
            Your email
          </label>
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

          {mode === 'register' && (
            <>
              <label htmlFor="invite-code" style={{ marginTop: 14 }}>Group code</label>
              <input
                id="invite-code"
                type="text"
                autoComplete="off"
                value={inviteCode}
                placeholder="Private group code"
                onChange={(e) => setInviteCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ready && send()}
              />
            </>
          )}

          <button
            className="btn-water"
            style={{ width: '100%', marginTop: 14 }}
            disabled={!ready || state === 'sending'}
            onClick={send}
          >
            {state === 'sending'
              ? 'Sending…'
              : mode === 'register' ? 'Register and send link' : 'Send me a sign-in link'}
          </button>
          {state === 'error' && (
            <p className="muted" style={{ marginTop: 12, color: 'var(--rope)' }}>{message}</p>
          )}
        </div>
      )}
    </main>
  );
}
