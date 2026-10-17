// Inbox: dump, remind, due, route, snooze-note, recover.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tx, readDoc, safeRead, sha, readJournal } from "./store.mjs";
import { slugify, cleanTitle, clean } from "./util.mjs";
import { parseFrontmatter, hasTag } from "./brain.mjs";
import { addDays, parseWhen, diffDays } from "./dates.mjs";
import { parseTaskLine, parseTasks } from "./tasks.mjs";
import { buildTaskLine, setField } from "./taskedit.mjs";
import { walkMd } from "./notes.mjs";
import { taskAdd } from "./cmd-core.mjs";

const LADDER = [1, 3, 7, 14, 30, 60];

// ---- splitting a dump into items ----
export function splitItems(text, kind) {
  text = text.replace(/\r\n/g, "\n").replace(/\s+$/, "").replace(/^\s*\n/, "");
  if (!text.trim()) return [];
  if (kind === "note") return [text];
  const lines = text.split("\n");
  const marker = /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+(.*)$/;
  if (lines.filter((l) => marker.test(l)).length >= 2) {
    const items = [];
    for (const l of lines) {
      const m = marker.exec(l);
      if (m) items.push(m[1]);
      else if (items.length && l.trim()) items[items.length - 1] += "\n" + l.trim();
      else if (l.trim()) items.push(l.trim());
    }
    return items;
  }
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length > 1) return paras;
  return lines.map((l) => l.trim()).filter(Boolean);
}

const callout = (text) => ["> [!quote] Original Capture", ...text.split("\n").map((l) => `> ${l}`)].join("\n");
function noteName(ctx, text, existing) {
  const stamp = ctx.now.stamp.replace(" ", "-").replace(":", "");
  let base = `${stamp}-${slugify(text.split("\n")[0], 40) || "note"}`;
  let name = base, n = 2;
  while (existing.has(name.toLowerCase())) name = `${base}-${n++}`;
  existing.add(name.toLowerCase());
  return name;
}
export function inboxFiles(ctx) {
  const out = [];
  walkMd(ctx.root, ["inbox", "notes", "kb", "daily"], (f) => out.push(f));
  return out;
}
// Fleeting notes anywhere in the brain, found by tag, not by folder.
export function fleetingNotes(ctx) {
  const out = [];
  walkMd(ctx.root, ["inbox", "notes", "kb"], (f) => {
    const d = safeRead(f);
    if (!d) return;
    const { fm } = parseFrontmatter(d.text);
    if (hasTag(fm, "fleeting")) out.push({ file: f, rel: path.relative(ctx.root, f), fm, text: d.text });
  });
  // a note at the brain root with the tag
  for (const n of fs.readdirSync(ctx.root)) {
    if (!n.endsWith(".md") || ["CLAUDE.md", "AGENTS.md", "index.md", "log.md", "reminders.md", "today.md"].includes(n)) continue;
    const d = safeRead(path.join(ctx.root, n));
    if (!d) continue;
    const { fm } = parseFrontmatter(d.text);
    if (hasTag(fm, "fleeting")) out.push({ file: path.join(ctx.root, n), rel: n, fm, text: d.text });
  }
  return out;
}
const bodyOf = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^> \[!quote\][^\n]*\n/, "").split("\n").map((l) => l.replace(/^> ?/, "")).join("\n").trim();

export function dump(ctx, text, { kind = "dump", source } = {}) {
  const items = splitItems(text, kind);
  if (!items.length) throw new Error("nothing to capture (empty text)");
  const existing = new Set(fs.existsSync(path.join(ctx.root, "inbox")) ? fs.readdirSync(path.join(ctx.root, "inbox")).map((n) => n.replace(/\.md$/, "").toLowerCase()) : []);
  const files = [];
  tx(ctx.root, "dump", (t) => {
    for (const it of items) {
      const name = noteName(ctx, it, existing);
      const body = `---\ntags: [fleeting]\ncreated: ${ctx.now.stamp}\nreview: ${ctx.day}\nstep: 0\n---\n${callout(it)}\n`;
      t.create(`inbox/${name}.md`, body);
      files.push(`inbox/${name}.md`);
    }
  }, () => ({ src: sha(text, 12), count: items.length }));
  const inbox = fleetingNotes(ctx).length;
  return { files, inbox };
}

// ---- reminders ----
export function remindAdd(ctx, when, text, { hard } = {}) {
  const w = parseWhen(when);
  if (!w) throw new Error(`when "${when}" must be YYYY-MM-DD or YYYY-MM-DD HH:MM`);
  const title = cleanTitle(text, 200);
  if (!title) throw new Error("reminder needs text");
  const f = path.join(ctx.root, "reminders.md");
  const cur = fs.existsSync(f) ? readDoc(f).text : "";
  const ids = parseTasks(cur, "reminders", "reminders.md").tasks;
  let n = 0; for (const t of ids) { const m = /^r(\d+)$/.exec(t.id ?? ""); if (m) n = Math.max(n, +m[1]); }
  const line = buildTaskLine(title, { remind: w.time ? `${w.date} ${w.time}` : w.date, hard }, `r${n + 1}`);
  tx(ctx.root, "remind add", (t) => t.edit("reminders.md", (text) => (text || "# Reminders\n\n") + (text && !text.endsWith("\n") ? "\n" : "") + line + "\n"), { src: sha(`${when}${text}`, 12) });
  return { key: `reminders/r${n + 1}`, when: w.time ? `${w.date} ${w.time}` : w.date };
}

// Every checkbox line anywhere in the brain that has a remind:: field (valid or not).
export function scanReminders(ctx) {
  const out = [];
  const files = [];
  walkMd(ctx.root, ["projects", "inbox", "notes", "kb", "routines"], (f) => files.push(f));
  files.push(path.join(ctx.root, "reminders.md"), path.join(ctx.root, "today.md"));
  for (const f of files) {
    const rel = path.relative(ctx.root, f);
    if (rel.endsWith("tasks.now.md") || rel.startsWith("templates")) continue;
    const d = safeRead(f);
    if (!d || !d.text.includes("remind::")) continue;
    d.text.split("\n").forEach((l, i) => {
      if (!l.includes("[remind::")) return;
      const t = parseTaskLine(l, rel.split("/")[0] === "projects" ? rel.split("/")[1] : path.basename(rel, ".md"), i + 1);
      if (!t || t.closed) return;
      out.push({ t, rel, line: i + 1 });
    });
  }
  return out;
}
export function dueReminders(ctx) {
  const nowDt = ctx.now.stamp;
  const due = [], later = [], errors = [];
  for (const r of scanReminders(ctx)) {
    const raw = r.t.fields.remind ?? "";
    const w = parseWhen(raw);
    if (!w) { errors.push({ ...r, raw }); continue; }
    const at = `${w.date} ${w.time ?? "00:00"}`;
    const row = { ...r, when: w, at, title: cleanTitle(r.t.title, 80), hard: r.t.hard };
    if (at <= nowDt) due.push(row);
    else if (w.date === ctx.day || w.date === ctx.now.date) later.push(row);
  }
  due.sort((a, b) => a.at.localeCompare(b.at));
  return { due, later, errors };
}
export function notifyDue(ctx) {
  const { due } = dueReminders(ctx);
  if (!due.length) return "nothing due";
  const f = path.join(ctx.root, ".brain", `notify-${ctx.now.date}.count`);
  let n = 0; try { n = +fs.readFileSync(f, "utf8") || 0; } catch {}
  if (n >= (ctx.cfg.notify_max_per_day ?? 3)) return "notify limit reached for today";
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, String(n + 1));
  const msg = `Brain: ${due.length} reminder${due.length === 1 ? "" : "s"} due`;
  spawnSync("notify-send", ["Brain", msg], { stdio: "ignore", timeout: 3000 });
  return msg;
}

// ---- route ----
const STOP = new Set("the a an and or to of in on for with at by from is are was be this that it my i we you need want have do get make buy call email about".split(" "));
const words = (s) => (s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]+/g, "").match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP.has(w));
export function routeList(ctx, max = 10) {
  const notes = fleetingNotes(ctx).map((n) => ({ ...n, review: n.fm.review ?? "", body: bodyOf(n.text) }))
    .filter((n) => !n.review || n.review <= ctx.day)
    .sort((a, b) => String(a.fm.created ?? "").localeCompare(String(b.fm.created ?? "")) || a.rel.localeCompare(b.rel));
  const all = ctx.load();
  const projects = all.projects.filter((p) => !p.error && !p.hidden).map((p) => {
    const ws = new Set(words(p.slug.replace(/-/g, " ")));
    for (const t of all.tasks.filter((t) => t.project === p.slug && !t.closed)) words(t.title).forEach((w) => ws.add(w));
    return { slug: p.slug, ws };
  });
  const rows = notes.slice(0, max).map((n) => {
    const nw = new Set(words(n.body));
    const cands = projects.map((p) => ({ p: p.slug, n: [...nw].filter((w) => p.ws.has(w)).length })).filter((c) => c.n).sort((a, b) => b.n - a.n).slice(0, 3);
    return { rel: n.rel, id: n.rel.replace(/\.md$/, ""), text: cleanTitle(n.body.split("\n")[0], 100), cands: cands.map((c) => c.p) };
  });
  // clusters: 5 or more due notes sharing a word that no project uses
  const declined = new Set(readJournal(ctx.root).filter((e) => e.cmd === "route-decline").flatMap((e) => e.words ?? [e.cluster]));
  const members = new Map();
  notes.forEach((n, i) => { for (const w of new Set(words(n.body))) (members.get(w) ?? members.set(w, []).get(w)).push(i); });
  // words that appear in exactly the same notes are one cluster
  const groups = new Map();
  for (const [w, idx] of members) {
    if (idx.length < 5 || projects.some((p) => p.ws.has(w))) continue;
    const key = idx.join(",");
    (groups.get(key) ?? groups.set(key, { n: idx.length, words: [] }).get(key)).words.push(w);
  }
  const clusters = [...groups.values()].filter((g) => !g.words.some((w) => declined.has(w))).sort((a, b) => b.n - a.n).slice(0, 2).map((g) => [g.words.slice(0, 3).join(" "), g.n]);
  return { rows, total: notes.length, clusters };
}
export function routeMove(ctx, noteId, project, { title, flags = {}, keep } = {}) {
  const rel = noteId.endsWith(".md") ? noteId : `${noteId}.md`;
  if (path.isAbsolute(rel) || rel.split("/").includes("..")) throw new Error("bad note path");
  const f = path.join(ctx.root, rel);
  const d = fs.existsSync(f) ? readDoc(f) : null;
  if (!d) throw new Error(`no note ${rel}`);
  const { fm } = parseFrontmatter(d.text);
  if (!hasTag(fm, "fleeting")) throw new Error(`${rel} is not a fleeting note`);
  const body = bodyOf(d.text);
  const taskTitle = title ?? cleanTitle(body.split("\n")[0], 100);
  const tf = `projects/${project}/tasks.md`;
  const orig = body.split("\n").map((l) => `  > ${clean(l)}`).join("\n");
  let r;
  tx(ctx.root, "route move", (t) => {
    r = taskAdd(ctx, project, taskTitle, flags);
    t.edit(tf, (text) => {
      const ls = text.split("\n");
      const i = ls.findIndex((l) => l.includes(`^${r.key.split("/")[1]}`) && /^\s*- \[ \]/.test(l));
      if (i >= 0) ls.splice(i + 1, 0, `  > from inbox ${ctx.day}:`, orig);
      return ls.join("\n");
    });
    if (!keep) t.remove(rel);
  });
  return r;
}
export function snoozeNote(ctx, noteId) {
  const rel = noteId.endsWith(".md") ? noteId : `${noteId}.md`;
  const f = path.join(ctx.root, rel);
  if (!fs.existsSync(f)) throw new Error(`no note ${rel}`);
  let when = "";
  tx(ctx.root, "snooze note", (t) => t.edit(rel, (text) => {
    const { fm } = parseFrontmatter(text);
    const step = Math.min(+(fm.step ?? 0) || 0, LADDER.length - 1);
    when = addDays(ctx.day, LADDER[step]);
    const sub = (k, v) => (new RegExp(`^${k}:.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}:.*$`, "m"), `${k}: ${v}`) : text.replace(/^---\n/, `---\n${k}: ${v}\n`));
    let n = sub("review", when);
    n = n.replace(/^step:.*$/m, `step: ${Math.min(step + 1, LADDER.length - 1)}`);
    return n;
  }));
  return when;
}
export function routeDecline(ctx, cluster) {
  const ws = words(String(cluster));
  tx(ctx.root, "route-decline", () => {}, { note: true, cluster: String(cluster).toLowerCase(), words: ws });
}

// Spread overdue reviews over days, at most `perDay` a day (used by restart).
export function spreadInbox(ctx, perDay = 5) {
  const notes = fleetingNotes(ctx).filter((n) => !n.fm.review || n.fm.review <= ctx.day).sort((a, b) => String(a.fm.created ?? "").localeCompare(String(b.fm.created ?? "")));
  let moved = 0;
  notes.forEach((n, i) => {
    const day = Math.floor(i / perDay);
    if (!day) return;
    const when = addDays(ctx.day, day);
    tx(ctx.root, "restart spread", (t) => t.edit(n.rel, (text) => (/^review:.*$/m.test(text) ? text.replace(/^review:.*$/m, `review: ${when}`) : text.replace(/^---\n/, `---\nreview: ${when}\n`))));
    moved++;
  });
  return { total: notes.length, moved };
}

// ---- recover: logged prompts that were never captured ----
export function recover(ctx, sinceHours = 24) {
  const dir = path.join(ctx.root, ".brain", "prompts");
  if (!fs.existsSync(dir)) return [];
  const since = Date.now() - sinceHours * 3600e3;
  const captured = new Set(readJournal(ctx.root).filter((e) => e.src).map((e) => e.src));
  const out = [];
  for (const n of fs.readdirSync(dir).sort()) {
    for (const l of fs.readFileSync(path.join(dir, n), "utf8").split("\n").filter(Boolean)) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      if (!e.text || Date.parse(e.ts) < since || e.text.startsWith("/")) continue;
      if (captured.has(sha(e.text, 12))) continue;
      out.push({ ts: e.ts, text: cleanTitle(e.text, 120), raw: e.text });
    }
  }
  return out;
}
