import fs from "node:fs";
import path from "node:path";
import { findBrain, readConfig, loadAll } from "./brain.mjs";
import { now } from "./dates.mjs";
import { safeRead } from "./store.mjs";

export function makeCtx(opts = {}) {
  const found = findBrain(opts.cwd ?? process.cwd(), opts.brain);
  const cfg = readConfig(found.root);
  const n = now(cfg);
  return { root: found.root, project: found.project, cfg, now: n, day: n.day, load: () => loadAll(found.root, { day: n.day }) };
}
export const rel = (ctx, abs) => path.relative(ctx.root, abs);
export const exists = (ctx, r) => fs.existsSync(path.join(ctx.root, r));
export const docOf = (ctx, r) => safeRead(path.join(ctx.root, r));
