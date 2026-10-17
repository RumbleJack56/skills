---
name: routines
description: "Create and edit the recurring routines of the second brain: daily template items, weekday habits, weekly and monthly chores. Use when the user wants something to happen every day, every week or every month, wants to add or change a daily checklist item, move a routine, or asks what their routines are. Also use for /routine. Routines are templates that the morning review turns into today's checklist."
---

# Routines

A routine is a template in `routines/<slug>.md`. The morning review (`daily-review`) spawns today's instances. Conventions: `brain-notes`. Engine: `"${CLAUDE_PLUGIN_ROOT}/bin/brain"` (`brain`).

## Schedule grammar (strict)

`daily` · `weekdays` · `weekly:mon` or `weekly:mon,fri` (lowercase three-letter days) · `monthly:15` or `monthly:5,20` · `monthly:last`.
Anything else is a lint error shown in the morning review. `monthly:31` is not valid; use `monthly:last`.

## File shape

```markdown
---
type: routine
schedule: weekdays
---
- [ ] Take meds [energy:: low] [effort:: xs]
- [ ] Review the plan [energy:: low] [effort:: xs]
```

Item `due::` is relative (`[due:: +4d]`). Daily items fill the daily template.

## Steps

1. Create or change with `brain routines add <slug> --schedule <s>` and `brain routines item <slug> "<text>" [flags]`. List with `brain routines list`.
2. Run `brain lint` after any change and fix schedule errors.
3. Reply with the routine, its schedule and its next date.

## Behaviour to rely on

- Instances are spawned once per occurrence. Re-running the review changes nothing.
- Missed occurrences collapse into one instance labelled "collapsed from <date>".
- Instances are marked `[routine:: yes]` and never compete for the top 3 unless they have a `due::` (rent does).
- A learnt playbook can be promoted to a routine; ask the user first.

## Rules

- Areas (health, finances) are knowledge notes plus routines. Do not turn them into projects.
- Do not add routines the user did not ask for.
