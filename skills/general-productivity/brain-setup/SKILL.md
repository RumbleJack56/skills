---
name: brain-setup
description: "Set up the user's second brain: one folder that is an Obsidian vault, a Claude Code directory and a private git repo, with the inbox, projects, daily, routines and knowledge-base layout, short slash commands, hooks and a project link. Use when the user wants to set up, start, repair or move their second brain, link a project repo to it, or says /setup or /link. Inspects first, shows the plan and runs one confirmed step at a time. Never overwrites existing files."
---

# Brain setup

Creates the brain and connects project repos to it. Same style as a careful installer: inspect, show the plan, run one confirmed step at a time. Every step is idempotent. Conventions: `brain-notes`. Engine: `"${CLAUDE_PLUGIN_ROOT}/bin/brain"` (`brain`).

## 1. Preflight (report only)

Check `node` ≥ 18, `rg` (ripgrep), GNU `sed`, `git`. Obsidian is optional. For each missing tool give an install hint; never install silently.
If the target folder exists and is not empty, list what is there and ask before touching anything.

## 2. Short interview (one question at a time, defaults in brackets)

Brain path [`~/brain`] · time zone [system] · day starts at [04:00] · default energy [med] · run `git init` [yes] · sync mechanism [decided in Phase 0.5: see `docs/second-brain/`].

## 3. Create (`brain init <path>`)

Creates `inbox/ notes/ kb/{people,things,systems,playbooks}/ projects/ daily/ routines/ templates/`, `today.md`, `reminders.md`, `index.md`, `log.md`, `CLAUDE.md`, `AGENTS.md`, `.gitignore`, a minimal `.obsidian/`, and `.brain/{config.json,journal.jsonl}`. It never overwrites an existing file and prints what it skipped.
Git: `git init` only. **Refuse to add a public remote**: a remote is allowed only if the user confirms it is private, and it is then recorded in `config.json` (`allowed_remotes`). A pre-push hook rejects every other remote.

## 4. Commands and hooks

- Copy `assets/commands/*.md` to `<brain>/.claude/commands/` (short names such as `/next`). Show the list first. Skip files that already exist.
- Hooks in `<brain>/.claude/settings.json` (show a diff, apply on yes): `SessionStart` runs `brain hook start` (flush leftover live tasks, counts, at most one title). `SessionEnd` runs `brain flush` (fail open). `UserPromptSubmit` runs `brain hook prompt` (logs the prompt to `.brain/prompts/<date>.log`, never blocks). Hook output is counts plus at most one 80-character title.
- Permissions: allow only the engine subcommands each skill needs. No blanket `brain *`.

## 5. Link a project (`/link <project> <repo>`)

`brain link <project> <repo-path>`: creates `projects/<p>/` from the templates if absent, the symlink `<repo>/.brain -> <brain>/projects/<p>`, and adds `.brain` to `<repo>/.git/info/exclude` (not the committed `.gitignore`). It also adds the brain's project folder to the repo's `.claude/settings.local.json` `permissions.additionalDirectories`, because Claude Code refuses to read through a symlink to outside the repo without it. Do not rely on an `@.brain/CLAUDE.md` import; it did not load in testing. Instead the repo's `CLAUDE.local.md` says: "Start by running `brain brief` and read `.brain/tasks.now.md`."

## 6. Optional: phone notification

Offer the OS timer for `brain due --notify` (cron or systemd user timer, every 15–30 minutes, at most 3 notifications a day, generic text). Show the exact line first; install only on yes.

## 7. Verify

Run `brain lint`, `brain morning` and a test capture in the new brain. Show the results. Record what was done in `log.md`.

## Rules

- Never create a brain inside a repo that has a public remote.
- Never move or delete the user's existing notes. Import is a separate, confirmed step.
- Obsidian community plugins are listed for the user to install; do not automate Obsidian's UI.
