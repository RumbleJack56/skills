# Second brain

Skills in `skills/general-productivity/` plus the engine in `bin/`. This page is the short design record.

## Model

One folder, the **brain**, is an Obsidian vault, a Claude Code directory and a private git repo.
FLAP tags (the tag is the identity, the folder is a convenience): `fleeting`, `literature` (`literature/unfiled`
until processed), `atomic`, `project`.

- You and Claude write the fleeting layer together (notes, dumps, reminders).
- Claude writes everything downstream (literature, atomic, knowledge base) only from those notes. Derived notes
  carry `source` and `status: draft` until you confirm with one word.
- Knowledge base: `kb/{people,things,systems,playbooks}`. A playbook has `type: playbook | method | guide`.
  Areas such as health and finances are knowledge notes plus routines, not projects.
- Real projects live in `brain/projects/<p>/`. A project repo has a symlink `.brain -> brain/projects/<p>`
  that is listed in `.git/info/exclude`, and `brain link` adds the target to the repo's
  `permissions.additionalDirectories`, because Claude Code refuses to read through a symlink out of the repo
  otherwise (tested, Claude Code 2.1.302). The `@.brain/CLAUDE.md` import did not load in testing; the repo's
  `CLAUDE.local.md` tells the model to run `brain brief` instead.
- Isolation is a guideline, not a boundary. There are no deny rules.

## Engine (`bin/brain`)

Zero-dependency Node 18+. Needs `rg` and GNU `sed`. Deterministic and offline. Every write goes through a lock,
an atomic rename and `.brain/journal.jsonl`; `brain undo [n]` reverses a command. Every read prints coverage and
fails closed: a task line that cannot be read is shown as "needs fixing" and blocks its dependents, never
dropped and never treated as done.

Task line: `- [ ] Verb the thing [after:: a1] [energy:: low|med|high] [effort:: xs|s|m|l] [due:: DATE] [value:: 0-3] ^id`.
Efforts are 10, 45, 180, 480 minutes. `done` and `snooze` take `key#hash` and refuse a changed line.

Planner: ready tasks, back-scheduled due dates, per-project top K, beam search inside the minutes budget.
Deadline lane for tasks due within 7 days. Tasks overdue by more than 7 days show as `slipped (N)`.

Day rhythm: `morning` (rollover, routines, reminders, inbox count, plan), `wrap`/`flush` (live tasks to wins,
planned and undone tasks back with `slips +1`), `restart` (at most 8 lines), `backlog` (`slips::3` asks once),
`weekly`.

## Tests

```bash
node --test tests/engine/*.test.mjs
```

`regress.test.mjs` holds the 29 defects found in the design review (R01 to R29). `features.test.mjs` covers
flush, rollover, backlog, routing, drafts, hooks and linking.

## Retired

The `adhd` skill was removed after its rules moved into `overwhelm`, `plan` and `capture`; see
[`adhd-lessons.md`](adhd-lessons.md).
