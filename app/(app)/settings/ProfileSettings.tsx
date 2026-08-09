'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { clearOfflineData } from '@/lib/offline';

type Feedback = { tone: 'success' | 'error'; text: string } | null;

export default function ProfileSettings({
  userId,
  initialName,
  initialEmail,
  role,
  joinedAt,
}: {
  userId: string;
  initialName: string;
  initialEmail: string;
  role: 'admin' | 'member';
  joinedAt: string;
}) {
  const supabase = createClient();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [nameBusy, setNameBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null);
  const [accountFeedback, setAccountFeedback] = useState<Feedback>(null);

  async function saveName() {
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 50) {
      setNameFeedback({ tone: 'error', text: 'Use a name between 2 and 50 characters.' });
      return;
    }

    setNameBusy(true);
    setNameFeedback(null);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: cleanName })
      .eq('id', userId);
    setNameBusy(false);

    if (error) {
      setNameFeedback({ tone: 'error', text: 'Your name could not be updated.' });
      return;
    }
    setName(cleanName);
    setSavedName(cleanName);
    setNameFeedback({ tone: 'success', text: 'Name updated.' });
  }

  async function requestEmailChange() {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setEmailFeedback({ tone: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (cleanEmail === initialEmail.toLowerCase()) {
      setEmailFeedback({ tone: 'error', text: 'This is already your current email.' });
      return;
    }

    setEmailBusy(true);
    setEmailFeedback(null);
    const { error } = await supabase.auth.updateUser(
      { email: cleanEmail },
      { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` }
    );
    setEmailBusy(false);

    if (error) {
      setEmailFeedback({ tone: 'error', text: 'The email change could not be started.' });
      return;
    }
    setEmailFeedback({
      tone: 'success',
      text: 'Confirmation sent. Your current email remains active until the change is confirmed.',
    });
  }

  async function signOut(scope: 'local' | 'global') {
    if (scope === 'global' && !window.confirm('Sign out of Athletic Challenge on every device?')) {
      return;
    }

    setSignOutBusy(true);
    setAccountFeedback(null);
    const { error } = await supabase.auth.signOut({ scope });
    if (error) {
      setSignOutBusy(false);
      setAccountFeedback({ tone: 'error', text: 'Could not sign out. Try again.' });
      return;
    }
    clearOfflineData();
    window.location.replace('/login');
  }

  const joined = joinedAt
    ? new Date(joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <main className="wrap">
      <p className="eyebrow">Account and privacy</p>
      <h1 className="display" style={{ fontSize: 38, margin: '8px 0 6px' }}>Settings</h1>
      <p className="muted">Manage your identity and active sessions.</p>

      <section className="settings-section">
        <p className="eyebrow">Profile</p>
        <div className="card">
          <div className="settings-field">
            <label htmlFor="profile-name">Display name</label>
            <input id="profile-name" type="text" autoComplete="name" maxLength={50}
                   value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <button className="btn-water" style={{ width: '100%', marginTop: 14 }}
                  disabled={nameBusy || name.trim() === savedName}
                  onClick={saveName}>
            {nameBusy ? 'Saving…' : 'Save name'}
          </button>
          {nameFeedback && (
            <p className="settings-feedback muted" data-tone={nameFeedback.tone}>{nameFeedback.text}</p>
          )}
        </div>
      </section>

      <section className="settings-section">
        <p className="eyebrow">Email</p>
        <div className="card">
          <div className="settings-field">
            <label htmlFor="profile-email">Email address</label>
            <input id="profile-email" type="email" inputMode="email" autoComplete="email"
                   value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <p className="muted" style={{ marginTop: 9 }}>
            Changing your email requires confirmation. Your current address works until then.
          </p>
          <button className="btn-water" style={{ width: '100%', marginTop: 14 }}
                  disabled={emailBusy || email.trim().toLowerCase() === initialEmail.toLowerCase()}
                  onClick={requestEmailChange}>
            {emailBusy ? 'Sending…' : 'Change email'}
          </button>
          {emailFeedback && (
            <p className="settings-feedback muted" data-tone={emailFeedback.tone}>{emailFeedback.text}</p>
          )}
        </div>
      </section>

      <section className="settings-section">
        <p className="eyebrow">Membership</p>
        <div className="card">
          <div className="between">
            <div>
              <p style={{ fontWeight: 600 }}>Athletic Challenge</p>
              <p className="muted" style={{ marginTop: 3 }}>Joined {joined}</p>
            </div>
            <span className="membership-badge">{role}</span>
          </div>
        </div>
      </section>

      {role === 'admin' && (
        <section className="settings-section">
          <p className="eyebrow">Administration</p>
          <div className="card admin-entry-card">
            <div>
              <p style={{ fontWeight: 600 }}>Manage Athletic Challenge</p>
              <p className="muted" style={{ marginTop: 4 }}>
                Members, challenges, videos and the registration code.
              </p>
            </div>
            <Link className="btn btn-water" href="/admin">Open admin panel</Link>
          </div>
        </section>
      )}

      <section className="settings-section">
        <p className="eyebrow">Sessions</p>
        <div className="card danger-card">
          <p style={{ fontWeight: 600 }}>Sign out</p>
          <p className="muted" style={{ marginTop: 5 }}>
            This device stays signed in for daily use until you sign out or remove its browser data.
          </p>
          <div className="settings-actions">
            <button className="btn-ghost" disabled={signOutBusy} onClick={() => signOut('local')}>
              Sign out on this device
            </button>
            <button className="btn-rope" disabled={signOutBusy} onClick={() => signOut('global')}>
              Sign out on every device
            </button>
          </div>
          {accountFeedback && (
            <p className="settings-feedback muted" data-tone={accountFeedback.tone}>{accountFeedback.text}</p>
          )}
        </div>
      </section>
    </main>
  );
}
