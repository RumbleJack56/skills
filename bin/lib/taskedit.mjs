// Editing a task line safely: the line must still be exactly what the caller saw (id + hash).
import { parseTaskLine, EFFORT_MIN } from "./tasks.mjs";

export function setField(line, key, value) {
  const re = new RegExp(`\\[${key}::[ \\t]*[^\\]]*\\]`);
  if (value === null || value === undefined) return line.replace(new RegExp(`[ \\t]*\\[${key}::[ \\t]*[^\\]]*\\]`), "");
  const f = `[${key}:: ${value}]`;
  if (re.test(line)) return line.replace(re, f);
  const m = /([ \t]+\^[A-Za-z0-9][A-Za-z0-9_.-]*)[ \t]*$/.exec(line);
  if (m) return line.slice(0, m.index) + ` ${f}` + m[1];
  return `${line.replace(/\s+$/, "")} ${f}`;
}

// Change one task line. fn(line) -> new line. Throws if the line changed since the caller read it.
export function editTaskLine(t, tx, fn) {
  tx.edit(t.file, (text) => {
    const ls = text.split("\n");
    const i = t.line - 1;
    if (ls[i] === undefined || ls[i].replace(/\s+$/, "") !== t.raw) throw new Error(`${t.key}: the line changed since it was read. Run the plan again.`);
    const next = fn(ls[i]);
    const check = parseTaskLine(next, t.project, t.line);
    if (!check) throw new Error("edit would no longer be a task line");
    ls[i] = next;
    return ls.join("\n");
  });
}

export function requireHash(t, hash) {
  if (!hash) throw new Error("--hash is required (copy it from the plan output: key#hash)");
  if (t.hash !== hash) throw new Error(`${t.key}: hash ${hash} does not match the current line (${t.hash}). Run the plan again.`);
}

export function splitRef(ref) {
  const m = /^(.*?)(?:#([0-9a-f]{6}))?$/.exec(ref);
  return { key: m[1], hash: m[2] ?? null };
}

export function buildTaskLine(title, f = {}, id) {
  const parts = [`- [ ] ${title.replace(/\s+/g, " ").trim()}`];
  for (const k of ["after", "energy", "effort", "due", "value", "waiting", "check", "start", "added"]) if (f[k] !== undefined && f[k] !== null && f[k] !== "") parts.push(`[${k}:: ${f[k]}]`);
  if (f.remind) parts.push(`[remind:: ${f.remind}]`);
  if (f.hard) parts.push("[hard:: yes]");
  if (id) parts.push(`^${id}`);
  return parts.join(" ");
}
export const EFFORTS = Object.keys(EFFORT_MIN);
