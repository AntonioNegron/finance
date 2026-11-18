// Date helpers: dates are YYYY-MM-DD strings, months YYYY-MM.
const pad = (n: number) => String(n).padStart(2, '0');

export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Same day next month, clamped to the month's last day. */
export function addOneMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, dim))).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayDiff = (a: string, b: string) => Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;
