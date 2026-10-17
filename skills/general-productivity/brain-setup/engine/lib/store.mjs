// File access: encoding-safe reads and writes, atomic replace, a lock, and the write journal.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const sha = (s, n = 6) => crypto.createHash("sha1").update(s).digest("hex").slice(0, n);

export function readDoc(file) {
  const buf = fs.readFileSync(file);
  let enc = "utf8", text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf); } catch { enc = "latin1"; text = buf.toString("latin1"); }
  let bom = false;
  if (text.charCodeAt(0) === 0xfeff) { bom = true; text = text.slice(1); }
  const crlf = text.includes("\r\n");
  if (crlf) text = text.replace(/\r\n/g, "\n");
  return { text, bom, crlf, enc };
}
export function serialize(doc) {
  let t = doc.text;
  if (doc.crlf) t = t.replace(/\n/g, "\r\n");
  if (doc.bom) t = "﻿" + t;
  return Buffer.from(t, doc.enc === "latin1" ? "latin1" : "utf8");
}
export function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}-${crypto.randomBytes(3).toString("hex")}`);
  const fd = fs.openSync(tmp, "w");
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
export const safeRead = (file) => { try { return readDoc(file); } catch { return null; } };

// ---- lock: mkdir is atomic. A lock older than 30 s is treated as stale. ----
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
let held = 0;
export function withLock(brain, fn) {
  if (held) return fn();
  const dir = path.join(brain, ".brain", "lock");
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const deadline = Date.now() + 10000;
  for (;;) {
    try { fs.mkdirSync(dir); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(dir).mtimeMs > 30000) fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      if (Date.now() > deadline) throw new Error("another brain command holds the lock (waited 10 s)");
      sleep(20 + Math.floor(Math.random() * 30));
    }
  }
  held++;
  try { return fn(); } finally { held--; fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- transactions: every write is a line-range edit, recorded in .brain/journal.jsonl ----
const lines = (t) => (t === "" ? [] : t.split("\n"));
function diffOp(rel, before, after) {
  const a = lines(before), b = lines(after);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { file: rel, start: p, del: a.slice(p, a.length - s), add: b.slice(p, b.length - s) };
}

export class Tx {
  constructor(brain, cmd) { this.brain = brain; this.cmd = cmd; this.ops = []; }
  abs(rel) { return path.join(this.brain, rel); }
  // mutate(text) -> new text. Creates the file when missing (mutate gets "").
  edit(rel, mutate) {
    const f = this.abs(rel);
    const exists = fs.existsSync(f);
    const doc = exists ? readDoc(f) : { text: "", bom: false, crlf: false, enc: "utf8" };
    const next = mutate(doc.text);
    if (next === doc.text) return false;
    if (!exists) { atomicWrite(f, serialize({ ...doc, text: next })); this.ops.push({ file: rel, created: true, content: next }); return true; }
    atomicWrite(f, serialize({ ...doc, text: next }));
    this.ops.push(diffOp(rel, doc.text, next));
    return true;
  }
  create(rel, text) {
    const f = this.abs(rel);
    if (fs.existsSync(f)) throw new Error(`refusing to overwrite ${rel}`);
    atomicWrite(f, Buffer.from(text, "utf8"));
    this.ops.push({ file: rel, created: true, content: text });
  }
  remove(rel) {
    const f = this.abs(rel);
    const doc = readDoc(f);
    fs.unlinkSync(f);
    this.ops.push({ file: rel, removed: true, content: doc.text });
  }
  commit(extra = {}) {
    if (!this.ops.length && !extra.note) return null;
    const entry = { id: crypto.randomBytes(4).toString("hex"), ts: new Date().toISOString(), cmd: this.cmd, ...extra, ops: this.ops };
    const j = path.join(this.brain, ".brain", "journal.jsonl");
    fs.mkdirSync(path.dirname(j), { recursive: true });
    fs.appendFileSync(j, JSON.stringify(entry) + "\n");
    return entry.id;
  }
}
// A tx started inside another tx joins it, so one command is one undo step.
let activeTx = null;
export function tx(brain, cmd, fn, extra) {
  if (activeTx && activeTx.brain === brain) return fn(activeTx);
  return withLock(brain, () => {
    const t = new Tx(brain, cmd);
    activeTx = t;
    let r;
    try { r = fn(t); } finally { activeTx = null; t.commit(typeof extra === "function" ? extra() : extra); }
    return r;
  });
}

export function readJournal(brain) {
  const j = path.join(brain, ".brain", "journal.jsonl");
  if (!fs.existsSync(j)) return [];
  return fs.readFileSync(j, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

// Reverse the last n un-undone groups. Returns messages.
export function undo(brain, n = 1) {
  return withLock(brain, () => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const all = readJournal(brain);
      const undone = new Set(all.filter((e) => e.undo_of).map((e) => e.undo_of));
      const target = [...all].reverse().find((e) => !e.undo_of && !undone.has(e.id) && e.ops?.length);
      if (!target) { out.push("nothing to undo"); break; }
      const t = new Tx(brain, "undo");
      for (const op of [...target.ops].reverse()) {
        const f = t.abs(op.file);
        if (op.created) {
          if (fs.existsSync(f) && readDoc(f).text === op.content) fs.unlinkSync(f);
          else if (fs.existsSync(f)) throw new Error(`cannot undo: ${op.file} changed since`);
        } else if (op.removed) {
          if (!fs.existsSync(f)) atomicWrite(f, Buffer.from(op.content, "utf8"));
        } else {
          const doc = readDoc(f);
          const ls = lines(doc.text);
          let at = op.start;
          const same = (i) => op.add.every((x, j) => ls[i + j] === x) && i + op.add.length <= ls.length;
          if (!same(at)) {
            const hits = []; for (let i = 0; i + op.add.length <= ls.length; i++) if (same(i)) hits.push(i);
            if (hits.length !== 1) throw new Error(`cannot undo: ${op.file} changed since (lines not found)`);
            at = hits[0];
          }
          ls.splice(at, op.add.length, ...op.del);
          atomicWrite(f, serialize({ ...doc, text: ls.join("\n") }));
        }
      }
      fs.appendFileSync(path.join(brain, ".brain", "journal.jsonl"), JSON.stringify({ id: crypto.randomBytes(4).toString("hex"), ts: new Date().toISOString(), cmd: "undo", undo_of: target.id, ops: [] }) + "\n");
      out.push(`undone: ${target.cmd} (${target.ops.length} change${target.ops.length === 1 ? "" : "s"})`);
    }
    return out;
  });
}
