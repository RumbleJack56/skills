# AGENTS.md

Repository instructions for any AI agent working in this repo. `CLAUDE.md` imports this file.

Local, machine-specific state (work in progress, next steps, eval results) goes in `AGENTS.local.md`,
which is gitignored. Read it if it exists, and write session notes there, never here. This file only holds
rules that stay true for everyone who clones the repo.

## What this repo is

Agent skills organized into **buckets** by use case, in the style of `mattpocock/skills`.

- **Claude Code:** each shipped bucket is its own plugin (name = bucket, namespace `/<bucket>:<skill>`), all
  listed in the marketplace `rumblejack-skills` with `strict: false`, so there is no `plugin.json`. `npx skills`
  and `/plugin` therefore show the buckets as groups.
- **`npx skills`:** installs by bucket (`…/tree/main/skills/<bucket>`) or by skill (`--skill <name>`), with no
  namespace. Installing a single bucket is only possible this way.

## Layout

```text
.claude-plugin/marketplace.json  # plugins[] (one per shipped bucket) is GENERATED; metadata.version is the release version
skills/buckets.json              # bucket → { description, shipped }
skills/<bucket>/README.md        # GENERATED
skills/<bucket>/<skill>/SKILL.md # plus optional references/, assets/, scripts/
templates/skill/SKILL.md.tmpl    # .tmpl so npx skills doesn't find it as a real skill
scripts/skills.mjs               # new-bucket, new-skill, sync, validate (Node ≥18, no deps)
tests/engine/                    # node --test suites for the brain engine
.github/workflows/validate.yml   # CI runs validate on every push and PR
```

Buckets marked `"shipped": false` (such as `in-progress`, for beta skills) are left out of the plugin and can
only be installed with `npx skills`. To promote a skill, move its folder to a shipped bucket and run `sync`.

## Commands

```bash
node scripts/skills.mjs new-bucket <bucket> "<description>" [--unshipped]
node scripts/skills.mjs new-skill <bucket> <skill> "<description>"
node scripts/skills.mjs sync       # regenerate marketplace.json, bucket READMEs, README catalog
node scripts/skills.mjs validate   # lint everything (CI runs this)
claude plugin validate .           # when the claude CLI is available
```

## Rules

- Scaffold with `new-bucket` and `new-skill`; don't create the folders by hand.
- Never hand-edit generated files: the `plugins[]` list in
  `marketplace.json`, the bucket READMEs, and the README catalog between `<!-- catalog:start -->` and
  `<!-- catalog:end -->`. Change `buckets.json` or the skill folders, then run `sync`.
- Run `validate` before committing.
- Skill names must be kebab-case, match their folder, and be unique across all buckets, because they share
  one namespace.
- Every `SKILL.md` needs a `description` of at most 1024 characters and no leftover `TODO`s.
- A skill's `description` decides when agents load it. State what it does and when to use it, and err on
  the side of triggering too often. Keep `SKILL.md` under ~500 lines; put long material in `references/`.
- Bump `metadata.version` in `.claude-plugin/marketplace.json` and run `sync` when releasing changes.
- `README.md` holds only install and usage instructions (plus acknowledgements). Authoring docs belong here.
- **Commits have no AI co-author or attribution.** Don't add `Co-Authored-By` trailers, "Generated with"
  lines or similar. The repo owner authors and is accountable for every commit.

## Where skills read and write

The `engineering` and `niche` skills work only inside three directories at the project root they run in. Each
SKILL.md must say which ones it uses and explain the convention itself, because skills are installed on their own.

| Directory | Git | Purpose |
|---|---|---|
| `.mynotes/` | ignored | Personal tracking and organization |
| `.scratchpad/` | ignored | Active working memory for the current task |
| `docs/` | committed | Formal, refined documentation and ideas |

Ideas move up the chain as they mature: `.scratchpad/` → `.mynotes/` → `docs/`. A skill that writes to
`.mynotes/` or `.scratchpad/` makes sure they're gitignored first.

The `general-productivity` skills are the exception. They work inside the user's **brain folder** (an Obsidian
vault, a Claude Code directory and a private git repo) and in a project repo's `.brain/` link. They define
their own layout (see the `brain-notes` skill). The engine is `skills/general-productivity/brain-setup/engine/` (zero-dependency Node ≥ 18, needs
`rg` and GNU `sed`). It ships inside the skill so `npx skills` installs it; `brain install` copies it to
`~/.local/share/rumblejack-brain/` and links `~/.local/bin/brain`. Never add a root `bin/` (validate refuses it).
Tests: `node --test tests/engine/*.test.mjs`. Usage and design notes live in `docs/second-brain/`.

## Skills

- **`content/content-principles`**: copied unchanged from `aiwithremy/content-principles` (credited in the
  README). Don't rewrite it to house style; re-copy from upstream to update it.
- **`general-productivity/*`**: the second brain, built on the FLAP method (fleeting, literature, atomic,
  project). They organize and **never do the user's tasks**. Every reply is short, shows at most 3 priorities
  and ends with one `**Next:**` action. Core loop: `capture`, `route`, `plan`, `daily-review`. Also
  `brain-setup`, `brain-notes` (conventions), `task-graph`, `overwhelm`, `routines`, `reminders`, `backlog`.
- **`niche/setup-vps`**: sets up a VPS over SSH as root. It generates an idempotent per-step script in
  `.scratchpad/setup-vps/<host>/` and runs it only on request, one confirmed step at a time. It adapts to
  the OS. It covers users and sudo, the `deploy` service user (rootless Podman for all containers), the
  shared `/srv` and `/shared` group dirs, the firewall, fail2ban, optional Traefik and optional SSH
  hardening, and records the result in `docs/vps/<host>.md`.
- **`engineering/*`**: written in ASD-STE100 Simplified Technical English, they package patterns and
  decisions (not tutorials), and each works alone. App source code is the work product and stays in the
  app tree.
  - **`senior-dev`**: a lazy senior-developer discipline for any code change in any stack. It maps the reach
    and blast radius first, then takes the first option that fully works (skip, reuse, stdlib, installed
    dependency, one line, minimum code). It also covers root-cause bug tracing, behavior-preserving
    simplification, review, git hygiene (`references/git.md`) and a terse reply that ends with what was
    skipped and the risk. Only throwaway files go in `.scratchpad/senior-dev/`; it writes no `docs/` record.

  The three playbooks below are for an Expo React Native app. Each keeps notes in `.scratchpad/<skill>/`
  and a decision record in `docs/app/`.
  - **`server-api-setup`**: server state with Supabase, Zod and TanStack Query. One feature module for each
    resource (`schema.ts`, `api.ts`, `queries.ts`, `mutations.ts`); records `docs/app/server-state.md`.
  - **`client-state-setup`**: client state with Zustand. It classifies state first and makes stores only
    for drafts across routes, shared UI state and preferences; records `docs/app/client-state.md`.
  - **`ota-playbook`**: EAS Build and EAS Update setup, release procedures, and server-side minimum-version
    enforcement (HTTP 426); records `docs/app/release.md`. It asks before any command that reaches users.
