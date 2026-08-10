'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { mmss } from '@/lib/format';
import type { Challenge } from '@/lib/types';

/* Cronómetro: cuenta hacia arriba y guarda al parar.
   La aguja barre el minuto, como el reloj de pared de una piscina. */

export default function Stopwatch({
  challenge,
  initialSeconds,
  onSave,
  onClear,
  footer,
}: {
  challenge: Challenge;
  initialSeconds?: number;
  onSave: (seconds: number) => Promise<void>;
  onClear: () => Promise<void>;
  footer?: ReactNode;
}) {
  const target = challenge.config.target_s ?? 0;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(initialSeconds ?? 0);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    started.current = Date.now() - elapsed * 1000;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (started.current ?? 0)) / 1000));
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  async function stop() {
    setRunning(false);
    if (elapsed > 0) {
      await onSave(elapsed);
      setSaved(elapsed);
    }
  }

  // Reset borra el registro del día: si no, el parte de WhatsApp
  // seguiría anunciando un tiempo que ya no cuenta.
  async function reset() {
    setElapsed(0);
    if (saved > 0) {
      await onClear();
      setSaved(0);
    }
  }

  const sweep = (elapsed % 60) / 60;
  const ring = target ? Math.min(1, elapsed / target) : sweep;
  const R = 92, C = 2 * Math.PI * R;

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 4 }}>
        <p className="eyebrow">{challenge.name}</p>
        <p className="num" style={{ fontSize: 12, color: saved ? 'var(--water)' : 'var(--mist)' }}>
          {saved ? `${mmss(saved)} logged` : target ? `goal ${mmss(target)}` : ''}
        </p>
      </div>
      {challenge.config.blurb && (
        <p className="muted" style={{ marginBottom: 14 }}>{challenge.config.blurb}</p>
      )}

      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}>
        <svg viewBox="0 0 220 220" width="196" height="196" role="img"
             aria-label={`${mmss(elapsed)} elapsed`}>
          {Array.from({ length: 60 }).map((_, i) => {
            const a = (i / 60) * 2 * Math.PI - Math.PI / 2;
            const big = i % 5 === 0;
            const r1 = big ? 100 : 104;
            return (
              <line key={i}
                x1={110 + Math.cos(a) * r1} y1={110 + Math.sin(a) * r1}
                x2={110 + Math.cos(a) * 108} y2={110 + Math.sin(a) * 108}
                stroke={big ? 'var(--mist)' : 'var(--line)'} strokeWidth={big ? 2 : 1} />
            );
          })}

          <circle cx="110" cy="110" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
          <circle cx="110" cy="110" r={R} fill="none"
                  stroke={target && elapsed >= target ? 'var(--water)' : 'var(--rope)'}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - ring)}
                  transform="rotate(-90 110 110)" />

          <line x1="110" y1="110"
                x2={110 + Math.cos(sweep * 2 * Math.PI - Math.PI / 2) * 78}
                y2={110 + Math.sin(sweep * 2 * Math.PI - Math.PI / 2) * 78}
                stroke="var(--rope)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="110" cy="110" r="3.5" fill="var(--rope)" />

          <text x="110" y="106" textAnchor="middle"
                fontFamily="DM Mono, monospace" fontSize="36" fill="var(--chalk)">
            {mmss(elapsed)}
          </text>
          {target > 0 && elapsed >= target && (
            <text x="110" y="130" textAnchor="middle" fontFamily="DM Mono, monospace"
                  fontSize="10" letterSpacing="2" fill="var(--water)">GOAL</text>
          )}
        </svg>
      </div>

      <div className="row" style={{ gap: 10 }}>
        {running ? (
          <button className="btn-rope" style={{ flex: 1 }} onClick={stop}>
            Stop and save
          </button>
        ) : (
          <button className="btn-water" style={{ flex: 1 }} onClick={() => setRunning(true)}>
            {elapsed > 0 ? 'Resume' : 'Start'}
          </button>
        )}
        {(elapsed > 0 || saved > 0) && !running && (
          <button className="btn-ghost" onClick={reset}>Reset</button>
        )}
      </div>
      {footer}
    </div>
  );
}
