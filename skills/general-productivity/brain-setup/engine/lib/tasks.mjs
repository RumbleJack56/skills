// Task line parser. Fails closed: a line that looks like a task but cannot be understood becomes
// status "bad" with reasons. It is never dropped and never treated as done.
import { isDate, parseWhen } from "./dates.mjs";
import { sha } from "./store.mjs";

export const EFFORT_MIN = { xs: 10, s: 45, m: 180, l: 480 };
export const ENERGY = { low: 0, med: 1, high: 2 };
const ENERGY_ALIAS = { medium: "med", mid: "med", normal: "med" };
const KNOWN = new Set(["after", "energy", "effort", "due", "value", "waiting", "check", "remind", "start", "slips", "routine", "touched", "hard", "from", "task", "status"]);
const TASK_RE = /^([ \t]*)- \[(.)\][ \t]+(.*)$/;
const LOOKALIKE_RE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]*\[[^\]]{0,2}\]/;
const ID_RE = /(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9_.-]*)[ \t]*$/;
const FIELD_RE = /\[([A-Za-z][A-Za-z0-9_-]*)::[ \t]*([^\]]*)\]/g;
const IDREF_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?$/;

export function parseTaskLine(line, project, lineNo) {
  const m = TASK_RE.exec(line);
  if (!m) return null;
  const reasons = [];
  let body = m[3];
  let id = null;
  const im = ID_RE.exec(body);
  if (im) { id = im[1]; body = body.slice(0, im.index); }
  const fields = {};
  const dupes = new Set();
  body = body.replace(FIELD_RE, (_, k, v) => {
    k = k.toLowerCase();
    if (k in fields) dupes.add(k);
    fields[k] = v.trim();
    return " ";
  });
  for (const k of dupes) reasons.push(`field "${k}" is given twice`);
  const title = body.replace(/\s+/g, " ").trim();
  if (!title) reasons.push("no title");

  const status = { " ": "open", x: "done", X: "done", "-": "dropped" }[m[2]];
  if (!status) reasons.push(`unknown checkbox "${m[2]}"`);

  const t = {
    project, line: lineNo, raw: line.replace(/\s+$/, ""), hash: sha(line.replace(/\s+$/, "")),
    id, title, status: status ?? "bad", reasons,
    after: [], energy: "med", effort: "s", value: 1, due: null, waiting: null, check: null,
    remind: null, start: null, slips: 0, routine: false, touched: null, hard: false, from: null, fields,
  };
  const date = (k) => {
    if (fields[k] === undefined) return null;
    if (!isDate(fields[k])) { reasons.push(`${k}:: "${fields[k]}" is not a date (use YYYY-MM-DD)`); return null; }
    return fields[k];
  };
  if (fields.energy !== undefined) {
    const e = ENERGY_ALIAS[fields.energy.toLowerCase()] ?? fields.energy.toLowerCase();
    if (e in ENERGY) t.energy = e; else reasons.push(`energy:: "${fields.energy}" must be low, med or high`);
  }
  if (fields.effort !== undefined) {
    const e = fields.effort.toLowerCase();
    if (e in EFFORT_MIN) t.effort = e;
    else reasons.push(e === "xl" ? "effort:: xl is too big, split the task" : `effort:: "${fields.effort}" must be xs, s, m or l`);
  }
  if (fields.value !== undefined) {
    if (/^[0-3]$/.test(fields.value)) t.value = +fields.value; else reasons.push(`value:: "${fields.value}" must be 0 to 3`);
  }
  t.due = date("due"); t.check = date("check"); t.start = date("start"); t.touched = date("touched");
  if (fields.remind !== undefined) {
    const w = parseWhen(fields.remind);
    if (w) t.remind = w; else reasons.push(`remind:: "${fields.remind}" must be YYYY-MM-DD or YYYY-MM-DD HH:MM`);
  }
  if (fields.slips !== undefined) {
    if (/^\d{1,3}$/.test(fields.slips)) t.slips = +fields.slips; else reasons.push(`slips:: "${fields.slips}" must be a number`);
  }
  if (fields.waiting !== undefined) {
    t.waiting = fields.waiting || null;
    if (!t.waiting) reasons.push("waiting:: needs a name");
    if (fields.check === undefined) reasons.push("waiting:: needs check:: (a follow-up date)");
  }
  if (fields.after !== undefined) {
    for (const a of fields.after.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (IDREF_RE.test(a)) t.after.push(a.includes("/") ? a : `${project}/${a}`);
      else reasons.push(`after:: "${a}" is not a task id`);
    }
  }
  t.routine = /^(yes|true)$/i.test(fields.routine ?? "");
  t.hard = /^(yes|true)$/i.test(fields.hard ?? "");
  t.from = fields.from ?? null;
  t.bad = reasons.length > 0;
  t.closed = status === "done" || status === "dropped";
  return t;
}

// Parse a whole file's text. Returns { tasks, lookalikes }.
export function parseTasks(text, project, file, { fenced = true } = {}) {
  const tasks = [], lookalikes = [];
  let fence = false;
  text.split("\n").forEach((line, i) => {
    if (fenced && /^\s*(```|~~~)/.test(line)) { fence = !fence; return; }
    if (fence) return;
    const t = parseTaskLine(line, project, i + 1);
    if (t) { t.file = file; tasks.push(t); }
    else if (LOOKALIKE_RE.test(line)) lookalikes.push({ file, line: i + 1, text: line.trim().slice(0, 80) });
  });
  return { tasks, lookalikes };
}

// Give every task a unique key, flag duplicate ids, unknown dependencies and cycles. Mutates tasks.
export function link(tasks) {
  const byKey = new Map();
  const dup = new Set();
  for (const t of tasks) {
    t.key = `${t.project}/${t.id ?? "@" + t.file + ":" + t.line}`;
    if (t.id) {
      if (byKey.has(t.key)) { dup.add(t.key); }
      else byKey.set(t.key, t);
    }
  }
  for (const t of tasks) {
    if (t.id && dup.has(t.key)) bad(t, `duplicate id ^${t.id}`);
  }
  for (const t of tasks) {
    for (const a of t.after) {
      const d = byKey.get(a);
      if (!d) bad(t, `after:: ${a} is not a known task`);
      else if (dup.has(a)) bad(t, `after:: ${a} is a duplicate id`);
    }
  }
  // cycles: Kahn's algorithm over edges dep -> task, iterative
  const nodes = tasks.filter((t) => t.id && !dup.has(t.key));
  const indeg = new Map(nodes.map((t) => [t.key, 0]));
  const out = new Map(nodes.map((t) => [t.key, []]));
  for (const t of nodes) for (const a of t.after) if (indeg.has(a)) { indeg.set(t.key, indeg.get(t.key) + 1); out.get(a).push(t.key); }
  const queue = [...indeg].filter(([, n]) => n === 0).map(([k]) => k);
  const seen = new Set();
  while (queue.length) {
    const k = queue.pop(); seen.add(k);
    for (const s of out.get(k)) { indeg.set(s, indeg.get(s) - 1); if (indeg.get(s) === 0) queue.push(s); }
  }
  for (const t of nodes) if (!seen.has(t.key)) bad(t, "part of a dependency cycle");
  return byKey;
}
function bad(t, reason) { if (!t.reasons.includes(reason)) t.reasons.push(reason); t.bad = true; }
// A task the user ticked is finished even if one of its fields is malformed.
export const isFinished = (t) => t.closed === true;
