// Knowledge layer: derived notes (always drafts with a source), drafts gate, project state and archive.
import fs from "node:fs";
import path from "node:path";
import { tx, readDoc, safeRead } from "./store.mjs";
import { slugify, cleanTitle, clean } from "./util.mjs";
import { parseFrontmatter, hasTag } from "./brain.mjs";
import { walkMd, reindexText } from "./notes.mjs";
import { isDate } from "./dates.mjs";

const KINDS = { literature: "notes", atomic: "notes", kb: "kb" };
const KB = ["people", "things", "systems", "playbooks"];
const PTYPES = ["playbook", "method", "guide"];

// Create a derived note. The body comes from the caller; the engine adds provenance and the draft status.
export function noteNew(ctx, { kind, title, source, kbDir, ptype, body }) {
  if (!KINDS[kind]) throw new Error("kind must be literature, atomic or kb");
  const t = cleanTitle(title, 100);
  const slug = slugify(t);
  if (!slug) throw new Error("title needs letters or digits");
  if (!source || !/^\[\[[^\]]+\]\](?:,\s*\[\[[^\]]+\]\])*$/.test(source.trim())) throw new Error('--source must be one or more links to fleeting notes or sources, like "[[inbox/2026-10-17-0900-idea]]"');
  let dir = KINDS[kind];
  let tags = kind === "literature" ? "[literature/unfiled]" : kind === "atomic" ? "[atomic]" : "[kb]";
  const extra = [];
  if (kind === "kb") {
    if (!KB.includes(kbDir)) throw new Error(`--kb must be one of ${KB.join(", ")}`);
    dir = `kb/${kbDir}`;
    if (kbDir === "playbooks") {
      if (!PTYPES.includes(ptype)) throw new Error(`--ptype must be one of ${PTYPES.join(", ")} for a playbook`);
      extra.push(`type: ${ptype}`);
    }
  }
  const rel = `${dir}/${slug}.md`;
  if (fs.existsSync(path.join(ctx.root, rel))) throw new Error(`${rel} already exists; edit it instead`);
  const text = `---\ntags: ${tags}\nstatus: draft\nsource: ${JSON.stringify(source.trim())}\ncreated: ${ctx.day}\n${extra.length ? extra.join("\n") + "\n" : ""}---\n# ${t}\n\n${body.replace(/\s+$/, "")}\n`;
  tx(ctx.root, "note new", (x) => x.create(rel, reindexText(text)));
  return rel;
}

export function draftList(ctx) {
  const out = [];
  walkMd(ctx.root, ["notes", "kb"], (f) => {
    const d = safeRead(f);
    if (!d) return;
    const { fm } = parseFrontmatter(d.text);
    if (fm.status === "draft") out.push({ rel: path.relative(ctx.root, f), title: cleanTitle(/^# (.+)$/m.exec(d.text)?.[1] ?? path.basename(f, ".md"), 70), source: fm.source ?? "" });
  });
  return out;
}
export function draftConfirm(ctx, rel) {
  const file = path.join(ctx.root, rel);
  if (!fs.existsSync(file) || path.isAbsolute(rel) || rel.split("/").includes("..")) throw new Error(`no note ${rel}`);
  tx(ctx.root, "draft confirm", (x) => x.edit(rel, (t) => {
    if (!/^status:\s*draft\s*$/m.test(t)) throw new Error(`${rel} is not a draft`);
    const src = /^source:\s*\S/m.test(t.split("\n---\n")[0]);
    if (!src) throw new Error(`${rel} has no source line; add its source before confirming`);
    return t.replace(/^status:\s*draft\s*$/m, "status: confirmed");
  }));
  return rel;
}
export function draftReject(ctx, rel) {
  if (path.isAbsolute(rel) || rel.split("/").includes("..") || !fs.existsSync(path.join(ctx.root, rel))) throw new Error(`no note ${rel}`);
  const d = readDoc(path.join(ctx.root, rel));
  if (!/^status:\s*draft\s*$/m.test(d.text)) throw new Error(`${rel} is not a draft (only drafts can be rejected)`);
  tx(ctx.root, "draft reject", (x) => x.remove(rel));
}
// Delete a fleeting note after its content lives elsewhere (journal + git bring it back).
export function consume(ctx, rel) {
  if (path.isAbsolute(rel) || rel.split("/").includes("..")) throw new Error("bad path");
  const f = path.join(ctx.root, rel.endsWith(".md") ? rel : `${rel}.md`);
  const d = safeRead(f);
  if (!d) throw new Error(`no note ${rel}`);
  if (!hasTag(parseFrontmatter(d.text).fm, "fleeting")) throw new Error(`${rel} is not a fleeting note`);
  tx(ctx.root, "consume", (x) => x.remove(path.relative(ctx.root, f)));
}

export function projectState(ctx, slug, state, start) {
  if (!["active", "paused", "done"].includes(state)) throw new Error("state must be active, paused or done");
  if (state === "paused" && !isDate(start ?? "")) throw new Error("paused needs --start YYYY-MM-DD");
  const rel = `projects/${slug}/objectives.md`;
  if (!fs.existsSync(path.join(ctx.root, rel))) throw new Error(`no project ${slug}`);
  tx(ctx.root, "project state", (x) => x.edit(rel, (t) => {
    if (!t.startsWith("---\n")) throw new Error("objectives.md has no frontmatter");
    const set = (text, k, v) => (new RegExp(`^${k}:.*$`, "m").test(text.split("\n---\n")[0]) ? text.replace(new RegExp(`^${k}:.*$`, "m"), `${k}: ${v}`) : text.replace(/^---\n/, `---\n${k}: ${v}\n`));
    let n = set(t, "state", state);
    if (start && state === "paused") n = set(n, "start", start);
    return n;
  }));
}
export function projectArchive(ctx, slug) {
  const dir = path.join(ctx.root, "projects", slug);
  if (!fs.existsSync(dir)) throw new Error(`no project ${slug}`);
  const dest = `projects/_done/${slug}`;
  if (fs.existsSync(path.join(ctx.root, dest))) throw new Error(`${dest} already exists`);
  tx(ctx.root, "project archive", (x) => {
    projectState(ctx, slug, "done");
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      if (!fs.statSync(f).isFile() || !n.endsWith(".md")) continue;
      x.create(`${dest}/${n}`, readDoc(f).text);
      x.remove(`projects/${slug}/${n}`);
    }
  });
  try { fs.rmdirSync(dir); } catch { /* other files remain: leave the folder */ }
  return dest;
}
