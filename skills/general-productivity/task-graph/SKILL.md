---
name: task-graph
description: "Add, break down and fix tasks in a second-brain project so the planner can use them. Use when the user wants to add a task to a project, break something big into tasks, set dependencies, due dates, energy or effort, mark something finished by name, or fix lint errors in tasks.md. Also use for /done and /snooze. Enforces the task line format and the granularity budget."
---

# Task graph

Keeps `projects/<p>/tasks.md` correct and small. Format: `brain-notes`. Engine: the `brain` command (installed by `brain-setup`).

## Adding and breaking down

1. Task text starts with a verb and has a visible finish line. The first task of a project is tiny.
2. Efforts are `xs` (10 min), `s` (45), `m` (180), `l` (480). Nothing below `xs`: merge it into a neighbour. Nothing above `l`: split it.
3. Order in the file is the default sequence. Add `after::` only for a real exception (needs another task, in another file).
4. A task that waits on a person gets `waiting:: <who>` and `check:: <date>`.
5. Add with `brain task add <project> "<title>" [--energy ..] [--effort ..] [--due ..] [--after ..] [--value ..]`. The engine assigns the id and keeps the file valid.
6. Steps inside a task are written only when the task is picked, and only into `tasks.now.md`. They never enter the graph.
7. More than 12 open tasks in one project: propose a split to a new project or move the overflow to a `later` section. Ask once.

## Marking and moving

- `/done <words>`: find the open task with `brain task find <words>` (it prints `key#hash`), then `brain done <key#hash>`.
  - Act (report mode) only when: the user clearly said it is finished, exactly one open task matches, and it is not `waiting::`. Reply `done: <title> (undo: /undo)`.
  - Ask first when several match, the user only hinted, or more than 3 tasks are named.
- `/snooze <words> <when>`: `brain snooze <key#hash> --until <date>`. This sets `start::`.
- Dropping a task (`[-]`) is allowed and needs the user's yes.

## Fixing

Run `brain lint`. Fix by editing through `brain task` commands, then `brain reindex`. Lint errors to expect:
unknown or looping `after::`, an effort of `xl` or an unknown value, bad dates, a duplicate id, a paused project
without `start`, a `waiting::` without `check::`, more than 12 open tasks. A task the engine cannot parse is shown as
"needs fixing" and blocks the tasks after it. Never delete it to make lint pass.

## Rules

- Never match a task by its title when writing. Use the `key#hash` from `brain task find` or the plan output.
- Do not add tasks the user did not ask for or that did not come from their notes.
