# AGENTS.md

Context for AI agents working in this repo. `CLAUDE.md` imports this file, so keep everything here.

## What this repo is

RumbleJack56's agent skills (`github.com/RumbleJack56/skills`), organized into **buckets** by use case, in the
style of `mattpocock/skills`.

- **Claude Code:** the whole repo is **one plugin**, `rumblejack-skills`, from the marketplace
  `rumblejack-skills`. Every shipped skill shares one namespace: `/rumblejack-skills:<skill>`.
  Install: `/plugin marketplace add RumbleJack56/skills`, then `/plugin install rumblejack-skills@rumblejack-skills`.
- **`npx skills`:** installs by bucket (`…/tree/main/skills/<bucket>`) or by skill (`--skill <name>`), with no
  namespace. Installing one bucket is only possible this way; the Claude Code plugin always brings every
  shipped bucket.

## Layout

```text
.claude-plugin/plugin.json       # the plugin: name (namespace), version; skills[] is GENERATED
.claude-plugin/marketplace.json  # plugins[] is GENERATED
skills/buckets.json              # bucket → { description, shipped }
skills/<bucket>/README.md        # GENERATED
skills/<bucket>/<skill>/SKILL.md # plus optional references/, assets/, scripts/
templates/skill/SKILL.md.tmpl    # .tmpl so npx skills doesn't find it as a real skill
scripts/skills.mjs               # new-bucket, new-skill, sync, validate (Node ≥18, no deps)
.github/workflows/validate.yml   # CI runs validate
```

Buckets marked `"shipped": false` (currently `in-progress`, for beta skills) are left out of the plugin and
can only be installed with `npx skills`. To promote a skill, move its folder to a shipped bucket and run `sync`.

## Rules

- Scaffold with `node scripts/skills.mjs new-bucket <bucket> "<desc>" [--unshipped]` and
  `new-skill <bucket> <skill> "<desc>"`; don't create the folders by hand.
- Never hand-edit generated files. Change `buckets.json` or the skill folders, then run
  `node scripts/skills.mjs sync`.
- Run `node scripts/skills.mjs validate` (and `claude plugin validate .` if available) before committing.
- Skill names must be kebab-case, match their folder, and be unique across all buckets, because they share
  one namespace.
- A skill's `description` decides when agents load it. State what it does and when to use it, and err on
  the side of triggering too often. Keep `SKILL.md` under ~500 lines; put long material in `references/`.
- Bump `version` in `.claude-plugin/plugin.json` when releasing changes.

## Where skills read and write

Every skill works only inside these three directories at the project root it runs in. Each SKILL.md must say
which ones it uses and explain the convention itself, because skills are installed on their own.

| Directory | Git | Purpose |
|---|---|---|
| `.mynotes/` | ignored | Personal tracking and organization |
| `.scratchpad/` | ignored | Active working memory for the current task |
| `docs/` | committed | Formal, refined documentation and ideas |

Ideas move up the chain as they mature: `.scratchpad/` → `.mynotes/` → `docs/`. A skill that writes to
`.mynotes/` or `.scratchpad/` makes sure they are gitignored first. This repo gitignores both as well.

## Skills

- **`general-productivity/adhd`** (`/rumblejack-skills:adhd`): an ADHD-friendly personal organizer. It
  organizes and **does not do the tasks itself**. It captures brain dumps and keeps the backlog, today's
  plan, parking lot and logs in `.mynotes/`. It writes only `.scratchpad/focus.md` for the chosen task and
  never writes to `docs/`. Modes: capture, plan, breakdown, now/focus, low energy, overwhelm, park, done,
  and check-ins. Every reply is short, shows at most 3 priorities and ends with one `**Next:**` action.
- **`niche/setup-vps`** (`/rumblejack-skills:setup-vps`): sets up a VPS over SSH as root. It **generates an
  idempotent per-step script** in `.scratchpad/setup-vps/<host>/setup.sh` and runs it only on request, one
  confirmed step at a time. It adapts to the OS from `/etc/os-release`. It creates users (sudo via the OS
  admin group, passwords from a gitignored `passwords.txt` piped to `chpasswd`), a `deploy` user and group
  (the single rootless-Podman service user that runs all containers), the `shared` group, and `/srv` +
  `/shared` (2770 + default group ACLs). It also sets up the firewall (the real SSH port, 80 and 443),
  fail2ban and optional Traefik v3 (compose + `podman-restart.service`, with a DNS pre-check), with SSH
  hardening as an optional last step. It records the result in `docs/vps/<host>.md` and never writes to
  `.mynotes/`.

## Status (as of 2026-10-01)

- No commits yet. The local branch is `master`; rename it to `main` before the first push, because
  install links use `tree/main`. No LICENSE has been chosen yet.
- `adhd` iteration 1 has been tested (with skill: 100% of checks; without: 24%). Results are in
  `.scratchpad/adhd-task-manager-workspace/` (gitignored; the folder name predates the rename). That folder
  has `evals/evals.json`, `grade.py` and `judgments.json`, plus `iteration-1/` with a review viewer and
  `benchmark.json`.
- **Next:** read the user's review feedback (`feedback.json` in the workspace once they submit it), then
  do iteration 2. Known bug to fix: `assets/focus.md` says "Tracked in .mynotes/today.md", but Overwhelm
  mode doesn't create `today.md`.
- `setup-vps` (added 2026-10-01, `niche` bucket, shipped) hasn't been tested yet. Eval prompts are in
  `.scratchpad/setup-vps-workspace/evals/evals.json`. It still needs a real run on a throwaway VPS (one
  RHEL-family and one Debian/Ubuntu).
- Ideas not yet done: optimize the trigger description (skill-creator `run_loop`), and try
  `claude plugin eval` for in-repo evals.
