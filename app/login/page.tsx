'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function send() {
    setState('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    if (error) {
      setState('error');
      setMessage(
        error.message.includes('no pertenece')
          ? 'Ese correo no está en el grupo. Pídele a quien lo administra que lo añada.'
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
        El parte diario de los cinco. Entra con tu correo — no hay contraseña.
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
          <label htmlFor="email">Tu correo</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            placeholder="tu@correo.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && email && send()}
          />
          <button
            className="btn-water"
            style={{ width: '100%', marginTop: 14 }}
            disabled={!email || state === 'sending'}
            onClick={send}
          >
            {state === 'sending' ? 'Enviando…' : 'Enviarme el enlace'}
          </button>
          {state === 'error' && (
            <p className="muted" style={{ marginTop: 12, color: 'var(--rope)' }}>{message}</p>
          )}
        </div>
      )}
    </main>
  );
}
