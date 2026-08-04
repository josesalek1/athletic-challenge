'use client';

import { useEffect, useRef, useState } from 'react';
import { mmss } from '@/lib/format';
import type { Challenge } from '@/lib/types';

/* El reloj de pared de una piscina: 60 marcas, una aguja que barre,
   y un arco que se llena. Sirve igual para aguantar 3 minutos de
   plancha que para los 8 asaltos del TABATA. */

const R = 92;
const C = 2 * Math.PI * R;

type Phase = { label: string; seconds: number; color: string };

function buildPhases(ch: Challenge): Phase[] {
  const { target_s, work_s, rest_s, rounds } = ch.config;

  if (work_s && rest_s && rounds) {
    const out: Phase[] = [];
    for (let i = 1; i <= rounds; i++) {
      out.push({ label: `Asalto ${i}`, seconds: work_s, color: 'var(--rope)' });
      if (i < rounds) out.push({ label: 'Descanso', seconds: rest_s, color: 'var(--water)' });
    }
    return out;
  }
  return [{ label: ch.name, seconds: target_s ?? 180, color: 'var(--water)' }];
}

export default function PaceClock({
  challenge,
  initialSeconds,
  onSave,
}: {
  challenge: Challenge;
  initialSeconds?: number;
  onSave: (seconds: number) => Promise<void>;
}) {
  const phases = buildPhases(challenge);
  const total = phases.reduce((s, p) => s + p.seconds, 0);

  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(initialSeconds ?? 0);
  const [saving, setSaving] = useState(false);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    started.current = Date.now() - elapsed * 1000;
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - (started.current ?? 0)) / 1000);
      setElapsed(secs >= total ? total : secs);
      if (secs >= total) setRunning(false);
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, total]);

  // Fase actual y cuánto queda de ella
  let acc = 0;
  let phase = phases[0];
  let intoPhase = 0;
  for (const p of phases) {
    if (elapsed < acc + p.seconds) {
      phase = p;
      intoPhase = elapsed - acc;
      break;
    }
    acc += p.seconds;
    phase = p;
    intoPhase = p.seconds;
  }

  const done = elapsed >= total;
  const remaining = total - elapsed;
  const sweep = (elapsed % 60) / 60;
  const progress = total > 0 ? elapsed / total : 0;

  async function save() {
    setSaving(true);
    await onSave(elapsed);
    setSaved(elapsed);
    setSaving(false);
  }

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 16 }}>
        <div>
          <p className="eyebrow">{challenge.name}</p>
          {saved > 0 && (
            <p className="muted" style={{ marginTop: 4 }}>
              Hoy llevas registrado {mmss(saved)}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 18 }}>
        <svg viewBox="0 0 220 220" width="200" height="200" role="img"
             aria-label={`${mmss(remaining)} restantes`}>
          {/* 60 marcas, como el reloj de la pared */}
          {Array.from({ length: 60 }).map((_, i) => {
            const a = (i / 60) * 2 * Math.PI - Math.PI / 2;
            const big = i % 5 === 0;
            const r1 = big ? 100 : 104;
            return (
              <line
                key={i}
                x1={110 + Math.cos(a) * r1} y1={110 + Math.sin(a) * r1}
                x2={110 + Math.cos(a) * 108} y2={110 + Math.sin(a) * 108}
                stroke={big ? 'var(--mist)' : 'var(--line)'}
                strokeWidth={big ? 2 : 1}
              />
            );
          })}

          <circle cx="110" cy="110" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
          <circle
            cx="110" cy="110" r={R}
            fill="none" stroke={done ? 'var(--water)' : phase.color} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            transform="rotate(-90 110 110)"
          />

          {/* La aguja que barre el minuto */}
          <line
            x1="110" y1="110"
            x2={110 + Math.cos(sweep * 2 * Math.PI - Math.PI / 2) * 78}
            y2={110 + Math.sin(sweep * 2 * Math.PI - Math.PI / 2) * 78}
            stroke="var(--rope)" strokeWidth="2.5" strokeLinecap="round"
          />
          <circle cx="110" cy="110" r="3.5" fill="var(--rope)" />

          <text x="110" y="102" textAnchor="middle"
                fontFamily="DM Mono, monospace" fontSize="34" fill="var(--chalk)">
            {mmss(remaining)}
          </text>
          <text x="110" y="126" textAnchor="middle"
                fontFamily="DM Mono, monospace" fontSize="10"
                letterSpacing="2" fill="var(--mist)">
            {done ? 'COMPLETADO' : phase.label.toUpperCase()}
          </text>
          {phases.length > 1 && !done && (
            <text x="110" y="146" textAnchor="middle"
                  fontFamily="DM Mono, monospace" fontSize="13" fill={phase.color}>
              {phase.seconds - intoPhase}s
            </text>
          )}
        </svg>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button
          className={running ? 'btn-ghost' : 'btn-water'}
          style={{ flex: 1 }}
          onClick={() => setRunning((r) => !r)}
          disabled={done}
        >
          {running ? 'Pausar' : elapsed > 0 ? 'Seguir' : 'Empezar'}
        </button>
        <button
          className="btn-ghost"
          onClick={() => { setRunning(false); setElapsed(0); }}
        >
          Reiniciar
        </button>
      </div>

      {elapsed > 0 && (
        <button
          className="btn-rope"
          style={{ width: '100%', marginTop: 10 }}
          onClick={save}
          disabled={saving || saved === elapsed}
        >
          {saved === elapsed ? `Guardado ${mmss(elapsed)}` : `Guardar ${mmss(elapsed)}`}
        </button>
      )}
    </div>
  );
}
