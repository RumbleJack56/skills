// Dates are plain 'YYYY-MM-DD' strings. Day arithmetic uses UTC day numbers, so DST never matters.
export const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const pad = (n) => String(n).padStart(2, "0");

export function isDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && y >= 1970;
}
export const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s ?? "");
// 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM'. Returns {date, time|null} or null.
export function parseWhen(s) {
  const m = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?$/.exec((s ?? "").trim());
  if (!m || !isDate(m[1]) || (m[2] && !isTime(m[2]))) return null;
  return { date: m[1], time: m[2] ?? null };
}
export const dayNum = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / 864e5);
export const fromDayNum = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
export const addDays = (s, n) => fromDayNum(dayNum(s) + n);
export const diffDays = (a, b) => dayNum(a) - dayNum(b);
export const dow = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const dayOfMonth = (s) => +s.slice(8, 10);
export const isLastOfMonth = (s) => dayOfMonth(s) === daysInMonth(+s.slice(0, 4), +s.slice(5, 7));

// Current local time in the brain's time zone. BRAIN_NOW="YYYY-MM-DD HH:MM" overrides it (tests).
export function now(cfg = {}) {
  const o = process.env.BRAIN_NOW;
  let date, time;
  if (o) {
    const w = parseWhen(o);
    if (!w || !w.time) throw new Error(`BRAIN_NOW must be "YYYY-MM-DD HH:MM", got "${o}"`);
    ({ date, time } = w);
  } else {
    const tz = process.env.BRAIN_TZ || cfg.timezone || undefined;
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    date = `${p.year}-${p.month}-${p.day}`;
    time = `${p.hour}:${p.minute}`;
  }
  // The logical day changes at day_starts_at, not at midnight.
  const starts = /^\d{2}:\d{2}$/.test(cfg.day_starts_at ?? "") ? cfg.day_starts_at : "04:00";
  const day = time < starts ? addDays(date, -1) : date;
  return { date, time, day, stamp: `${date} ${time}` };
}

// Schedule grammar (strict): daily | weekdays | weekly:mon[,fri] | monthly:N[,M] | monthly:last
export function parseSchedule(s) {
  s = (s ?? "").trim();
  if (s === "daily" || s === "weekdays" || s === "monthly:last") return { kind: s === "monthly:last" ? "last" : s };
  let m = /^weekly:((?:mon|tue|wed|thu|fri|sat|sun)(?:,(?:mon|tue|wed|thu|fri|sat|sun))*)$/.exec(s);
  if (m) return { kind: "weekly", days: [...new Set(m[1].split(","))] };
  m = /^monthly:(\d{1,2}(?:,\d{1,2})*)$/.exec(s);
  if (m) {
    const days = [...new Set(m[1].split(",").map(Number))];
    if (days.some((d) => d < 1 || d > 28)) return null; // 29-31 skip short months: use monthly:last
    return { kind: "monthly", days };
  }
  return null;
}
export function scheduleMatches(sch, date) {
  switch (sch.kind) {
    case "daily": return true;
    case "weekdays": return dow(date) >= 1 && dow(date) <= 5;
    case "weekly": return sch.days.includes(DOW[dow(date)]);
    case "monthly": return sch.days.includes(dayOfMonth(date));
    case "last": return isLastOfMonth(date);
  }
  return false;
}
// Latest scheduled date on or before `date`, looking back at most 62 days.
export function lastOccurrence(sch, date) {
  for (let i = 0; i < 62; i++) { const d = addDays(date, -i); if (scheduleMatches(sch, d)) return d; }
  return null;
}
export const pad2 = pad;
