import { createClient } from '@/lib/supabase/server';
import { lastNDays, dowOf, today } from '@/lib/format';
import type { Challenge, Entry } from '@/lib/types';

export const dynamic = 'force-dynamic';

/* Cada día es una pila de barras: una por reto.
   Cian = yóguico, naranja = tradicional, apagada = sin hacer. */

function met(entry: Entry | undefined, ch: Challenge) {
  if (!entry) return false;
  const p = entry.payload;
  if (ch.kind === 'checklist') return (p.done?.length ?? 0) >= (ch.config.daily_goal ?? 3);
  if (ch.kind === 'timed') return (p.seconds ?? 0) >= (ch.config.target_s ?? 1);
  if (ch.kind === 'reps') return (p.reps ?? 0) >= (ch.config.target ?? 1);
  if (ch.kind === 'done') return Boolean(p.ok);
  return false;
}

export default async function Semana() {
  const supabase = await createClient();
  const days = lastNDays(7);
  const hoy = today();

  const [{ data: profiles }, { data: entries }, { data: challenges }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('entries').select('*').gte('day', days[0]),
    supabase.from('challenges').select('*').eq('active', true).order('sort_order'),
  ]);

  const active = (challenges ?? []) as Challenge[];
  const rows = profiles ?? [];
  const all = (entries ?? []) as Entry[];

  const byKey = new Map<string, Entry>();
  all.forEach((e) => byKey.set(`${e.user_id}|${e.day}|${e.challenge_id}`, e));

  function streak(userId: string) {
    let n = 0;
    for (let i = 0; i < 90; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const off = d.getTimezoneOffset() * 60000;
      const iso = new Date(d.getTime() - off).toISOString().slice(0, 10);
      const any = all.some((e) => e.user_id === userId && e.day === iso);
      if (any) n++;
      else if (i > 0) break;
    }
    return n;
  }

  return (
    <main className="wrap">
      <p className="eyebrow">Last 7 days</p>
      <h1 className="display" style={{ fontSize: 36, margin: '8px 0 14px' }}>The board</h1>

      <div className="legend">
        <span><i style={{ background: 'var(--water)' }} />Yogic</span>
        <span><i style={{ background: 'var(--rope)' }} />Traditional</span>
        <span><i style={{ background: 'var(--line)' }} />Not done</span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">
          Nobody in yet.
          <br />
          Add the emails to <code>allowed_emails</code> and share the link.
        </p>
      ) : (
        <div className="card">
          <table className="board">
            <thead>
              <tr>
                <th className="who"></th>
                {days.map((d) => <th key={d}>{dowOf(d)}</th>)}
                <th>🔥</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="who">{p.display_name}</td>
                  {days.map((d) => (
                    <td key={d}>
                      <div className="bars"
                           title={`${p.display_name} · ${d}`}
                           style={d === hoy ? { opacity: 0.95 } : undefined}>
                        {active.map((c) => {
                          const e = byKey.get(`${p.id}|${d}|${c.id}`);
                          return (
                            <i key={c.id} className="bar"
                               data-cat={c.category}
                               data-on={met(e, c)} />
                          );
                        })}
                      </div>
                    </td>
                  ))}
                  <td className="num" style={{ fontSize: 13, color: 'var(--rope)' }}>
                    {streak(p.id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ textAlign: 'center', paddingBottom: 10 }}>
        One bar per challenge, in the same order as the tabs. Full height means the goal was met.
      </p>
    </main>
  );
}
