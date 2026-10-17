// Day rhythm: plan rendering, routines, morning, restart, backlog, weekly, lint, projects, hooks, backup.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tx, withLock, readDoc, safeRead, readJournal } from "./store.mjs";
import { cleanTitle, clean, plural } from "./util.mjs";
import { coverageLine, coverageOk, parseFrontmatter, hasTag, listProjectDirs } from "./brain.mjs";
import { DOW, addDays, diffDays, parseSchedule, lastOccurrence, dow, isDate } from "./dates.mjs";
import { makePlanner, ref, mins } from "./plan.mjs";
import { parseTaskLine, parseTasks } from "./tasks.mjs";
import { addToSection } from "./today.mjs";
import { ensureToday, flush, rollover, planCommit } from "./cmd-core.mjs";
import { dueReminders, fleetingNotes, spreadInbox } from "./cmd-notes.mjs";
import { itemsOf, walkMd, KNOWLEDGE_DIRS } from "./notes.mjs";

const T = (t) => clean(t.title);

// ---------- plan ----------
export function runPlan(ctx, mode, o = {}) {
  const all = ctx.load();
  const E = o.energy ?? ctx.cfg.energy ?? "med";
  const budget = Number(o.minutes ?? ctx.cfg.minutes ?? 180);
  const P = makePlanner(all, ctx.day, o);
  const out = [];
  let result = {};
  if (mode === "next") {
    const r = P.next(E, budget);
    result = { next: r.pick ? ref(r.pick) : null };
    if (r.pick) {
      out.push(`Next: ${T(r.pick)}  [${r.pick.project}, ${r.pick.effort}, ${r.pick.energy}]  (${ref(r.pick)})`);
      out.push(`  why: ${r.why.join("; ") || "best score available"}`);
    } else out.push("Next: nothing is ready at this energy. Rest, or do one follow-up.");
  } else if (mode === "today") {
    const max = Number(o.max ?? 3);
    const r = P.today(E, budget, max);
    result = { deadline: r.lane.map(ref), plan: r.picks.map(ref), minutes: r.used };
    out.push(`Today (energy ${E}, ${budget} min budget, ${r.used} planned)`);
    for (const t of r.lane) out.push(`  DEADLINE  ${T(t)}  [${t.project}, ${t.effort}] due ${P.effDue(t)}  (${ref(t)})`);
    if (r.more.length) out.push(`  also due soon: ${r.more.length} more than fit in ${budget} min`);
    r.picks.forEach((t, i) => { out.push(`  ${i + 1}. ${T(t)}  [${t.project}, ${t.effort}, ${t.energy}]  (${ref(t)})`); out.push(`       why: ${P.score(t, E).why.join("; ") || "steady progress"}`); });
    for (const t of P.followUps) out.push(`  Follow up: ask ${clean(t.waiting)} about "${T(t)}" (check ${t.check})  (${ref(t)})`);
    const first = r.lane[0] ?? r.picks[0];
    out.push(first ? `Next: ${T(first)}` : "Next: nothing ready. Rest, or do one follow-up.");
    if (o.commit) { const n = planCommit(ctx, [...r.lane, ...r.picks]); out.push(`(${plural(n, "task")} added to today.md)`); }
  } else if (mode === "all") {
    const a = P.all();
    const openN = P.open.length;
    out.push(`Portfolio (${openN} open tasks, ${a.projects.length} projects)`);
    for (const p of a.projects) {
      out.push(`${p.project}: ${p.readyCount} ready, ${p.blocked.length} blocked`);
      p.ready.forEach((t) => out.push(`  ready   ${T(t)} (${ref(t)})`));
      p.blocked.slice(0, 5).forEach((b) => out.push(`  blocked ${T(b.t)} (${clean(b.by)})`));
    }
    if (a.risk.length) { out.push("At risk (back-scheduled date already passed):"); a.risk.slice(0, 5).forEach((t) => out.push(`  ${T(t)} should have started by ${P.effDue(t)}`)); }
    if (a.blockers.length) { out.push("External blockers (biggest unlock first):"); a.blockers.slice(0, 5).forEach((t) => out.push(`  ${T(t)}: waiting on ${clean(t.waiting)}${t.check ? `, check ${t.check}` : ""}, blocks ${P.downstream(t.key)}`)); }
    result = { projects: a.projects.length, open: openN };
  } else throw new Error("plan needs next, today or all");
  if (P.slipped.length) out.push(`slipped (${P.slipped.length}): oldest "${T(P.slipped[0])}". See /backlog.`);
  if (P.needsFixing.length) {
    out.push(`needs fixing (${P.needsFixing.length}): they block what depends on them`);
    P.needsFixing.slice(0, 3).forEach((t) => out.push(`  ${t.file}:${t.line} ${cleanTitle(t.title, 50)}: ${clean(t.reasons.join("; "))}`));
  }
  out.push(coverageLine(all.cov));
  return { text: out.join("\n"), result, ok: coverageOk(all.cov), P, all };
}

// ---------- routines ----------
const routineFiles = (ctx) => {
  const d = path.join(ctx.root, "routines");
  return fs.existsSync(d) ? fs.readdirSync(d).filter((n) => n.endsWith(".md")).sort().map((n) => `routines/${n}`) : [];
};
export function readRoutine(ctx, rel) {
  const doc = safeRead(path.join(ctx.root, rel));
  if (!doc) return { rel, error: "unreadable" };
  const { fm } = parseFrontmatter(doc.text);
  const slug = (fm.slug || path.basename(rel, ".md")).toLowerCase();
  const sch = parseSchedule(fm.schedule);
  return { rel, slug, fm, sch, text: doc.text, error: sch ? null : `schedule "${fm.schedule ?? ""}" is invalid (daily, weekdays, weekly:mon[,fri], monthly:N[,M] with N 1-28, monthly:last)` };
}
export function spawnRoutines(ctx) {
  const spawned = [], problems = [];
  withLock(ctx.root, () => {
    ensureToday(ctx);
    for (const rel of routineFiles(ctx)) {
      const r = readRoutine(ctx, rel);
      if (r.error) { problems.push(`${rel}: ${r.error}`); continue; }
      const last = lastOccurrence(r.sch, ctx.day);
      if (!last) continue;
      if (r.fm.last_spawned && isDate(r.fm.last_spawned) && r.fm.last_spawned >= last) continue;
      const missed = last < ctx.day;
      const items = [];
      r.text.split("\n").forEach((l, i) => {
        const m = /^\s*- \[ \]\s+(.*)$/.exec(l);
        if (!m) return;
        let line = l.replace(/\[due::\s*\+(\d{1,3})d\s*\]/, (_, n) => `[due:: ${addDays(last, +n)}]`).replace(/^\s*- \[ \]/, "- [ ]");
        const idm = /\^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*$/.exec(line);
        line = idm ? line.replace(/\s*\^[A-Za-z0-9][A-Za-z0-9_.-]*\s*$/, "") : line;
        const id = `${r.slug}-${idm ? idm[1] : items.length + 1}`;
        items.push(`${line.replace(/\s+$/, "")} [routine:: yes] ^${id}`);
      });
      const block = [`### ${r.slug}`, `> ${r.fm.schedule}${missed ? `; collapsed from ${DOW[dow(last)]} ${last}` : ""}`, ...items];
      tx(ctx.root, "routines spawn", (t) => {
        t.edit("today.md", (text) => (text.includes(`\n### ${r.slug}\n`) ? text : addToSection(text, "Routines", block)));
        t.edit(rel, (text) => (r.fm.last_spawned !== undefined && /^last_spawned:.*$/m.test(text) ? text.replace(/^last_spawned:.*$/m, `last_spawned: ${last}`) : text.replace(/^---\n/, `---\nlast_spawned: ${last}\n`)));
      });
      spawned.push(`${r.slug} (${plural(items.length, "task")}${missed ? `, collapsed from ${last}` : ""})`);
    }
  });
  return { spawned, problems };
}
export function routinesList(ctx) {
  return routineFiles(ctx).map((rel) => {
    const r = readRoutine(ctx, rel);
    return r.error ? `${rel}: ERROR ${r.error}` : `${r.slug}  ${r.fm.schedule}  last ${r.fm.last_spawned ?? "never"}`;
  });
}
export function routinesAdd(ctx, slug, schedule) {
  const sch = parseSchedule(schedule);
  if (!sch) throw new Error(`schedule "${schedule}" is invalid (daily, weekdays, weekly:mon[,fri], monthly:N[,M] with N 1-28, monthly:last)`);
  const rel = `routines/${slug}.md`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("routine slug must be lowercase letters, digits and -");
  tx(ctx.root, "routines add", (t) => t.create(rel, `---\ntype: routine\nslug: ${slug}\nschedule: ${schedule}\n---\n`));
  return rel;
}
export function routinesItem(ctx, slug, text, f = {}) {
  const rel = `routines/${slug}.md`;
  if (!fs.existsSync(path.join(ctx.root, rel))) throw new Error(`no routine ${slug}`);
  const bits = [`- [ ] ${cleanTitle(text, 120)}`];
  for (const k of ["energy", "effort", "value", "due"]) if (f[k]) bits.push(`[${k}:: ${f[k]}]`);
  const probe = bits.join(" ").replace(/\+(\d+)d/, "2026-01-01");
  const pt = parseTaskLine(probe, "routine", 1);
  if (pt.bad) throw new Error(`not added: ${pt.reasons.join("; ")}`);
  const existing = readDoc(path.join(ctx.root, rel)).text.split("\n").filter((l) => /^- \[ \]/.test(l)).length;
  bits.push(`^i${existing + 1}`);
  tx(ctx.root, "routines item", (t) => t.edit(rel, (cur) => cur + (cur.endsWith("\n") ? "" : "\n") + bits.join(" ") + "\n"));
  return rel;
}

// ---------- morning ----------
export function morning(ctx, o = {}) {
  const out = [];
  let rolled = { rolled: false, slipped: 0 };
  let sp, fl;
  withLock(ctx.root, () => {
    rolled = ensureToday(ctx); // first, so the rollover result is not lost inside flush
    fl = flush(ctx);
    sp = spawnRoutines(ctx);
  });
  out.push(`Morning ${ctx.day} (${DOW[dow(ctx.day)]})`);
  if (rolled.rolled && rolled.slipped) out.push(`Rolled over: ${plural(rolled.slipped, "planned task")} went back to the pool.`);
  if (fl.done.length) out.push(`Wins carried over from last session: ${fl.done.length}.`);
  out.push(sp.spawned.length ? `Routines added to today: ${sp.spawned.join("; ")}` : "Routines: nothing new today.");
  for (const p of sp.problems) out.push(`  routine error: ${clean(p)}`);
  const d = dueReminders(ctx);
  if (d.due.length) {
    out.push(`Reminders due (${d.due.length}), open until you mark them done or snooze them:`);
    d.due.slice(0, 3).forEach((r) => out.push(`  - ${r.title}  (set for ${r.at.replace(/ 00:00$/, "")}) ${r.hard ? "[hard] " : ""}(${r.t.project}/${r.t.id ?? "?"}#${r.t.hash})`));
    if (d.due.length > 3) out.push(`  and ${d.due.length - 3} more`);
  } else out.push("Reminders: none due.");
  if (d.later.length) out.push("Later today: " + d.later.map((r) => `${r.title} at ${r.when.time ?? "00:00"}`).join("; "));
  for (const e of d.errors.slice(0, 3)) out.push(`  reminder error: cannot read date "${clean(e.raw)}" at ${e.rel}:${e.line}`);
  const fl2 = fleetingNotes(ctx);
  const dueN = fl2.filter((n) => !n.fm.review || n.fm.review <= ctx.day).length;
  out.push(`Inbox: ${fl2.length} fleeting, ${dueN} due for review${dueN > 12 ? " (big: do a batch of 10, or skip to the plan)" : ""}.`);
  const todayDoc = readDoc(path.join(ctx.root, "today.md")).text;
  const routineOpen = todayDoc.split("\n").filter((l) => /^- \[ \]/.test(l) && l.includes("[routine:: yes]")).map((l) => cleanTitle(l.replace(/^- \[ \]/, "").replace(/\[\w+::[^\]]*\]/g, "").replace(/\^[\w.-]+\s*$/, ""), 60));
  if (routineOpen.length) out.push(`Routine checklist (${routineOpen.length}, not part of your top 3): ${routineOpen.join("; ")}`);
  const p = runPlan(ctx, "today", { energy: o.energy, minutes: o.minutes, commit: o.commit });
  out.push("", p.text);
  return out.join("\n");
}

// ---------- wrap ----------
export { flush };

// ---------- restart ----------
export function restart(ctx) {
  const out = [];
  const j = readJournal(ctx.root);
  const last = j.length ? j[j.length - 1].ts.slice(0, 10) : ctx.day;
  const away = Math.max(0, diffDays(ctx.day, last));
  withLock(ctx.root, () => { ensureToday(ctx); spawnRoutines(ctx); });
  const sp = spreadInbox(ctx, 5);
  const d = dueReminders(ctx);
  const old = d.due.filter((r) => diffDays(ctx.day, r.when.date) > 7 && !r.hard);
  const fresh = d.due.filter((r) => !old.includes(r));
  const all = ctx.load();
  const P = makePlanner(all, ctx.day);
  out.push(`Welcome back${away >= 3 ? ` (${away} days)` : ""}. Nothing is lost.`);
  out.push(`Inbox: ${sp.total} notes, 5 a day from now${sp.moved ? ` (${sp.moved} pushed to later days)` : ""}.`);
  const hard = fresh.filter((r) => r.hard);
  out.push(`Reminders: ${fresh.length} recent${hard.length ? ` (${hard.map((r) => r.title).join(", ")} stay until done)` : ""}; ${old.length} older, hidden.`);
  const todayDoc = readDoc(path.join(ctx.root, "today.md")).text;
  const collapsed = (todayDoc.match(/collapsed from/g) ?? []).length;
  out.push(`Routines: ${collapsed} collapsed into today, none piled up.`);
  const slipped = P.open.filter((t) => t.slips > 0).length;
  out.push(`Slipped tasks: ${slipped}. They wait in the pool, no action needed.`);
  const r = P.next(ctx.cfg.energy ?? "med", Number(ctx.cfg.minutes ?? 180));
  out.push(r.pick ? `**Next:** ${T(r.pick)}` : "**Next:** pick one small thing, or rest.");
  return out.slice(0, 8).join("\n");
}

// ---------- backlog ----------
export function backlog(ctx) {
  const all = ctx.load();
  const P = makePlanner(all, ctx.day);
  const todayDoc = safeRead(path.join(ctx.root, "today.md"))?.text ?? "";
  const planned = new Set([...todayDoc.matchAll(/\[task::\s*([^\]#\s]+)/g)].map((m) => m[1]));
  const items = P.open.filter((t) => P.plannable(t) && !t.routine && !planned.has(t.key));
  const by = new Map();
  for (const t of items) by.set(t.project, (by.get(t.project) ?? 0) + 1);
  const out = [`Backlog: ${items.length} open ${items.length === 1 ? "task" : "tasks"}${by.size ? " (" + [...by].map(([p, n]) => `${p} ${n}`).slice(0, 4).join(", ") + (by.size > 4 ? ", ..." : "") + ")" : ""}`];
  const oldest = [...items].sort((a, b) => (a.fields.added ?? "9999").localeCompare(b.fields.added ?? "9999") || b.slips - a.slips).slice(0, 3);
  for (const t of oldest) out.push(`  oldest: ${cleanTitle(t.title, 60)}${t.fields.added ? ` (since ${t.fields.added})` : ""}${t.slips ? `, slipped ${t.slips}x` : ""}`);
  const dist = [0, 1, 2, 3].map((n) => items.filter((t) => (n === 3 ? t.slips >= 3 : t.slips === n)).length);
  out.push(`  slips: 0x ${dist[0]}, 1x ${dist[1]}, 2x ${dist[2]}, 3+ ${dist[3]}`);
  const ask = items.filter((t) => t.slips >= 3 && (+(t.fields.asked ?? 0) || 0) < Math.floor(t.slips / 3) * 3 && !(t.due && diffDays(t.due, ctx.day) <= 2));
  if (ask.length) out.push(`  decide (once each): ${ask.slice(0, 2).map((t) => `${cleanTitle(t.title, 40)} (${ref(t)})`).join("; ")}`);
  const dl = items.filter((t) => t.slips >= 3 && t.due && diffDays(t.due, ctx.day) <= 2).length;
  if (dl) out.push(`  ${dl} slipped with a deadline in 2 days: kept in the deadline lane`);
  out.push(coverageLine(all.cov));
  return out.slice(0, 8).join("\n");
}

// ---------- weekly ----------
export function weekly(ctx) {
  const all = ctx.load();
  const P = makePlanner(all, ctx.day);
  const out = [`Weekly review ${ctx.day}`];
  const wk = addDays(ctx.day, -7);
  const wins = all.tasks.filter((t) => t.status === "done" && t.fields.done && t.fields.done >= wk);
  out.push(`Wins this week: ${wins.length}${wins.length ? " (" + wins.slice(0, 3).map((t) => cleanTitle(t.title, 30)).join(", ") + ")" : ""}`);
  const b = backlog(ctx).split("\n");
  out.push(...b.slice(0, 4));
  const stale = [];
  for (const p of all.projects) {
    if (p.error || p.hidden) continue;
    let newest = 0;
    for (const f of ["tasks.md", "status.md", "handoff.md", "decisions.md", "objectives.md"]) { try { newest = Math.max(newest, fs.statSync(path.join(p.dir, f)).mtimeMs); } catch {} }
    const days = Math.floor((Date.now() - newest) / 864e5);
    if (newest && days >= 14) stale.push(`${p.slug} (${days}d)`);
  }
  out.push(stale.length ? `Untouched 14+ days: ${stale.join(", ")}. For each: continue, pause or done?` : "No project untouched for 14 days.");
  let drafts = 0;
  walkMd(ctx.root, ["notes", "kb"], (f) => { const d = safeRead(f); if (d && /^status:\s*draft\s*$/m.test(d.text)) drafts++; });
  out.push(`Drafts waiting for confirmation: ${drafts}`);
  out.push(`Inbox: ${fleetingNotes(ctx).length} fleeting`);
  return out.slice(0, 15).join("\n");
}

// ---------- lint ----------
export function lint(ctx) {
  const all = ctx.load();
  const errors = [], warnings = [];
  for (const i of all.cov.issues) errors.push(i);
  for (const t of all.tasks) if (!t.closed && t.bad) errors.push(`${t.file}:${t.line} ${cleanTitle(t.title, 50)}: ${t.reasons.join("; ")}`);
  for (const t of all.tasks) if (!t.id && !t.closed && t.project !== "daily") warnings.push(`${t.file}:${t.line} has no ^id (run: brain reindex)`);
  for (const l of all.cov.lookalikes) errors.push(`${l.file}:${l.line} looks like a task but cannot be read: ${l.text}`);
  for (const u of all.cov.unreadable) errors.push(`unreadable: ${u}`);
  const per = new Map();
  for (const t of all.tasks) if (!t.closed && t.project !== "today" && t.project !== "daily" && t.project !== "reminders") per.set(t.project, (per.get(t.project) ?? 0) + 1);
  for (const [p, n] of per) if (n > 12) warnings.push(`${p}: ${n} open tasks, over the 12-task budget. Split the project.`);
  for (const rel of routineFiles(ctx)) { const r = readRoutine(ctx, rel); if (r.error) errors.push(`${rel}: ${r.error}`); }
  const dr = dueReminders(ctx);
  for (const e of dr.errors) errors.push(`${e.rel}:${e.line} reminder date "${e.raw}" is not YYYY-MM-DD[ HH:MM]`);
  walkMd(ctx.root, KNOWLEDGE_DIRS, (f) => {
    const d = safeRead(f);
    if (!d) return;
    const rel = path.relative(ctx.root, f);
    if (/\/tasks(\.now)?\.md$/.test(rel) || /^projects\/[^/]+\/(status|handoff|decisions)\.md$/.test(rel) && false) return;
    const lines = d.text.split("\n");
    if (lines[0] === "---" && lines.indexOf("---", 1) < 0) errors.push(`${rel}: frontmatter is not closed`);
    const { fm } = parseFrontmatter(d.text);
    if ((rel.startsWith("notes/") || rel.startsWith("kb/")) && (fm.status === "draft" || fm.status === "confirmed") && !fm.source) errors.push(`${rel}: a derived note needs a source`);
    for (const it of itemsOf(lines)) {
      if (it.top) continue;
      if (!it.desc) errors.push(`${rel} > ${it.slug}: item needs a "> " description line`);
      if (it.tokens > 400) warnings.push(`${rel} > ${it.slug}: ~${it.tokens} tokens, split it`);
    }
  });
  return { errors, warnings, cov: all.cov };
}

export function projectsList(ctx) {
  const all = ctx.load();
  const P = makePlanner(all, ctx.day);
  const out = ["slug  state  due  open  next"];
  for (const p of all.projects) {
    if (p.error) { out.push(`${p.slug}  UNREADABLE (${p.error})`); continue; }
    const open = P.open.filter((t) => t.project === p.slug).length;
    const nxt = P.open.find((t) => t.project === p.slug && P.plannable(t) && !t.waiting && P.depsDone(t, new Set()));
    out.push(`${p.slug}  ${p.state}${p.hidden && p.state === "active" ? " (starts " + p.start + ")" : ""}  ${p.due ?? "-"}  ${open}  ${nxt ? cleanTitle(nxt.title, 50) : "-"}`);
  }
  out.push(coverageLine(all.cov));
  return out.join("\n");
}

// ---------- hooks (fail open) ----------
const ascii = (s, n) => cleanTitle(s, n).replace(/[^\x20-\x7e]/g, "");
export function hookStart(ctx) {
  flush(ctx);
  const d = dueReminders(ctx);
  const fl = fleetingNotes(ctx);
  const all = ctx.load();
  const P = makePlanner(all, ctx.day);
  const first = d.due[0]?.title ?? "";
  let line = `[brain] ${d.due.length} reminders due, inbox ${fl.length}, slipped ${P.slipped.length}, needs fixing ${P.needsFixing.length}`;
  if (first) line += `; first reminder: ${ascii(first, 80)}`;
  return line.slice(0, 600);
}
export function hookPrompt(ctx, payload) {
  let text = "";
  try { text = String(JSON.parse(payload).prompt ?? ""); } catch { text = String(payload ?? ""); }
  if (!text.trim()) return;
  const f = path.join(ctx.root, ".brain", "prompts", `${ctx.now.date}.log`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify({ ts: new Date().toISOString(), text: text.slice(0, 4000) }) + "\n");
}

export function backup(ctx, { push } = {}) {
  const g = (...a) => spawnSync("git", a, { cwd: ctx.root, encoding: "utf8", timeout: 30000 });
  if (!fs.existsSync(path.join(ctx.root, ".git"))) throw new Error("the brain is not a git repo (run git init)");
  g("add", "-A");
  const st = g("status", "--porcelain");
  let msg = "nothing to back up";
  if (st.stdout.trim()) { const c = g("commit", "-q", "-m", `brain backup ${ctx.now.stamp}`); if (c.status !== 0) throw new Error(c.stderr.trim() || "commit failed"); msg = "committed"; }
  if (push) {
    const url = g("remote", "get-url", "origin").stdout.trim();
    if (!url) throw new Error("no origin remote");
    if (!(ctx.cfg.allowed_remotes ?? []).includes(url)) throw new Error(`remote ${url} is not in allowed_remotes in .brain/config.json`);
    const p = g("push", "-q", "origin", "HEAD");
    if (p.status !== 0) throw new Error(p.stderr.trim() || "push failed");
    msg += ", pushed";
  }
  return msg;
}

// Find open tasks by words in the title. Returns lines with the key#hash needed by done/snooze.
export function taskFind(ctx, words, limit = 8) {
  const all = ctx.load();
  const norm = (w) => w.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]+/g, "").replace(/[^\p{L}\p{N}\p{M}]/gu, "").replace(/s$/, "");
  const terms = [...new Set(words.join(" ").split(/\s+/).map(norm).filter((w) => [...w].length > 1))];
  if (!terms.length) throw new Error("usage: brain task find <words>");
  const rows = all.tasks.filter((t) => !t.closed).map((t) => {
    const hay = norm(t.title) + " " + t.title.toLowerCase();
    const n = terms.filter((w) => hay.includes(w)).length;
    return { t, n };
  }).filter((r) => r.n > 0).sort((a, b) => b.n - a.n || a.t.key.localeCompare(b.t.key));
  const out = rows.slice(0, limit).map((r) => `${T(r.t)}  [${r.t.project}${r.t.waiting ? ", waiting" : ""}${r.t.bad ? ", needs fixing" : ""}]  (${ref(r.t)})`);
  if (rows.length > limit) out.push(`... ${rows.length - limit} more; use more words`);
  out.push(rows.length ? `${rows.filter((r) => r.n === rows[0].n).length} best match${rows.filter((r) => r.n === rows[0].n).length === 1 ? "" : "es"}` : "no open task matches");
  out.push(coverageLine(all.cov));
  return out.join("\n");
}
