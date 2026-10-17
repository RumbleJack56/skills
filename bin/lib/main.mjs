// brain: the deterministic engine behind the second-brain skills. Zero dependencies, offline.
import fs from "node:fs";
import path from "node:path";
import { makeCtx } from "./ctx.mjs";
import { parseArgs, flag, readStdin, plural, clean, fence } from "./util.mjs";
import { undo as undoJournal } from "./store.mjs";
import * as core from "./cmd-core.mjs";
import * as notes from "./cmd-notes.mjs";
import * as day from "./cmd-day.mjs";
import * as nt from "./notes.mjs";
import * as know from "./cmd-know.mjs";

const HELP = `brain <command>
  Read:    projects | brief <p> | find <words> | get <project/file> <slug> | grep [flags] <regex> | plan next|today|all | due | lint
  Collect: dump [--kind note|dump] <text|-> | remind add <when> <text> [--hard] | remind list
  Route:   route list | route move <note> <project> | route decline <word> | snooze-note <note>
  Tasks:   task find <words> | task drop <key#hash> | task add <p> <title> [--after --energy --effort --due --value --waiting --check --start] | task set <key#hash> k=v ...
           done <key#hash> | snooze <key#hash> --until DATE | undo [n] | now add <key#hash> | now add-step <text> | now show
  Day:     morning | wrap | flush | restart | weekly | backlog | today win <text> | routines list|add|item|spawn
  Know:    note new --kind .. --title .. --source .. (stdin) | draft list|confirm|reject | consume <note> | project state|archive
  Setup:   init <path> | setup-claude (commands, hooks, permissions) | project new <slug> | link <project> <repo> | reindex | hook start|prompt | recover | backup`;

const out = (s) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");

export async function main(argv) {
  const brainOpt = []; // global --brain DIR
  const rest = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === "--brain") brainOpt.push(argv[++i]); else rest.push(argv[i]); }
  const [cmd, ...args] = rest;
  if (!cmd || cmd === "help" || cmd === "--help") return out(HELP);
  if (cmd === "init") {
    const a = parseArgs(args, ["timezone"], ["no-git"]);
    if (!a._[0]) throw new Error("usage: brain init <path>");
    const r = core.init(a._[0], { timezone: flag(a, "timezone"), git: !a.flags["no-git"] });
    const cc = core.setupClaude(r.root);
    r.made.push(...cc.made); r.skipped.push(...cc.kept);
    out(`brain at ${r.root}: ${r.made.length} created, ${r.skipped.length} kept (existing files are never overwritten)`);
    if (r.skipped.length) out("kept: " + r.skipped.join(", "));
    return;
  }
  if (cmd === "setup-claude") { const r = core.setupClaude(makeCtx({ brain: brainOpt[0] }).root); return out(`updated: ${r.made.join(", ")}${r.kept.length ? `; kept: ${r.kept.length} existing command files` : ""}\nengine: ${r.engine}`); }
  // hooks must never block or fail loudly
  if (cmd === "hook") {
    try {
      const ctx = makeCtx({ brain: brainOpt[0] });
      if (args[0] === "prompt") { day.hookPrompt(ctx, await readStdin()); return; }
      if (args[0] === "start") { out(day.hookStart(ctx)); return; }
      if (args[0] === "end") { core.flush(ctx); return; }
    } catch { /* fail open */ }
    return;
  }
  const ctx = makeCtx({ brain: brainOpt[0] });
  const A = (vals = [], bools = []) => parseArgs(args, vals, bools);

  switch (cmd) {
    case "projects": return out(day.projectsList(ctx));
    case "brief": {
      const a = A();
      const p = a._[0] ?? ctx.project;
      if (!p) throw new Error("usage: brain brief <project>");
      const parts = [nt.briefOf(ctx.root, `projects/${p}/objectives`).text];
      for (const f of ["status", "handoff"]) { try { parts.push(nt.briefOf(ctx.root, `projects/${p}/${f}`).text); } catch {} }
      parts.push("live tasks:\n" + core.nowShow(ctx, p));
      return out(fence(parts.join("\n\n")));
    }
    case "find": { const a = A(["limit"]); return out(nt.findItems(ctx.root, a._, Number(flag(a, "limit", 8)))); }
    case "get": { const a = A(); if (a._.length !== 2) throw new Error("usage: brain get <project/file> <slug>"); return out(nt.getItem(ctx.root, a._[0], a._[1])); }
    case "grep": return out(nt.grep(ctx.root, args));
    case "reindex": { const a = A(); const r = nt.reindexAll(ctx.root, a._[0]); const ids = ensureIds(ctx); return out([...r, ...ids].join("\n") || "reindex: nothing to do"); }
    case "lint": {
      const r = day.lint(ctx);
      const lines = [...r.errors.map((e) => `error: ${clean(e)}`), ...r.warnings.map((w) => `warn: ${clean(w)}`)];
      lines.push(`lint: ${r.errors.length} errors, ${r.warnings.length} warnings`);
      out(lines.join("\n"));
      if (r.errors.length) process.exitCode = 1;
      return;
    }
    case "plan": {
      const a = A(["energy", "minutes", "max"], ["json", "commit"]);
      const mode = a._[0];
      const r = day.runPlan(ctx, mode, { energy: flag(a, "energy"), minutes: flag(a, "minutes"), max: flag(a, "max"), commit: a.flags.commit });
      return out(a.flags.json ? JSON.stringify(r.result, null, 2) : r.text);
    }
    case "task": {
      const sub = args[0];
      if (sub === "add") {
        const a = parseArgs(args.slice(1), ["after", "energy", "effort", "due", "value", "waiting", "check", "start", "remind"], ["hard"]);
        if (a._.length < 2) throw new Error("usage: brain task add <project> <title> [flags]");
        const f = {}; for (const k of Object.keys(a.flags)) f[k] = a.flags[k] === true ? true : flag(a, k);
        const r = core.taskAdd(ctx, a._[0], a._.slice(1).join(" "), f);
        return out(`added ${r.key}${r.over ? ` (warning: ${r.open} open tasks, over the 12-task budget; propose a split)` : ""}`);
      }
      if (sub === "drop") { const r = core.taskDrop(ctx, args[1]); return out(r.already ? `already closed: ${clean(r.t.title)}` : `dropped: ${clean(r.t.title)} (undo: /undo)`); }
      if (sub === "find") return out(fence(day.taskFind(ctx, args.slice(1))));
      if (sub === "set") {
        const a = parseArgs(args.slice(1), ["hash"]);
        const sets = {}; for (const kv of a._.slice(1)) { const m = /^([a-z]+)=(.*)$/.exec(kv); if (!m) throw new Error(`bad assignment "${kv}" (use key=value)`); sets[m[1]] = m[2]; }
        if (a.flags.hash) sets.hash = flag(a, "hash");
        const t = core.taskSet(ctx, a._[0], sets);
        return out(`updated ${t.key} (undo: brain undo)`);
      }
      throw new Error("usage: brain task add|set");
    }
    case "done": {
      const a = A(["hash"]);
      if (a._.length !== 1) throw new Error("usage: brain done <key#hash> (one task at a time)");
      const r = core.markDone(ctx, a._[0], flag(a, "hash"));
      return out(r.already ? `already done: ${clean(r.t.title)}` : `done: ${clean(r.t.title)} (undo: /undo)`);
    }
    case "snooze": {
      const a = A(["hash", "until"]);
      const t = core.snooze(ctx, a._[0], flag(a, "until"), flag(a, "hash"));
      return out(`snoozed: ${clean(t.title)} until ${flag(a, "until")} (undo: /undo)`);
    }
    case "undo": { const a = A(); return out(undoJournal(ctx.root, Number(a._[0] ?? 1)).join("\n")); }
    case "dump": {
      const a = A(["kind"]);
      let text = a._.join(" ");
      if (text === "-" || (!text && !process.stdin.isTTY)) text = await readStdin();
      const r = notes.dump(ctx, text, { kind: flag(a, "kind", "dump") });
      return out(`captured ${r.files.length} (${r.inbox} in inbox): ${r.files.join(", ")}`);
    }
    case "remind": {
      if (args[0] === "add") {
        const a = parseArgs(args.slice(1), [], ["hard"]);
        if (a._.length < 2) throw new Error('usage: brain remind add "<YYYY-MM-DD HH:MM>" <text>');
        const r = notes.remindAdd(ctx, a._[0], a._.slice(1).join(" "), { hard: a.flags.hard });
        return out(`reminder set: ${r.when} (${r.key})`);
      }
      if (args[0] === "list") { const d = notes.dueReminders(ctx); return out([...d.due, ...d.later].map((r) => `${r.at}  ${r.title}`).join("\n") || "no reminders due"); }
      throw new Error("usage: brain remind add|list");
    }
    case "due": {
      const a = A([], ["notify"]);
      if (a.flags.notify) return out(notes.notifyDue(ctx));
      const d = notes.dueReminders(ctx);
      const lines = d.due.map((r) => `due: ${r.title}  (${r.at}) ${r.hard ? "[hard] " : ""}(${r.t.project}/${r.t.id ?? "?"}#${r.t.hash})`);
      lines.push(...d.errors.map((e) => `error: cannot read reminder date "${clean(e.raw)}" at ${e.rel}:${e.line}`));
      return out(lines.join("\n") || "nothing due");
    }
    case "route": {
      const sub = args[0];
      if (sub === "list") {
        const a = parseArgs(args.slice(1), ["max"]);
        const r = notes.routeList(ctx, Number(flag(a, "max", 10)));
        const lines = [`inbox: ${r.total} due for review`, ...r.rows.map((x) => `  ${x.id}  "${clean(x.text)}"  -> ${x.cands.join(", ") || "no project matches"}`)];
        for (const [w, c] of r.clusters) lines.push(`cluster: "${w}" appears in ${c} notes and no project. Propose a new project (ask once; if declined: brain route decline ${w}).`);
        return out(fence(lines.join("\n")));
      }
      if (sub === "move") {
        const a = parseArgs(args.slice(1), ["task", "after", "energy", "effort", "due", "value"], ["keep"]);
        const f = {}; for (const k of ["after", "energy", "effort", "due", "value"]) if (flag(a, k)) f[k] = flag(a, k);
        const r = notes.routeMove(ctx, a._[0], a._[1], { title: flag(a, "task"), flags: f, keep: a.flags.keep });
        return out(`routed to ${r.key} (undo: /undo)`);
      }
      if (sub === "decline") { notes.routeDecline(ctx, args.slice(1).join(" ")); return out("noted: will not propose that project again"); }
      throw new Error("usage: brain route list|move|decline");
    }
    case "note": {
      if (args[0] !== "new") throw new Error("usage: brain note new --kind literature|atomic|kb --title T --source \"[[note]]\" [--kb people|things|systems|playbooks] [--ptype playbook|method|guide] (body on stdin)");
      const a = parseArgs(args.slice(1), ["kind", "title", "source", "kb", "ptype"]);
      const body = await readStdin();
      return out(`draft written: ${know.noteNew(ctx, { kind: flag(a, "kind"), title: flag(a, "title"), source: flag(a, "source"), kbDir: flag(a, "kb"), ptype: flag(a, "ptype"), body })} (status: draft)`);
    }
    case "draft": {
      const sub = args[0];
      if (sub === "list") { const l = know.draftList(ctx); return out(fence(l.map((d) => `${d.rel}  ${d.title}  source: ${clean(d.source)}`).join("\n") || "no drafts")); }
      if (sub === "confirm") return out(`confirmed ${know.draftConfirm(ctx, args[1])} (undo: /undo)`);
      if (sub === "reject") { know.draftReject(ctx, args[1]); return out("draft removed (undo: /undo)"); }
      throw new Error("usage: brain draft list|confirm|reject");
    }
    case "consume": { know.consume(ctx, args[0]); return out("fleeting note removed after processing (undo: /undo)"); }
    case "snooze-note": { const w = notes.snoozeNote(ctx, args[0]); return out(`review again on ${w}`); }
    case "project": {
      if (args[0] === "state") { const a = parseArgs(args.slice(1), ["start"]); know.projectState(ctx, a._[0], a._[1], flag(a, "start")); return out(`project ${a._[0]} is ${a._[1]}`); }
      if (args[0] === "archive") { return out(`archived to ${know.projectArchive(ctx, args[1])}`); }
      if (args[0] !== "new") throw new Error("usage: brain project new|state|archive ...");
      const a = parseArgs(args.slice(1), ["outcome", "due"]);
      const r = core.projectNew(ctx, a._[0], { outcome: flag(a, "outcome"), due: flag(a, "due") });
      return out(r.created ? `project ${r.slug} created` : `project ${r.slug} already exists`);
    }
    case "link": {
      const a = A();
      if (a._.length !== 2) throw new Error("usage: brain link <project> <repo-path>");
      const r = core.linkProject(ctx, a._[0], a._[1]);
      return out(`linked ${r.link} -> ${r.target} (git-excluded)`);
    }
    case "now": {
      const sub = args[0];
      if (sub === "add") { const r = core.nowAdd(ctx, args[1]); return out(r.added ? `added to ${r.file}` : "already live"); }
      if (sub === "add-step") { const a = parseArgs(args.slice(1), ["project"]); return out(`step added to ${core.nowAddStep(ctx, flag(a, "project"), a._.join(" "))}`); }
      if (sub === "show") return out(fence(core.nowShow(ctx, args[1])));
      throw new Error("usage: brain now add|add-step|show");
    }
    case "flush": { const r = core.flush(ctx); return out(`flushed: ${plural(r.done.length, "task")} done, ${r.kept} kept${r.skipped.length ? `, ${r.skipped.length} skipped: ${r.skipped.map(clean).join("; ")}` : ""}`); }
    case "wrap": {
      const r = core.flush(ctx);
      const slipped = core.wrapSettle(ctx);
      const lines = [r.done.length ? `Wins: ${r.done.length}` : "Nothing marked done today. That is fine.", `${plural(slipped, "planned task")} back in the pool.`];
      lines.push(day.backlog(ctx).split("\n").filter((l) => l.startsWith("  decide")).join("\n"));
      return out(lines.filter(Boolean).join("\n"));
    }
    case "today": {
      if (args[0] === "win") { core.todayWin(ctx, args.slice(1).join(" ")); return out("win saved"); }
      throw new Error("usage: brain today win <text>");
    }
    case "morning": { const a = A(["energy", "minutes"], ["commit"]); return out(day.morning(ctx, { energy: flag(a, "energy"), minutes: flag(a, "minutes"), commit: a.flags.commit })); }
    case "restart": return out(day.restart(ctx));
    case "weekly": return out(day.weekly(ctx));
    case "backlog": return out(day.backlog(ctx));
    case "routines": {
      const sub = args[0];
      if (sub === "list") return out(day.routinesList(ctx).join("\n") || "no routines");
      if (sub === "spawn") { const r = day.spawnRoutines(ctx); return out([...r.spawned, ...r.problems].join("\n") || "nothing new"); }
      if (sub === "add") { const a = parseArgs(args.slice(1), ["schedule"]); return out(`created ${day.routinesAdd(ctx, a._[0], flag(a, "schedule"))}`); }
      if (sub === "item") {
        const a = parseArgs(args.slice(1), ["energy", "effort", "value", "due"]);
        const f = {}; for (const k of ["energy", "effort", "value", "due"]) if (flag(a, k)) f[k] = flag(a, k);
        return out(`added to ${day.routinesItem(ctx, a._[0], a._.slice(1).join(" "), f)}`);
      }
      throw new Error("usage: brain routines list|add|item|spawn");
    }
    case "recover": {
      const a = A(["since"]);
      const since = flag(a, "since", "24h");
      const h = /^(\d+)h$/.exec(since) ? +/^(\d+)h$/.exec(since)[1] : /^(\d+)d$/.exec(since) ? +/^(\d+)d$/.exec(since)[1] * 24 : 24;
      const r = notes.recover(ctx, h);
      return out(fence(r.map((x) => `${x.ts.slice(0, 16)}  ${x.text}`).join("\n") || "nothing missed"));
    }
    case "backup": { const a = A([], ["push"]); return out(day.backup(ctx, { push: a.flags.push })); }
    default: throw new Error(`unknown command "${cmd}". Run: brain help`);
  }
}

// Give id-less open tasks a stable ^id (reindex does this so done/snooze can address them).
function ensureIds(ctx) {
  const all = ctx.load();
  const files = new Map();
  for (const t of all.tasks) if (!t.id && !t.closed && !["daily", "today"].includes(t.project)) (files.get(t.file) ?? files.set(t.file, []).get(t.file)).push(t);
  const msgs = [];
  for (const [file, ts] of files) {
    if (file === "today.md") continue;
    const prefix = file === "reminders.md" ? "r" : "t";
    core.assignIds(ctx, file, ts, prefix);
    msgs.push(`ids added in ${file}: ${ts.length}`);
  }
  return msgs;
}
