'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { today, mmss } from '@/lib/format';

type Session = {
  id: string;
  day: string;
  distance_m: number | null;
  duration_s: number | null;
  stroke: string | null;
  rpe: number | null;
  notes: string | null;
};

const STROKES = ['Crol', 'Espalda', 'Braza', 'Mariposa', 'Mixto'];

export default function SwimLog({ sessions }: { sessions: Session[] }) {
  const supabase = createClient();
  const [list, setList] = useState(sessions);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    day: today(), distance: '', minutes: '', stroke: 'Crol', rpe: '6', notes: '',
  });

  async function add() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('swim_sessions')
      .insert({
        user_id: user.id,
        day: form.day,
        distance_m: form.distance ? Number(form.distance) : null,
        duration_s: form.minutes ? Number(form.minutes) * 60 : null,
        stroke: form.stroke,
        rpe: Number(form.rpe),
        notes: form.notes || null,
      })
      .select()
      .single();

    setSaving(false);
    if (error) { alert('No se pudo guardar la sesión.'); return; }

    setList((l) => [data as Session, ...l]);
    setOpen(false);
    setForm({ ...form, distance: '', minutes: '', notes: '' });
  }

  const totalMonth = list
    .filter((s) => s.day.slice(0, 7) === today().slice(0, 7))
    .reduce((sum, s) => sum + (s.distance_m ?? 0), 0);

  return (
    <main className="wrap">
      <p className="eyebrow">Solo tú ves esto</p>
      <h1 className="display" style={{ fontSize: 36, margin: '8px 0 6px' }}>Natación</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        Fuera del tablero del grupo. No se comparte ni aparece en los partes.
      </p>

      <div className="card">
        <p className="eyebrow">Este mes</p>
        <p className="num display" style={{ fontSize: 44, marginTop: 6 }}>
          {(totalMonth / 1000).toFixed(1)}<span style={{ fontSize: 18 }}> km</span>
        </p>
      </div>

      {open ? (
        <div className="card">
          <div className="stack">
            <div>
              <label htmlFor="d">Día</label>
              <input id="d" type="date" value={form.day}
                     onChange={(e) => setForm({ ...form, day: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="m">Metros</label>
                <input id="m" type="number" inputMode="numeric" placeholder="1500" value={form.distance}
                       onChange={(e) => setForm({ ...form, distance: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="t">Minutos</label>
                <input id="t" type="number" inputMode="numeric" placeholder="40" value={form.minutes}
                       onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="s">Estilo</label>
                <select id="s" value={form.stroke}
                        onChange={(e) => setForm({ ...form, stroke: e.target.value })}>
                  {STROKES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="r">Esfuerzo 1–10</label>
                <input id="r" type="number" min="1" max="10" value={form.rpe}
                       onChange={(e) => setForm({ ...form, rpe: e.target.value })} />
              </div>
            </div>
            <div>
              <label htmlFor="n">Notas</label>
              <input id="n" placeholder="Series de 100, hombro bien" value={form.notes}
                     onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <button className="btn-water" style={{ flex: 1 }} onClick={add} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar sesión'}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className="btn-rope" style={{ width: '100%', marginBottom: 14 }}
                onClick={() => setOpen(true)}>
          Añadir sesión
        </button>
      )}

      {list.length === 0 ? (
        <p className="empty">Aún no hay sesiones. La primera se añade arriba.</p>
      ) : (
        list.map((s) => (
          <div key={s.id} className="card" style={{ padding: 14 }}>
            <div className="between">
              <div>
                <p className="num" style={{ fontSize: 15 }}>
                  {s.distance_m ? `${s.distance_m} m` : '—'}
                  {s.duration_s ? ` · ${mmss(s.duration_s)}` : ''}
                </p>
                <p className="muted" style={{ marginTop: 3 }}>
                  {new Date(s.day + 'T12:00:00').toLocaleDateString('es-ES', {
                    day: 'numeric', month: 'short',
                  })}
                  {s.stroke ? ` · ${s.stroke}` : ''}
                  {s.rpe ? ` · esfuerzo ${s.rpe}` : ''}
                </p>
                {s.notes && <p className="muted" style={{ marginTop: 5 }}>{s.notes}</p>}
              </div>
              {s.distance_m && s.duration_s && (
                <p className="num" style={{ fontSize: 13, color: 'var(--water)' }}>
                  {mmss(Math.round((s.duration_s / s.distance_m) * 100))}/100m
                </p>
              )}
            </div>
          </div>
        ))
      )}
    </main>
  );
}
