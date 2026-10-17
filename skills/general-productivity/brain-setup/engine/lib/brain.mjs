// Finding the brain, reading its config, loading projects and tasks with coverage.
import fs from "node:fs";
import path from "node:path";
import { readDoc, safeRead } from "./store.mjs";
import { parseTasks, link } from "./tasks.mjs";
import { addDays, isDate } from "./dates.mjs";

export const DEFAULT_CONFIG = {
  format: 1, timezone: null, day_starts_at: "04:00", energy: "med", minutes: 180,
  allowed_remotes: [], autonomy: {}, notify_max_per_day: 3,
};

export function readConfig(root) {
  const f = path.join(root, ".brain", "config.json");
  let c = {};
  try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { throw new Error(`cannot read ${f}: ${e.message}`); }
  return { ...DEFAULT_CONFIG, ...c };
}
export const autonomy = (cfg, skill) => (cfg.autonomy?.[skill] === "ask" ? "ask" : "report");

const hasConfig = (d) => { try { return fs.statSync(path.join(d, ".brain", "config.json")).isFile(); } catch { return false; } };

// -> { root, project|null }. Throws a clear message when nothing is found.
export function findBrain(cwd, explicit) {
  const want = explicit || process.env.BRAIN_DIR;
  if (want) {
    const root = fs.realpathSync(path.resolve(want));
    if (!hasConfig(root)) throw new Error(`${root} is not a brain (no .brain/config.json). Run /setup.`);
    return { root, project: null };
  }
  let d = path.resolve(cwd);
  for (;;) {
    const b = path.join(d, ".brain");
    let lst = null;
    try { lst = fs.lstatSync(b); } catch {}
    if (lst?.isSymbolicLink()) {
      let real;
      try { real = fs.realpathSync(b); } catch { throw new Error(`.brain in ${d} points to a missing folder (is the brain mounted?). Nothing was written.`); }
      const root = path.dirname(path.dirname(real));
      if (path.basename(path.dirname(real)) === "projects" && hasConfig(root)) return { root, project: path.basename(real) };
      throw new Error(`.brain in ${d} does not point into a brain's projects/ folder`);
    }
    if (lst?.isDirectory() && hasConfig(d)) return { root: fs.realpathSync(d), project: null };
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error("no brain found here (no .brain/config.json). Run /setup, or pass --brain DIR.");
}

// ---- frontmatter (YAML subset: key: value, key: [a, b], quoted strings) ----
export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { fm: {}, end: 0 };
  const lines = text.split("\n");
  let close = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i] === "---") { close = i; break; }
  if (close < 0) return { fm: {}, end: 0, broken: true };
  const fm = {};
  for (const l of lines.slice(1, close)) {
    const m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(l);
    if (!m) continue;
    let v = m[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    else v = v.replace(/^["']|["']$/g, "");
    fm[m[1]] = v;
  }
  return { fm, end: close + 1 };
}
export const hasTag = (fm, tag) => {
  const t = fm.tags ?? fm.tag ?? [];
  return (Array.isArray(t) ? t : String(t).split(/[,\s]+/)).some((x) => x.replace(/^#/, "") === tag || x.replace(/^#/, "").startsWith(tag + "/"));
};

// ---- projects ----
export function listProjectDirs(root) {
  const base = path.join(root, "projects");
  let names = [];
  try { names = fs.readdirSync(base); } catch { return []; }
  return names.filter((n) => !n.startsWith(".") && !n.startsWith("_")).sort().map((slug) => {
    const dir = path.join(base, slug);
    try {
      if (!fs.statSync(dir).isDirectory()) return null;
      fs.readdirSync(dir);
    } catch (e) { return { slug, dir, error: e.code === "ENOENT" ? "missing (unmounted link?)" : e.code ?? "unreadable" }; }
    return { slug, dir };
  }).filter(Boolean);
}

export function loadProject(p, today) {
  if (p.error) return { ...p, state: "unreadable", hidden: false, issues: [`project ${p.slug}: ${p.error}`] };
  const issues = [];
  const doc = safeRead(path.join(p.dir, "objectives.md"));
  const { fm } = doc ? parseFrontmatter(doc.text) : { fm: {} };
  let state = fm.state ?? "active";
  if (!["active", "paused", "done"].includes(state)) { issues.push(`project ${p.slug}: state "${state}" must be active, paused or done (treated as active)`); state = "active"; }
  let start = null;
  if (fm.start !== undefined) { if (isDate(fm.start)) start = fm.start; else issues.push(`project ${p.slug}: start "${fm.start}" is not a date`); }
  let due = null;
  if (fm.due !== undefined) { if (isDate(fm.due)) due = fm.due; else issues.push(`project ${p.slug}: due "${fm.due}" is not a date`); }
  if (state === "paused" && !start) issues.push(`project ${p.slug}: paused needs a start date`);
  if (!doc) issues.push(`project ${p.slug}: no objectives.md`);
  const hidden = state === "done" || state === "paused" || (start && start > today);
  return { ...p, state, start, due, hidden: !!hidden, issues, objectivesFm: fm };
}

// Load every task. Returns { tasks, byKey, projects, cov }.
export function loadAll(root, ctx) {
  const today = ctx.day;
  const cov = { files: 0, tasks: 0, bad: 0, lookalikes: [], unreadable: [], issues: [] };
  const projects = listProjectDirs(root).map((p) => loadProject(p, today));
  const tasks = [];
  const take = (file, project, rel, opts) => {
    const doc = safeRead(file);
    if (!doc) { cov.unreadable.push(rel); return; }
    cov.files++;
    const r = parseTasks(doc.text, project, rel, opts);
    cov.lookalikes.push(...r.lookalikes);
    tasks.push(...r.tasks);
  };
  for (const p of projects) {
    cov.issues.push(...p.issues);
    if (p.error) { cov.unreadable.push(`projects/${p.slug}`); continue; }
    const tf = path.join(p.dir, "tasks.md");
    if (fs.existsSync(tf)) take(tf, p.slug, `projects/${p.slug}/tasks.md`);
  }
  const todayFile = path.join(root, "today.md");
  if (fs.existsSync(todayFile)) take(todayFile, "today", "today.md");
  const remFile = path.join(root, "reminders.md");
  if (fs.existsSync(remFile)) take(remFile, "reminders", "reminders.md");
  const dd = path.join(root, "daily");
  if (fs.existsSync(dd)) {
    const oldest = addDays(today, -14);
    for (const n of fs.readdirSync(dd).sort()) {
      const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(n);
      if (m && m[1] >= oldest && m[1] < today) take(path.join(dd, n), "daily", `daily/${n}`);
    }
  }
  // plan references (task::) are not tasks; routine leftovers from old daily notes are not carried
  const kept = tasks.filter((t) => !("task" in t.fields) && !(t.project === "daily" && t.routine));
  const byKey = link(kept);
  for (const p of projects) for (const t of kept) if (t.project === p.slug) t.projectState = p;
  cov.tasks = kept.length;
  cov.bad = kept.filter((t) => t.bad && !t.closed).length;
  return { tasks: kept, byKey, projects, cov };
}

export function coverageLine(cov) {
  const parts = [`${cov.files} files`, `${cov.tasks} tasks`];
  if (cov.bad) parts.push(`${cov.bad} need fixing`);
  if (cov.lookalikes.length) parts.push(`${cov.lookalikes.length} task-looking lines not parsed`);
  if (cov.unreadable.length) parts.push(`${cov.unreadable.length} unreadable (${cov.unreadable.slice(0, 3).join(", ")})`);
  return `coverage: ${parts.join(", ")}`;
}
export const coverageOk = (cov) => !cov.bad && !cov.lookalikes.length && !cov.unreadable.length;
