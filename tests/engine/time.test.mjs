import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeBrain, has } from "./helpers.mjs";
import { parseSchedule, scheduleMatches, now, lastOccurrence, addDays, isDate } from "../../skills/general-productivity/brain-setup/engine/lib/dates.mjs";

test("day boundary: the logical day changes at 04:00", () => {
  for (const [stamp, day] of [["2026-10-17 23:59", "2026-10-17"], ["2026-10-18 00:00", "2026-10-17"], ["2026-10-18 00:30", "2026-10-17"], ["2026-10-18 03:59", "2026-10-17"], ["2026-10-18 04:00", "2026-10-18"], ["2026-10-18 04:01", "2026-10-18"]]) {
    process.env.BRAIN_NOW = stamp; assert.equal(now({}).day, day, stamp);
  }
  delete process.env.BRAIN_NOW;
});
test("a custom day_starts_at is respected", () => {
  process.env.BRAIN_NOW = "2026-10-18 05:30"; assert.equal(now({ day_starts_at: "06:00" }).day, "2026-10-17"); delete process.env.BRAIN_NOW;
});
test("schedule grammar accepts only the listed forms", () => {
  for (const ok of ["daily", "weekdays", "weekly:mon", "weekly:mon,fri", "monthly:1", "monthly:5,20", "monthly:28", "monthly:last"]) assert.ok(parseSchedule(ok), ok);
  for (const bad of ["", "Daily", "weekly:Mon", "weekly:monday", "weekly:", "monthly:0", "monthly:29", "monthly:31", "monthly:1,32", "every day", "monthly:last,1"]) assert.equal(parseSchedule(bad), null, bad);
});
test("monthly:last fires on month ends, including leap years", () => {
  const s = parseSchedule("monthly:last");
  for (const d of ["2026-02-28", "2028-02-29", "2026-04-30", "2026-12-31", "2026-01-31"]) assert.ok(scheduleMatches(s, d), d);
  for (const d of ["2028-02-28", "2026-02-27", "2026-04-29"]) assert.ok(!scheduleMatches(s, d), d);
  assert.equal(lastOccurrence(s, "2026-03-15"), "2026-02-28");
});
test("date validation rejects impossible dates", () => {
  for (const d of ["2026-02-30", "2026-13-01", "2026-00-10", "24 Oct", "2026-1-1", "2025-02-29"]) assert.equal(isDate(d), false, d);
  assert.ok(isDate("2028-02-29"));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01"); assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});
test("time zone: the same instant is a different logical day in another zone", () => {
  const env = { ...process.env }; delete process.env.BRAIN_NOW;
  const d1 = now({ timezone: "Pacific/Auckland" }).date, d2 = now({ timezone: "Pacific/Pago_Pago" }).date;
  assert.ok(d1 >= d2); // never earlier in Auckland
  Object.assign(process.env, env);
});
test("30-day soak: mornings, dumps, dones and wraps keep the brain consistent", () => {
  const b = makeBrain("2026-10-01 09:00"); b.project("p", "");
  b.w("routines/daily-start.md", "---\nslug: daily-start\nschedule: daily\n---\n- [ ] Meds [energy:: low] [effort:: xs] ^m\n");
  b.w("routines/rent.md", "---\nslug: rent\nschedule: monthly:1\n---\n- [ ] Pay rent [due:: +4d] [effort:: xs] ^rent\n");
  for (let i = 0; i < 12; i++) b.b("task", "add", "p", `Task ${i}`, "--effort", i % 2 ? "s" : "xs");
  let rng = 7; const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
  const days = [];
  for (let n = 0; n < 30; n++) {
    const d = new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10); days.push(d);
    const at = b.at(`${d} 09:00`);
    if (rand() < 0.85) { const m = at("morning"); assert.equal(m.code, 0, m.err); assert.ok(has(m.out, "Next:"), m.out); at("plan", "today", "--commit"); }
    if (rand() < 0.7) at("dump", "--kind", "dump", `- idea ${n}a\n- idea ${n}b`);
    const p = at("task", "find", "Task").out.match(/\(p\/t\d+#[0-9a-f]{6}\)/);
    if (p && rand() < 0.6) at("done", p[0].slice(1, -1));
    if (rand() < 0.8) at("wrap");
    assert.ok(!has(at("lint").out, "error:"), at("lint").out);
  }
  const r = b.at("2026-11-05 09:00")("restart"); assert.ok(r.out.trim().split("\n").length <= 8, r.out);
  const arch = fs.readdirSync(`${b.root}/daily`).length; assert.ok(arch >= 20, `${arch} archived days`);
  for (const f of fs.readdirSync(`${b.root}/daily`)) assert.equal((b.r(`daily/${f}`).match(/^### daily-start$/gm) ?? []).length <= 1, true, f);
  // every journal line is valid JSON
  for (const l of b.r(".brain/journal.jsonl").split("\n").filter(Boolean)) JSON.parse(l);
  assert.equal((b.r("projects/p/tasks.md").match(/\^t\d+/g) ?? []).length, 12);
});
