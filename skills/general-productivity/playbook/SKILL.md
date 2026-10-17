---
name: playbook
description: "Create, find and run the user's playbooks, methods and guides: repeatable processes they learnt or wrote down in the second brain. Use when the user asks how they do something, wants to turn what they just did into a repeatable process, wants a checklist from a playbook, or says /playbook. Playbooks live in kb/playbooks with type playbook, method or guide, and can become routines."
---

# Playbook

A playbook is a process the user can repeat. It is a kb note with `type: playbook | method | guide`. Conventions: `brain-notes`. Engine: `"${CLAUDE_PLUGIN_ROOT}/bin/brain"` (`brain`).

| Type | Use for |
|---|---|
| `playbook` | A procedure with steps in order and a finish line (release a build, set up a server) |
| `method` | A way of thinking or working (how to triage, how to review) |
| `guide` | Reference the user reads while doing something (a setup walk-through) |

## Find and run

1. `brain find <words>` then `brain get kb/playbooks/<file> <slug>`.
2. Show the steps as a short checklist (at most 8 lines). Do not do the steps; the user does them, or asks.
3. To track a run, add the steps as tasks to a project: `brain task add <project> "<step>" --effort xs`. Ask first.

## Create

1. From the user's account of what they did, or from their fleeting notes, write the steps as they said them. Use `refine` to store it: `brain note new --kind kb --kb playbooks --ptype playbook|method|guide --title "<title>" --source "[[note]]"` (body on stdin). It is a draft until the user confirms.
2. Each step starts with a verb and has a visible finish line. The first step is tiny.
3. Name what it needs (tools, people, access) in the first item.

## Promote to a routine

When the user does a playbook on a schedule, offer once: `brain routines add <slug> --schedule weekly:fri` and `brain routines item <slug> "<step>"`. A learnt process becomes a habit only with the user's yes.

## Rules

- Only the user's own steps. Do not invent steps, commands or links.
- Playbooks are knowledge, not projects.
