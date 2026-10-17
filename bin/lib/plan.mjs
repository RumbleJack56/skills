// Planner: ready tasks -> scored -> per-project top K -> beam search inside the minutes budget.
import { addDays, diffDays } from "./dates.mjs";
import { EFFORT_MIN, ENERGY, isFinished } from "./tasks.mjs";

const DAY_MIN = 240; // productive minutes per day, used to back-schedule deadlines
const LANE_DAYS = 7;
const SLIPPED_AFTER = 7;
export const mins = (t) => EFFORT_MIN[t.effort] ?? EFFORT_MIN.s;
export const ref = (t) => `${t.key}#${t.hash}`;
export const label = (t) => `${t.title}  [${t.project}, ${t.effort}, ${t.energy}]`;

export function makePlanner(all, today, opts = {}) {
  const tasks = all.tasks;
  const byKey = all.byKey;
  const open = tasks.filter((t) => !t.closed);
  const finished = (k) => { const d = byKey.get(k); return d ? isFinished(d) : false; };

  const hiddenTask = (t) => t.projectState?.hidden || (t.start && t.start > today);
  const plannable = (t) => !t.closed && !t.bad && !hiddenTask(t) && t.project !== "reminders";
  const needsFixing = open.filter((t) => t.bad && !t.projectState?.hidden);

  // successors among open tasks
  const succ = new Map(open.map((t) => [t.key, []]));
  for (const t of open) for (const a of t.after) if (succ.has(a)) succ.get(a).push(t.key);
  const byK = new Map(tasks.map((t) => [t.key, t]));
  const taskOf = (k) => byK.get(k);

  // effective due: own due, or the successor's effective due minus the successor's duration
  const eff = new Map();
  {
    const indeg = new Map(open.map((t) => [t.key, 0]));
    for (const [, ss] of succ) for (const s of ss) indeg.set(s, indeg.get(s) + 1);
    const order = [];
    const q = [...indeg].filter(([, n]) => n === 0).map(([k]) => k);
    while (q.length) { const k = q.pop(); order.push(k); for (const s of succ.get(k)) { indeg.set(s, indeg.get(s) - 1); if (!indeg.get(s)) q.push(s); } }
    for (const t of open) eff.set(t.key, t.due);
    for (let i = order.length - 1; i >= 0; i--) {
      const t = taskOf(order[i]);
      let best = t.due;
      for (const s of succ.get(t.key)) {
        const st = taskOf(s), sd = eff.get(s);
        if (!sd) continue;
        const d = addDays(sd, -Math.ceil(mins(st) / DAY_MIN));
        if (!best || d < best) best = d;
      }
      eff.set(t.key, best);
    }
  }
  const effDue = (t) => eff.get(t.key) ?? null;
  const daysLeft = (t) => { const e = effDue(t); return e ? diffDays(e, today) : null; };

  function downstream(key, limit = 50) {
    const seen = new Set(), stack = [...(succ.get(key) ?? [])];
    while (stack.length && seen.size < limit) { const k = stack.pop(); if (seen.has(k)) continue; seen.add(k); stack.push(...(succ.get(k) ?? [])); }
    return seen.size;
  }
  const depsDone = (t, extra) => t.after.every((a) => finished(a) || extra.has(a));

  function score(t, E) {
    const left = daysLeft(t);
    const urgency = left === null ? 0 : left <= 2 ? 5 : left <= 7 ? 3 : left <= 21 ? 2 : 1;
    const gap = ENERGY[E] - ENERGY[t.energy];
    const fit = gap === 0 ? 2 : gap === 1 ? 1 : gap > 1 ? 0.5 : -9;
    const ease = mins(t) <= 45 ? 1 : 0;
    const dn = downstream(t.key);
    const unlock = Math.min(dn, 3);
    const stale = (t.touched && diffDays(today, t.touched) > 14 ? 1 : 0) + Math.min(t.slips, 2) * 0.5;
    const s = 2 * urgency + 2 * t.value + 3 * fit + ease + unlock + stale;
    const why = [];
    if (left !== null && left <= LANE_DAYS) why.push(`due ${effDue(t)}${!t.due || effDue(t) < t.due ? " (pulled by what it unblocks)" : ""}`);
    if (dn) why.push(`unlocks ${dn >= 50 ? "many" : dn}`);
    if (fit >= 2) why.push(`fits ${E} energy`);
    if (t.slips) why.push(`slipped ${t.slips}x`);
    return { s, why };
  }

  const isReady = (t, extra, E, anyEnergy = false) =>
    plannable(t) && !extra.has(t.key) && !t.waiting && (!t.routine || t.due) && depsDone(t, extra) && (anyEnergy || ENERGY[t.energy] <= ENERGY[E]);
  const slippedTask = (t) => { const d = daysLeft(t); return d !== null && d < -SLIPPED_AFTER; };

  function topK(cands, E, K) {
    const by = new Map();
    for (const t of cands) (by.get(t.project) ?? by.set(t.project, []).get(t.project)).push(t);
    return [...by.values()].flatMap((l) => l.sort((a, b) => score(b, E).s - score(a, E).s || a.key.localeCompare(b.key)).slice(0, K));
  }

  function laneOf(E, budget) {
    const cand = open.filter((t) => isReady(t, new Set(), E, true) && !slippedTask(t))
      .filter((t) => { const d = daysLeft(t); return d !== null && d <= LANE_DAYS; })
      .sort((a, b) => effDue(a).localeCompare(effDue(b)) || a.key.localeCompare(b.key));
    const lane = []; let used = 0; const more = [];
    for (const t of cand) {
      if (lane.length < 3 && used + mins(t) <= budget) { lane.push(t); used += mins(t); } else more.push(t);
    }
    return { lane, used, more };
  }

  function beam(E, budget, maxPicks, K = 3, B = 5) {
    const { lane, used: laneUsed, more } = laneOf(E, budget);
    let states = [{ done: new Set(lane.map((t) => t.key)), picks: [], used: laneUsed, score: 0 }];
    const skip = (t) => slippedTask(t) || lane.includes(t);
    for (let depth = 0; depth < Math.max(0, maxPicks - lane.length); depth++) {
      const next = [];
      for (const st of states) {
        const cands = topK(open.filter((t) => isReady(t, st.done, E) && !skip(t)), E, K).filter((t) => st.used + mins(t) <= budget);
        if (!cands.length) { next.push(st); continue; }
        for (const t of cands) {
          const same = st.picks.filter((p) => p.project === t.project).length;
          next.push({ done: new Set([...st.done, t.key]), picks: [...st.picks, t], used: st.used + mins(t), score: st.score + Math.pow(0.9, depth) * score(t, E).s - 2 * same });
        }
      }
      const seen = new Set();
      states = next.sort((a, b) => b.score - a.score).filter((s) => { const k = [...s.done].sort().join(","); return seen.has(k) ? false : seen.add(k); }).slice(0, B);
    }
    return { lane, more, picks: states[0].picks, used: states[0].used };
  }

  const slipped = open.filter((t) => plannable(t) && !t.waiting && (!t.routine || t.due) && slippedTask(t))
    .sort((a, b) => effDue(a).localeCompare(effDue(b)));
  const followUps = open.filter((t) => plannable(t) && t.waiting && t.check && t.check <= today);
  const energyOf = (E) => (E in ENERGY ? E : "med");

  return {
    open, needsFixing, slipped, followUps, effDue, daysLeft, score, downstream, depsDone, plannable, isReady, topK, laneOf, beam, taskOf,
    next(E, budget) {
      E = energyOf(E);
      const b = beam(E, budget, 1);
      const pick = b.lane[0] ?? b.picks[0] ?? null;
      return { pick, why: pick ? score(pick, E).why : [], ...b };
    },
    today(E, budget, max = 3) {
      E = energyOf(E);
      const b = beam(E, budget, max);
      return { ...b, followUps };
    },
    all() {
      const out = [];
      const projects = [...new Set(open.map((t) => t.project))];
      for (const p of projects) {
        const mine = open.filter((t) => t.project === p && !t.projectState?.hidden);
        if (!mine.length) continue;
        const ready = mine.filter((t) => plannable(t) && !t.waiting && depsDone(t, new Set()));
        const blocked = mine.filter((t) => !ready.includes(t) && !t.bad).map((t) => ({
          t, by: t.waiting ? `waiting on ${t.waiting}` : `after ${t.after.filter((a) => !finished(a)).map((a) => taskOf(a)?.title ?? a).join(", ")}`,
        }));
        out.push({ project: p, ready: topK(ready, "high", 3), readyCount: ready.length, blocked });
      }
      const risk = open.filter((t) => plannable(t) && (daysLeft(t) ?? 0) < 0 && !slippedTask(t));
      const blockers = open.filter((t) => t.waiting && !t.bad).sort((a, b) => downstream(b.key) - downstream(a.key));
      return { projects: out, risk, blockers, slipped, needsFixing };
    },
  };
}
