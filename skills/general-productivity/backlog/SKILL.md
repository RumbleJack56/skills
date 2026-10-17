---
name: backlog
description: "Manage tasks that were planned for today but not done, and the overall backlog of the second brain, with no guilt. Use when the user asks about the backlog, what keeps slipping, a task has slipped three times, or says /backlog, or when daily-review reports a task at slips 3. Shows at most 8 lines and offers one decision per stuck task: shrink, split, move later, or drop."
---

# Backlog

The backlog is every open task not on today's plan, plus tasks planned for today and not done. Conventions: `brain-notes`. Engine: `"${CLAUDE_PLUGIN_ROOT}/bin/brain"` (`brain`).

## Rules the engine applies

- At day rollover an unfinished planned task returns to the pool with `slips::` +1 and a stale bonus in its score. It is not kept on today's plan.
- Tasks due within 2 days are never aged out. They stay in the deadline lane.
- Cap: 12 open tasks per project. Overflow goes to a split proposal.

## `/backlog`

`brain backlog` prints at most 8 lines: counts per project, the 3 oldest tasks, the slip distribution. Never print the whole list. End with one `**Next:**`.

## At `slips::3`

Ask **one** question per task, once:

1. Shrink it to a 5-minute step (`brain task add` the smaller task; the old one stays as the parent if still needed).
2. Split it into smaller tasks.
3. Move `start::` later (`brain snooze <key#hash> --until <date>`).
4. Drop it: `brain task drop <key#hash>`. Dropping is allowed; deleting is valid.

Apply the user's choice, say what changed and how to undo. Then record the question as asked: `brain task set <key#hash> asked=<slips>`. The engine does not list that task again until `slips::6`.

## Weekly

The weekly review shows the backlog count and the 3 oldest tasks. Nothing else.

## Rules

- No guilt wording. Never say "overdue" about a slipped task; say `slipped (N)`.
- Never drop a task without the user's yes.
