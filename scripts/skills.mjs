#!/usr/bin/env node
// Repo tooling for the skills repo. Zero dependencies.
//
//   node scripts/skills.mjs new-bucket <bucket> "<description>" [--unshipped]
//   node scripts/skills.mjs new-skill <bucket> <skill> "<description>"
//   node scripts/skills.mjs sync        # regenerate plugin.json skills, marketplace.json, READMEs
//   node scripts/skills.mjs validate    # lint everything (used by CI)
//
// Layout: skills/<bucket>/<skill>/SKILL.md. Buckets are listed in skills/buckets.json.
// The repo is ONE Claude Code plugin (one namespace); it ships every skill in the
// buckets marked "shipped". Unshipped buckets (e.g. in-progress) are only reachable
// through `npx skills`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const BUCKETS = path.join(SKILLS_DIR, "buckets.json");
const PLUGIN = path.join(ROOT, ".claude-plugin", "plugin.json");
const MARKETPLACE = path.join(ROOT, ".claude-plugin", "marketplace.json");
const README = path.join(ROOT, "README.md");
const SKILL_TEMPLATE = path.join(ROOT, "templates", "skill", "SKILL.md.tmpl");
const REPO = "RumbleJack56/skills";
const BRANCH = "main";
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CATALOG_START = "<!-- catalog:start -->";
const CATALOG_END = "<!-- catalog:end -->";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// Minimal YAML frontmatter parser: top-level `key: value` pairs, quoted
// strings, and `>` / `|` block scalars. Enough for SKILL.md frontmatter.
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const out = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, value] = kv;
    if (/^[>|][-+]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1] === "")) {
        block.push(lines[++i].trim());
      }
      value = block.join(value.startsWith(">") ? " " : "\n").trim();
    } else if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    out[key] = value;
  }
  return out;
}

const readBuckets = () => (fs.existsSync(BUCKETS) ? readJson(BUCKETS) : {});

function bucketDirs() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function listSkills(bucket) {
  const dir = path.join(SKILLS_DIR, bucket);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const file = path.join(dir, d.name, "SKILL.md");
      const fm = fs.existsSync(file) ? parseFrontmatter(fs.readFileSync(file, "utf8")) : null;
      return { dir: d.name, file, fm };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

// First sentence of a description, for compact tables.
const summary = (d = "") => (d.match(/^.*?[.!?](\s|$)/)?.[0] ?? d).trim();

// ---------------------------------------------------------------- commands

function newBucket(name, description, ...flags) {
  if (!name || !description) die('usage: new-bucket <bucket> "<description>" [--unshipped]');
  if (!NAME_RE.test(name)) die(`bucket name must be kebab-case: ${name}`);
  const buckets = readBuckets();
  if (buckets[name] || fs.existsSync(path.join(SKILLS_DIR, name))) die(`bucket already exists: ${name}`);
  buckets[name] = { description, shipped: !flags.includes("--unshipped") };
  fs.mkdirSync(path.join(SKILLS_DIR, name), { recursive: true });
  writeJson(BUCKETS, buckets);
  console.log(`created skills/${name}`);
  sync();
}

function newSkill(bucket, name, description) {
  if (!bucket || !name || !description) die('usage: new-skill <bucket> <skill> "<description>"');
  if (!NAME_RE.test(name) || name.length > 64) die(`skill name must be kebab-case, <=64 chars: ${name}`);
  if (!readBuckets()[bucket]) die(`unknown bucket: ${bucket} (run new-bucket first)`);
  for (const b of bucketDirs()) {
    if (listSkills(b).some((s) => s.dir === name)) die(`skill name already used in bucket "${b}": ${name}`);
  }
  const dir = path.join(SKILLS_DIR, bucket, name);
  fs.mkdirSync(dir, { recursive: true });
  const body = fs
    .readFileSync(SKILL_TEMPLATE, "utf8")
    .replaceAll("{{name}}", name)
    .replaceAll("{{description}}", description.replace(/"/g, '\\"'))
    .replaceAll("{{title}}", name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "));
  fs.writeFileSync(path.join(dir, "SKILL.md"), body);
  console.log(`created skills/${bucket}/${name}/SKILL.md`);
  sync();
}

// ---------------------------------------------------------------- generated files

function expectedPluginSkills() {
  const buckets = readBuckets();
  return Object.keys(buckets)
    .sort()
    .filter((b) => buckets[b].shipped)
    .flatMap((b) => listSkills(b).map((s) => `./skills/${b}/${s.dir}`));
}

function expectedMarketplacePlugins(plugin) {
  return [{ name: plugin.name, source: "./", description: plugin.description, version: plugin.version }];
}

function bucketReadme(bucket, meta, pluginName) {
  const skills = listSkills(bucket);
  const rows = skills.map((s) => `| [\`${s.dir}\`](${s.dir}/SKILL.md) | ${summary(s.fm?.description)} |`);
  const install = meta.shipped
    ? `Claude Code: included in the \`${pluginName}\` plugin, so skills are invoked as \`/${pluginName}:<skill>\`.\n\n`
    : `**Not shipped in the Claude Code plugin.** Install these with \`npx skills\` only.\n\n`;
  return [
    `<!-- generated by scripts/skills.mjs sync; edit skills/buckets.json and SKILL.md files instead -->`,
    `# ${bucket}`,
    ``,
    meta.description,
    ``,
    install + "Just this bucket:",
    ``,
    "```bash",
    `npx skills add https://github.com/${REPO}/tree/${BRANCH}/skills/${bucket}`,
    "```",
    ``,
    `| Skill | What it does |`,
    `|---|---|`,
    ...(rows.length ? rows : ["| _none yet_ | |"]),
    ``,
  ].join("\n");
}

function buildCatalog(pluginName) {
  const buckets = readBuckets();
  const names = Object.keys(buckets).sort();
  if (!names.length) return "_No buckets yet. Run `node scripts/skills.mjs new-bucket <name> \"<description>\"`._";
  const rows = names.map((b) => {
    const skills = listSkills(b).map((s) => `\`${s.dir}\``).join(", ") || "_none yet_";
    const shipped = buckets[b].shipped ? `✓ \`/${pluginName}:…\`` : "npx only";
    return `| [\`${b}\`](skills/${b}) | ${buckets[b].description} | ${skills} | ${shipped} |`;
  });
  return ["| Bucket | Use case | Skills | Claude Code plugin |", "|---|---|---|---|", ...rows].join("\n");
}

function renderReadme(pluginName) {
  const readme = fs.readFileSync(README, "utf8");
  const start = readme.indexOf(CATALOG_START);
  const end = readme.indexOf(CATALOG_END);
  if (start === -1 || end === -1) die("README.md is missing catalog markers");
  return readme.slice(0, start + CATALOG_START.length) + "\n" + buildCatalog(pluginName) + "\n" + readme.slice(end);
}

function sync() {
  const plugin = readJson(PLUGIN);
  plugin.skills = expectedPluginSkills();
  writeJson(PLUGIN, plugin);
  const marketplace = readJson(MARKETPLACE);
  marketplace.plugins = expectedMarketplacePlugins(plugin);
  writeJson(MARKETPLACE, marketplace);
  for (const [b, meta] of Object.entries(readBuckets())) {
    fs.mkdirSync(path.join(SKILLS_DIR, b), { recursive: true });
    fs.writeFileSync(path.join(SKILLS_DIR, b, "README.md"), bucketReadme(b, meta, plugin.name));
  }
  fs.writeFileSync(README, renderReadme(plugin.name));
  console.log("synced plugin.json, marketplace.json, bucket READMEs and README catalog");
}

function validate() {
  const errors = [];
  const plugin = readJson(PLUGIN);
  const marketplace = readJson(MARKETPLACE);
  const buckets = readBuckets();
  if (!NAME_RE.test(plugin.name ?? "")) errors.push("plugin.json: name (the namespace) must be kebab-case");
  if (!/^\d+\.\d+\.\d+/.test(plugin.version ?? "")) errors.push("plugin.json: version must be semver");
  if (!NAME_RE.test(marketplace.name ?? "")) errors.push("marketplace.json: name must be kebab-case");
  if (!marketplace.owner?.name) errors.push("marketplace.json: owner.name is required");

  for (const b of bucketDirs()) if (!buckets[b]) errors.push(`skills/${b}: not listed in skills/buckets.json`);
  const seen = new Map();
  for (const [b, meta] of Object.entries(buckets)) {
    const where = `skills/${b}`;
    if (!NAME_RE.test(b)) errors.push(`${where}: bucket name must be kebab-case`);
    if (!meta.description) errors.push(`${where}: buckets.json description is required`);
    if (typeof meta.shipped !== "boolean") errors.push(`${where}: buckets.json "shipped" must be true or false`);
    for (const s of listSkills(b)) {
      const sw = `${where}/${s.dir}`;
      if (!s.fm) {
        errors.push(`${sw}: SKILL.md missing or has no frontmatter`);
        continue;
      }
      if (s.fm.name !== s.dir) errors.push(`${sw}: frontmatter name "${s.fm.name}" must match directory name`);
      if (!NAME_RE.test(s.fm.name ?? "") || s.fm.name.length > 64) errors.push(`${sw}: name must be kebab-case, <=64 chars`);
      if (!s.fm.description) errors.push(`${sw}: description is required`);
      else if (s.fm.description.length > 1024) errors.push(`${sw}: description exceeds 1024 chars`);
      if (/TODO/.test(fs.readFileSync(s.file, "utf8"))) errors.push(`${sw}: SKILL.md still contains TODO placeholders`);
      if (seen.has(s.dir)) errors.push(`${sw}: skill name also used in ${seen.get(s.dir)} (names must be unique repo-wide)`);
      seen.set(s.dir, where);
    }
  }

  const stale = "is out of date. Run `node scripts/skills.mjs sync`";
  if (JSON.stringify(plugin.skills) !== JSON.stringify(expectedPluginSkills())) errors.push(`plugin.json skills ${stale}`);
  if (JSON.stringify(marketplace.plugins) !== JSON.stringify(expectedMarketplacePlugins(plugin)))
    errors.push(`marketplace.json plugins ${stale}`);
  for (const [b, meta] of Object.entries(buckets)) {
    const p = path.join(SKILLS_DIR, b, "README.md");
    if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== bucketReadme(b, meta, plugin.name))
      errors.push(`skills/${b}/README.md ${stale}`);
  }
  if (fs.readFileSync(README, "utf8") !== renderReadme(plugin.name)) errors.push(`README catalog ${stale}`);

  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log(`✓ ${Object.keys(buckets).length} bucket(s), ${seen.size} skill(s) valid`);
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  "new-bucket": () => newBucket(...args),
  "new-skill": () => newSkill(...args),
  sync,
  validate,
};
if (!commands[cmd]) die(`unknown command "${cmd ?? ""}". Use one of: ${Object.keys(commands).join(", ")}`);
commands[cmd]();
