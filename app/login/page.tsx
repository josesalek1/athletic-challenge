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
          ? 'No se pudo completar el registro. Revisa tu nombre y el código interno.'
          : 'No se pudo enviar el enlace. Revisa el correo e inténtalo otra vez.'
      );
      return;
    }
    setState('sent');
  }

  return (
    <main className="wrap" style={{ paddingTop: 72 }}>
      <p className="eyebrow">Desde diciembre de 2025</p>
      <h1 className="display" style={{ fontSize: 46, margin: '10px 0 8px' }}>
        Athletic Challenge
      </h1>
      <p className="muted" style={{ marginBottom: 30 }}>
        El reto diario del grupo. Entra con tu correo — no hay contraseña.
      </p>

      {state === 'sent' ? (
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Enlace enviado</p>
          <p className="muted">
            Abre el correo en <strong>este mismo teléfono</strong> y pulsa el enlace.
            Caduca en una hora.
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
              Entrar
            </button>
            <button className="chip" role="tab" data-on={mode === 'register'}
                    aria-selected={mode === 'register'} onClick={() => {
                      setMode('register');
                      setState('idle');
                    }}>
              Registrarme
            </button>
          </div>

          {mode === 'register' && (
            <>
              <label htmlFor="display-name">Tu nombre</label>
              <input
                id="display-name"
                type="text"
                autoComplete="name"
                value={displayName}
                placeholder="Nombre y apellido"
                maxLength={50}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </>
          )}

          <label htmlFor="email" style={{ marginTop: mode === 'register' ? 14 : 0 }}>
            Tu correo
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            placeholder="tu@correo.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ready && send()}
          />

          {mode === 'register' && (
            <>
              <label htmlFor="invite-code" style={{ marginTop: 14 }}>Código interno</label>
              <input
                id="invite-code"
                type="text"
                autoComplete="off"
                value={inviteCode}
                placeholder="Código del grupo"
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
              ? 'Enviando…'
              : mode === 'register' ? 'Registrarme y enviar enlace' : 'Enviarme el enlace'}
          </button>
          {state === 'error' && (
            <p className="muted" style={{ marginTop: 12, color: 'var(--rope)' }}>{message}</p>
          )}
        </div>
      )}
    </main>
  );
}
