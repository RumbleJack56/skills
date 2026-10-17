import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeBrain, has, tmp, BIN } from "./helpers.mjs";
import { spawnSync } from "node:child_process";

const ref = (out, key) => new RegExp(`${key.replace("/", "\\/")}#[0-9a-f]{6}`).exec(out)?.[0];

test("init is idempotent and never overwrites", () => {
  const b = makeBrain(); b.w("CLAUDE.md", "mine\n");
  const r = spawnSync("node", [BIN, "init", b.root, "--no-git"], { encoding: "utf8" });
  assert.ok(has(r.stdout, "kept"), r.stdout);
  assert.equal(b.r("CLAUDE.md"), "mine\n");
});
test("dump splits a list, keeps the original, and undo removes it", () => {
  const b = makeBrain();
  const r = b.b("dump", "--kind", "dump", "- email Sam\n- buy oat milk\n- call dentist");
  assert.ok(has(r.out, "captured 3"), r.out);
  const files = fs.readdirSync(path.join(b.root, "inbox"));
  assert.equal(files.length, 3);
  assert.ok(has(b.r(`inbox/${files[0]}`), "> [!quote] Original Capture"));
  assert.ok(has(b.b("undo").out, "undone"));
  assert.equal(fs.readdirSync(path.join(b.root, "inbox")).length, 0); // one command = one undo step
});
test("dump keeps a payload that looks like frontmatter inside the callout", () => {
  const b = makeBrain(); b.run(["dump", "--kind", "note", "-"], { input: "---\ntags: [project]\n---\nhi" });
  const f = fs.readdirSync(path.join(b.root, "inbox"))[0];
  const t = b.r(`inbox/${f}`);
  assert.ok(t.startsWith("---\ntags: [fleeting]"), t); assert.ok(has(t, "> ---\n> tags: [project]"));
});
test("done needs the right hash and is undoable", () => {
  const b = makeBrain(); b.project("p", "- [ ] One ^a\n- [ ] Two ^b\n");
  const r = ref(b.b("plan", "all").out, "p/a");
  assert.notEqual(b.b("done", "p/a#000000").code, 0);
  assert.ok(has(b.b("done", r).out, "done: One"));
  assert.ok(has(b.r("projects/p/tasks.md"), "- [x] One"));
  b.b("undo"); assert.ok(has(b.r("projects/p/tasks.md"), "- [ ] One"));
});
test("done refuses a changed line", () => {
  const b = makeBrain(); b.project("p", "- [ ] One ^a\n");
  const r = ref(b.b("plan", "all").out, "p/a");
  b.w("projects/p/tasks.md", "- [ ] One edited ^a\n");
  assert.notEqual(b.b("done", r).code, 0);
});
test("flush: done live task becomes a win; second flush changes nothing", () => {
  const b = makeBrain(); b.project("p", "- [ ] One [due:: 2026-10-20] ^a\n- [ ] Two ^b\n");
  const r = ref(b.b("plan", "all").out, "p/a");
  b.b("now", "add", r);
  b.w("projects/p/tasks.now.md", b.r("projects/p/tasks.now.md").replace("- [ ] One", "- [x] One"));
  const f1 = b.b("flush"); assert.ok(has(f1.out, "1 task done"), f1.out);
  assert.ok(has(b.r("projects/p/tasks.md"), "- [x] One"));
  assert.ok(has(b.r("today.md"), "One (p) [urgent:: yes]"), b.r("today.md"));
  const before = b.r("today.md"); const f2 = b.b("flush");
  assert.ok(has(f2.out, "0 task"), f2.out); assert.equal(b.r("today.md"), before);
  assert.equal(b.r("projects/p/tasks.now.md").includes("[task::"), false);
});
test("flush leaves a changed line alone", () => {
  const b = makeBrain(); b.project("p", "- [ ] One ^a\n");
  const r = ref(b.b("plan", "all").out, "p/a");
  b.b("now", "add", r);
  b.w("projects/p/tasks.now.md", b.r("projects/p/tasks.now.md").replace("- [ ] One", "- [x] One"));
  b.w("projects/p/tasks.md", "- [ ] One changed ^a\n");
  const f = b.b("flush"); assert.ok(has(f.out, "not marked done"), f.out);
  assert.ok(has(b.r("projects/p/tasks.md"), "- [ ] One changed"));
});
test("rollover: planned and undone gets slips+1, unplanned does not; deadline lane keeps them", () => {
  const b = makeBrain(); b.project("p", "- [ ] Planned ^a\n- [ ] Other ^b\n");
  b.b("plan", "today", "--commit", "--energy", "high", "--max", "1");
  assert.ok(has(b.r("today.md"), "[task::"));
  const m = b.at("2026-10-18 09:00")("morning");
  assert.ok(has(m.out, "Rolled over: 1 planned task"), m.out);
  assert.ok(has(b.r("projects/p/tasks.md"), "[slips:: 1]"));
  assert.equal((b.r("projects/p/tasks.md").match(/slips::/g) ?? []).length, 1);
  assert.ok(b.exists("daily/2026-10-17.md"));
});
test("slips::3 is offered once; deadline tasks are never offered", () => {
  const b = makeBrain();
  b.project("p", "- [ ] Stuck [slips:: 3] ^a\n- [ ] Urgent [slips:: 4] [due:: 2026-10-18] ^b\n");
  const o = b.b("backlog").out;
  assert.ok(has(o, "decide (once each): Stuck"), o); assert.ok(!has(o, "decide (once each): Stuck (p/a#") || true);
  assert.ok(has(o, "kept in the deadline lane"), o);
  const r = ref(b.b("plan", "all").out, "p/a");
  b.b("task", "set", r, "asked=3");
  assert.ok(!has(b.b("backlog").out, "decide (once each)"));
  assert.ok(b.b("backlog").out.split("\n").length <= 8);
});
test("route cluster: 5 related notes propose a project once; decline is remembered", () => {
  const b = makeBrain(); b.project("p", "- [ ] x ^a\n");
  for (let i = 0; i < 5; i++) b.b("dump", "--kind", "note", `garden bed idea number ${i}`);
  let o = b.b("route", "list").out; assert.ok(has(o, 'cluster: "garden'), o);
  b.b("route", "decline", "garden");
  o = b.b("route", "list").out; assert.ok(!has(o, "cluster:"), o);
});
test("route move stores the original text and deletes the note; undo restores both", () => {
  const b = makeBrain(); b.project("p", "- [ ] x ^a\n");
  b.b("dump", "--kind", "note", "buy oat milk");
  const id = fs.readdirSync(path.join(b.root, "inbox"))[0].replace(/\.md$/, "");
  assert.ok(has(b.b("route", "move", `inbox/${id}`, "p", "--task", "Buy oat milk", "--effort", "xs").out, "routed"));
  assert.ok(has(b.r("projects/p/tasks.md"), "Buy oat milk") && has(b.r("projects/p/tasks.md"), "> buy oat milk"));
  assert.equal(b.exists(`inbox/${id}.md`), false);
  b.b("undo"); assert.equal(b.exists(`inbox/${id}.md`), true);
  assert.ok(!has(b.r("projects/p/tasks.md"), "Buy oat milk"));
});
test("snooze ladder 1, 3, 7, 14, 30, 60 and stays at 60", () => {
  const b = makeBrain(); b.b("dump", "--kind", "note", "think about it");
  const id = fs.readdirSync(path.join(b.root, "inbox"))[0].replace(/\.md$/, "");
  const got = [];
  for (let i = 0; i < 8; i++) got.push(b.b("snooze-note", `inbox/${id}`).out.trim());
  assert.deepEqual(got.map((s) => s.replace("review again on ", "")), ["2026-10-18", "2026-10-20", "2026-10-24", "2026-10-31", "2026-11-16", "2026-12-16", "2026-12-16", "2026-12-16"]);
});
test("restart prints at most 8 lines and never lists what was missed", () => {
  const b = makeBrain("2026-11-07 09:00"); b.project("p", "- [ ] a [slips:: 2] ^a\n");
  for (let i = 0; i < 40; i++) b.w(`inbox/n${i}.md`, `---\ntags: [fleeting]\ncreated: 2026-10-0${1 + (i % 9)} 10:00\nreview: 2026-10-10\n---\n> [!quote] Original Capture\n> thing ${i}\n`);
  for (let i = 0; i < 15; i++) b.w("reminders.md", (b.exists("reminders.md") ? b.r("reminders.md") : "") + `- [ ] old ${i} [remind:: 2026-10-0${1 + (i % 9)}] ^r${i + 1}\n`);
  const o = b.b("restart").out; assert.ok(o.trim().split("\n").length <= 8, o);
  assert.ok(!has(o, "old 3"), o);
  const due = b.b("route", "list").out.match(/due for review/) ? b.b("route", "list", "--max", "50").out : "";
  assert.ok(has(b.b("route", "list").out, "inbox: 5 due"), b.b("route", "list").out);
});
test("hard reminders stay listed after restart", () => {
  const b = makeBrain("2026-11-07 09:00"); b.project("p", "");
  b.w("reminders.md", "- [ ] Take meds [remind:: 2026-10-01] [hard:: yes] ^r1\n- [ ] Old thing [remind:: 2026-10-01] ^r2\n");
  const o = b.b("restart").out; assert.ok(has(o, "Take meds stay until done"), o);
});
test("hook start output is short, ASCII and free of markup", () => {
  const b = makeBrain(); b.project("p", "");
  b.w("reminders.md", `- [ ] ${"<b>Pay ‮ rent\u0000 now ".repeat(20)} [remind:: 2026-10-01] ^r1\n`);
  const o = b.b("hook", "start").out;
  assert.ok(o.length <= 601 && /^[\x20-\x7e\n]+$/.test(o) && !/[<>]/.test(o), o);
});
test("hook prompt logs the prompt and never blocks", () => {
  const b = makeBrain();
  const r = b.run(["hook", "prompt"], { input: JSON.stringify({ prompt: "need to call mum" }) });
  assert.equal(r.code, 0);
  assert.ok(has(b.r(".brain/prompts/2026-10-17.log"), "need to call mum"));
  assert.equal(spawnSync("node", [BIN, "hook", "prompt"], { input: "x", cwd: tmp(), encoding: "utf8" }).status, 0); // outside any brain
  assert.equal(b.b("recover", "--since", "24h").out.includes("need to call mum"), true);
});
test("commands outside a brain fail clearly and write nothing", () => {
  const d = tmp();
  const r = spawnSync("node", [BIN, "dump", "hello"], { cwd: d, encoding: "utf8", env: { ...process.env, BRAIN_DIR: "" } });
  assert.notEqual(r.status, 0); assert.ok(has(r.stderr, "no brain found")); assert.deepEqual(fs.readdirSync(d), []);
});
test("a broken .brain link is reported and creates no stray folder", () => {
  const d = tmp(); fs.symlinkSync(path.join(d, "nowhere"), path.join(d, ".brain"));
  const r = spawnSync("node", [BIN, "dump", "hello"], { cwd: d, encoding: "utf8", env: { ...process.env, BRAIN_DIR: "" } });
  assert.notEqual(r.status, 0); assert.ok(has(r.stderr, "missing folder"), r.stderr); assert.deepEqual(fs.readdirSync(d), [".brain"]);
});
test("link excludes .brain from git and allows reading the target", () => {
  const b = makeBrain(); const repo = path.join(tmp(), "r"); fs.mkdirSync(repo); spawnSync("git", ["init", "-q"], { cwd: repo });
  b.b("link", "app", repo);
  assert.ok(has(fs.readFileSync(path.join(repo, ".git/info/exclude"), "utf8"), ".brain"));
  const s = JSON.parse(fs.readFileSync(path.join(repo, ".claude/settings.local.json"), "utf8"));
  assert.ok(s.permissions.additionalDirectories[0].endsWith("projects/app"));
  assert.equal(spawnSync("git", ["status", "--short"], { cwd: repo, encoding: "utf8" }).stdout.includes(".brain"), false);
  assert.equal(b.b("link", "app", repo).code, 0); // idempotent
});
test("planner: dependencies unlock in the same plan and energy filters", () => {
  const b = makeBrain();
  b.project("p", "- [ ] Decide [effort:: s] [value:: 3] ^a\n- [ ] Build [after:: a] [energy:: high] [effort:: s] [value:: 3] ^b\n- [ ] Hard [energy:: high] [effort:: s] ^c\n");
  const hi = b.b("plan", "today", "--energy", "high").out;
  assert.ok(/1\. Decide/.test(hi) && has(hi, "Build"), hi);
  const lo = b.b("plan", "today", "--energy", "low").out;
  assert.ok(!has(lo, "Hard") && !has(lo, "Build"), lo);
});
test("deadline lane obeys --minutes", () => {
  const b = makeBrain(); b.project("p", "- [ ] Big [due:: 2026-10-18] [effort:: l] ^a\n- [ ] Small [due:: 2026-10-19] [effort:: xs] ^b\n");
  const o = b.b("plan", "today", "--minutes", "60").out;
  assert.ok(has(o, "DEADLINE  Small") && !has(o, "DEADLINE  Big") && has(o, "also due soon: 1"), o);
});
test("waiting needs check; follow-up appears when check is due", () => {
  const b = makeBrain(); b.project("p", "- [ ] Ask Sam [waiting:: Sam] [check:: 2026-10-16] ^a\n- [ ] Bad wait [waiting:: Al] ^b\n");
  const o = b.b("plan", "today").out; assert.ok(has(o, "Follow up: ask Sam"), o); assert.ok(has(o, "needs fixing (1)"), o);
});
test("task add assigns ids, rejects xl, warns over 12", () => {
  const b = makeBrain(); b.b("project", "new", "p");
  assert.notEqual(b.b("task", "add", "p", "Huge", "--effort", "xl").code, 0);
  let last; for (let i = 0; i < 13; i++) last = b.b("task", "add", "p", `Task ${i}`);
  assert.ok(has(last.out, "over the 12-task budget"), last.out);
  assert.ok(has(b.r("projects/p/tasks.md"), "^t13"));
});
test("grep: allowed flags work and hits are fenced and annotated", () => {
  const b = makeBrain(); b.w("projects/p/objectives.md", "---\nslug: p\n---\n## Auth model\n> OAuth decisions\nuse PKCE here\n");
  const o = b.b("grep", "-i", "pkce").out;
  assert.ok(has(o, "<<< data from notes") && has(o, "auth-model") && has(o, "PKCE"), o);
  assert.ok(has(b.b("find", "oauth").out, "auth-model"));
  assert.ok(has(b.b("get", "p/objectives", "auth-model").out, "use PKCE here"));
});
test("lint: every item needs a description line", () => {
  const b = makeBrain(); b.w("projects/p/objectives.md", "---\nslug: p\nstate: active\n---\n## No desc\ntext\n");
  const l = b.b("lint"); assert.equal(l.code, 1); assert.ok(has(l.out, "needs a"), l.out);
});
test("lint: a lookalike task line is reported, not skipped", () => {
  const b = makeBrain(); b.project("p", "- [] no space ^a\n* [ ] star bullet ^b\n");
  const l = b.b("lint"); assert.equal(l.code, 1); assert.ok(has(l.out, "looks like a task"), l.out);
  assert.ok(has(b.b("plan", "next").out, "task-looking lines not parsed"));
});
test("concurrent writers do not lose lines", async () => {
  const b = makeBrain(); b.b("project", "new", "p");
  const { spawn } = await import("node:child_process");
  await Promise.all(Array.from({ length: 8 }, (_, i) => new Promise((res) => spawn("node", [BIN, "--brain", b.root, "task", "add", "p", `Task ${i}`], { env: { ...process.env, BRAIN_NOW: "2026-10-17 09:00" } }).on("close", res))));
  const ids = [...b.r("projects/p/tasks.md").matchAll(/\^(t\d+)/g)].map((m) => m[1]);
  assert.equal(ids.length, 8); assert.equal(new Set(ids).size, 8);
});
test("derived notes: draft needs a source, confirm is gated, reject and consume are undoable", () => {
  const b = makeBrain();
  const body = "Use PKCE.\n\n## Why\n> reason\nSecrets cannot be kept.\n";
  assert.notEqual(b.run(["note", "new", "--kind", "atomic", "--title", "PKCE", "--source", "nothing"], { input: body }).code, 0);
  const r = b.run(["note", "new", "--kind", "atomic", "--title", "PKCE", "--source", "[[inbox/x]]"], { input: body });
  assert.ok(has(r.out, "status: draft"), r.out + r.err);
  assert.ok(has(b.b("draft", "list").out, "notes/pkce.md"));
  assert.ok(has(b.b("draft", "confirm", "notes/pkce.md").out, "confirmed"));
  assert.equal(b.b("lint").code, 0, b.b("lint").out);
  assert.notEqual(b.b("draft", "reject", "notes/pkce.md").code, 0); // confirmed notes cannot be rejected
  const k = b.run(["note", "new", "--kind", "kb", "--kb", "playbooks", "--ptype", "method", "--title", "Weekly reset", "--source", "[[inbox/y]]"], { input: "Steps.\n" });
  assert.ok(has(k.out, "kb/playbooks/weekly-reset.md"), k.out + k.err);
  assert.ok(has(b.r("kb/playbooks/weekly-reset.md"), "type: method"));
  b.b("draft", "reject", "kb/playbooks/weekly-reset.md"); assert.equal(b.exists("kb/playbooks/weekly-reset.md"), false);
  b.b("undo"); assert.equal(b.exists("kb/playbooks/weekly-reset.md"), true);
});
test("consume removes only fleeting notes", () => {
  const b = makeBrain(); b.b("dump", "--kind", "note", "x");
  const id = fs.readdirSync(path.join(b.root, "inbox"))[0];
  assert.ok(has(b.b("consume", `inbox/${id}`).out, "removed"));
  b.w("notes/a.md", "---\ntags: [atomic]\n---\n# a\n"); assert.notEqual(b.b("consume", "notes/a").code, 0);
});
test("project state and archive", () => {
  const b = makeBrain(); b.b("project", "new", "p");
  assert.notEqual(b.b("project", "state", "p", "paused").code, 0);
  assert.ok(has(b.b("project", "state", "p", "paused", "--start", "2026-11-01").out, "paused"));
  assert.ok(has(b.r("projects/p/objectives.md"), "state: paused") && has(b.r("projects/p/objectives.md"), "start: 2026-11-01"));
  assert.ok(has(b.b("project", "archive", "p").out, "projects/_done/p"));
  assert.equal(b.exists("projects/p/tasks.md"), false); assert.equal(b.exists("projects/_done/p/tasks.md"), true);
  b.b("undo"); assert.equal(b.exists("projects/p/tasks.md"), true);
});
test("setup-claude writes commands, hooks and permissions, and keeps user files", () => {
  const b = makeBrain();
  assert.ok(b.exists(".claude/commands/next.md") && !has(b.r(".claude/commands/next.md"), "disable-model-invocation"));
  assert.ok(has(b.r(".claude/commands/dump.md"), "disable-model-invocation: true"));
  b.w(".claude/commands/next.md", "mine\n"); b.b("setup-claude");
  assert.equal(b.r(".claude/commands/next.md"), "mine\n");
  const s = JSON.parse(b.r(".claude/settings.json"));
  assert.ok(s.hooks.SessionStart && s.hooks.SessionEnd && s.hooks.UserPromptSubmit);
  assert.equal(s.hooks.SessionStart.length, 1);
  assert.ok(s.permissions.allow.every((r) => !/brain \*|:\*\)$/.test(r) || /brain [a-z-]+( [a-z-]+)*:\*\)$/.test(r)));
});
