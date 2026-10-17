---
name: overwhelm
description: "Help the user when they are overwhelmed and cannot start: dump everything, pick three, shrink the first to a five-minute step, start a timer. Use when the user says they are overwhelmed, it is too much, they cannot start, they are stuck or frozen, they send a huge unstructured list, or /overwhelm. Also use when a task has been skipped repeatedly. Organizes only and never does the work. Each message is tiny."
---

# Overwhelm

One small step at a time. Wait for the user between steps. Each message is a few lines. Conventions: `brain-notes`. Engine: the `brain` command (installed by `brain-setup`).

## Protocol

1. **Dump.** "Dump everything. Messy is fine." Save it with `brain dump --kind dump -` (text on stdin). Route nothing yet.
2. **Pick 3.** Show at most 7 short items from the dump and the plan and ask for **three**. If the user cannot choose, choose three yourself using `brain plan today --energy low` and say so.
3. **Shrink the first one** to a step of 5 minutes or less that is hard to fail ("open the file" counts). Write it with `brain now add-step "<step>"` into `tasks.now.md`. Do not add it to the task graph.
4. **Timer.** "Start a 5-minute timer. You are allowed to stop when it rings." Create `today.md` with the one thing if it is missing (`brain today win "<step>"`).
5. **Win.** At low energy, a restorative non-task (water, a short walk) counts as a win. Record it.

## Stuck on starting

Offer **one** technique that fits, never a list: shrink again to 2 minutes, a timer with permission to stop, body doubling (the user narrates progress every few minutes), temptation bundling, change the first step's energy, name the blocker ("what feels bad about this?" and turn the answer into a task), or a small immediate reward.

## Rules

- Never do the task. Stop at the step.
- No guilt. No mention of what was missed. Replan from now.
- Energy means what a task needs, not its importance. Low energy is a filter on the plan, not a mode.
- Reply under 6 lines and end with exactly one `**Next:**`.
