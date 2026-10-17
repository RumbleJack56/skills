---
name: project-sync
description: "Keep a second-brain project and its code repo in step: write the objectives, status and handoff files, change a project's state, link a repo, and wrap up a finished project. Use when the user starts, pauses, resumes or finishes a project, asks for a status or handoff note, says what a project is for, works inside a repo that has a .brain link, or says /project, /link. Project chats read tasks.now.md and the brief first and may add tasks to their own project."
---

# Project sync

Real project files live in the brain at `projects/<p>/`. A repo reaches them through `.brain/`. Conventions: `brain-notes`. Engine: `"${CLAUDE_PLUGIN_ROOT}/bin/brain"` (`brain`).

## In a project chat (a repo with `.brain/`)

1. Run `brain brief <project>` and `brain now show`. Read nothing else from `.brain/` unless needed; use `brain find` then `brain get`.
2. Work on the repo's code as the user asks. This skill only keeps the notes.
3. A new task that belongs to this project: `brain task add <project> "<title>" [flags]`. Never edit other projects.
4. A finished task: `brain done <key#hash>` (see `task-graph`).
5. Before the chat ends (or on `/wrap`): update `status.md` (where it stands now) and `handoff.md` (what the next session needs). Edit those two files directly, then run `brain reindex`.

## Files and who writes them

| File | Written by | Holds |
|---|---|---|
| `objectives.md` | the hub chat (with the user) | outcome, due date, state, one `> ` line per item |
| `tasks.md` | engine commands only | the task graph |
| `tasks.now.md` | engine commands | live tasks of the current chat; flushed at session end |
| `status.md`, `handoff.md` | the project chat | current state, next-session notes |
| `decisions.md` | the project chat | dated decisions and reasons |

Every `##` item starts with a `> ` line that names the concrete things inside it (that line is the search key). Keep items short; split any item over about 400 tokens.

## States

`active`, `paused` (needs `--start` date), `done`. Change with `brain project state <p> active|paused|done [--start DATE]`. A paused project is hidden from planning until its start date.

## Link a repo

`brain link <project> <repo>` (see `brain-setup`, step 5). It is idempotent.

## Finish a project

1. Confirm all open tasks are done or dropped (`brain plan all`).
2. `brain project archive <p>` moves it to `projects/_done/<p>/`.
3. Offer `refine` on `handoff.md` and `decisions.md` to draft lessons. Ask once.

## Rules

- The repo's own `.gitignore` is not touched. `.brain` is excluded through `.git/info/exclude`.
- Never put brain content into the repo's commits.
- A stalled project (no change for 14 days) is surfaced once a week by `daily-review`: continue, pause or done.
