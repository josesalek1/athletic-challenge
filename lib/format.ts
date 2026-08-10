export function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function today() {
  // Fecha local, no UTC. Con UTC un registro nocturno cae en el día siguiente.
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const off = d.getTimezoneOffset() * 60000;
    out.push(new Date(d.getTime() - off).toISOString().slice(0, 10));
  }
  return out;
}

export function daysEndingAt(iso: string, n: number): string[] {
  const out: string[] = [];
  const base = new Date(`${iso}T12:00:00`);
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(base);
    date.setDate(base.getDate() - i);
    out.push(date.toISOString().slice(0, 10));
  }
  return out;
}

export const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export function dowOf(iso: string) {
  return DOW[new Date(iso + 'T12:00:00').getDay()];
}
