import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../bin/brain");
export function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-")); }

// A brain in a temp dir. b(args...) runs the engine; w(rel, text) writes a file.
export function makeBrain(now = "2026-10-17 09:00") {
  const root = path.join(tmp(), "brain");
  const env = { ...process.env, BRAIN_NOW: now, BRAIN_TZ: "UTC" };
  delete env.BRAIN_DIR;
  const run = (args, opts = {}) => {
    const r = spawnSync("node", [BIN, "--brain", root, ...args], { encoding: "utf8", env: { ...env, ...(opts.env ?? {}) }, input: opts.input, cwd: opts.cwd ?? root, timeout: opts.timeout ?? 20000 });
    return { out: r.stdout ?? "", err: r.stderr ?? "", code: r.status, signal: r.signal };
  };
  const init = spawnSync("node", [BIN, "init", root, "--timezone", "UTC", "--no-git"], { encoding: "utf8", env });
  if (init.status !== 0) throw new Error(init.stderr);
  return {
    root, run,
    b: (...args) => run(args),
    w: (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); },
    r: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    at: (now2) => (...args) => run(args, { env: { BRAIN_NOW: now2 } }),
    project(slug = "p", tasks = "", fm = "") {
      this.w(`projects/${slug}/objectives.md`, `---\ntype: project\ntags: [project]\nslug: ${slug}\nstate: active\n${fm}---\n## Outcome\n> test\n`);
      this.w(`projects/${slug}/tasks.md`, tasks);
    },
  };
}
export const has = (s, sub) => s.includes(sub);
