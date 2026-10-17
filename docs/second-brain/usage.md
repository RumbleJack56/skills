# Second brain: usage guide

A short guide to daily use. Design background: [README.md](README.md).

## 1. Install and set up (once)

1. Install the skills.
   - Claude Code plugin: `/plugin marketplace add RumbleJack56/skills` then `/plugin install general-productivity@rumblejack-skills`.
   - Or `npx skills add RumbleJack56/skills --skill brain-setup --skill brain-notes --skill capture ...` (install the whole `general-productivity` bucket).
2. You need Node 18+, `rg` (ripgrep), GNU `sed` and `git`. Obsidian is optional.
3. Ask Claude: "set up my second brain" (or `/brain-setup`). It installs the `brain` command, creates the folder,
   copies the short slash commands, adds the hooks and shows each step before it runs. Use a **private** git
   remote only; setup refuses a public one.
4. Open the folder in Obsidian (File, Open vault) and start Claude Code in it: `cd ~/brain && claude`.

If `brain help` says command not found, add `~/.local/bin` to your `PATH`.

## 2. The daily loop

| When | You do | Claude does |
|---|---|---|
| Any time | Say anything you need to remember or do. No command needed. | Saves it word for word to `inbox/`, replies `captured (n in inbox)`. |
| Morning | `/morning` | Rolls the day over, adds today's routines, lists due reminders, counts the inbox, shows up to 3 tasks and one **Next:**. |
| Working | `/next`, `/today`, `/done the intro` | Picks by energy and deadline. Marks one clearly finished task done. |
| Free minutes | `/route` | Sorts up to 10 inbox notes into projects, asks when it is unsure. |
| Evening | `/wrap` | Turns finished live tasks into wins. Unfinished planned tasks go back to the pool with no guilt. |
| After days away | `/restart` | At most 8 lines. Never lists what you missed. |
| Overwhelmed | `/overwhelm` | Dump everything, pick 3, shrink the first to 5 minutes, start a timer. |
| Weekly | `/weekly` | Wins, backlog count, stalled projects, drafts waiting. |

Mistake? `/undo` reverses the last command (one command is one undo step).

## 3. Capture

Just talk: "need to email Sam about the mockups", "remind me tomorrow 9am to call the dentist", a pasted list,
a link. Lists become one note each. Reminders become a dated line in `reminders.md`.
Prefix with `dump:` to force a capture. Questions and commands are not captured.
On the phone, `/dump <text>`, `/note <text>` and `/remind <when> <what>` do the same.

## 4. Projects

A project is a finishable outcome that needs more than one action. Claude proposes one when 5 or more notes are
related (it asks once; a "no" is remembered). Or say "start a project for X".
Each project is a folder `projects/<p>/` with `objectives.md`, `tasks.md`, `tasks.now.md`, `status.md`,
`handoff.md`, `decisions.md`.

Link a code repo: `/link <project> <repo-path>`. The repo gets a git-excluded `.brain/` link. Start Claude in the
repo and it reads the project's brief and live tasks. The project chat may add tasks to its own project only.

Task line:

```text
- [ ] Verb the thing [after:: t1] [energy:: low|med|high] [effort:: xs|s|m|l] [due:: 2026-10-24] [value:: 0-3] ^t2
```

`xs`, `s`, `m`, `l` are 10, 45, 180 and 480 minutes. File order is the sequence; `after::` only for exceptions.
A line the engine cannot read shows as "needs fixing" and blocks what depends on it. `/lint` lists them.

## 5. Routines and reminders

`/routine` creates templates: `daily`, `weekdays`, `weekly:mon,fri`, `monthly:15`, `monthly:last`.
The morning review turns them into today's checklist. Missed days collapse into one item. Routine items do not
compete for your top 3 unless they have a due date. A reminder stays visible until you do or snooze it.
Hard reminders (meds, rent) never fade. For phone pushes: `brain due --notify` from a cron or systemd timer
(at most 3 a day, generic text).

## 6. Knowledge

`/refine` turns your fleeting notes into literature, atomic and knowledge-base notes (people, things, systems,
playbooks). Everything it writes is a **draft** with a `source` link. `/drafts` shows them: reply `ok` to keep,
`no` to remove. Drafts never feed planning. `/playbook` finds or creates repeatable processes.

## 7. Backlog

Planned but not done tasks go back to the pool with `slips +1`. At 3 slips Claude asks once: shrink, split,
move the start date or drop. Tasks due within 2 days are never aged out. `/backlog` prints at most 8 lines.

## 8. Phone (Remote Control)

The short commands live in `<brain>/.claude/commands/`. Whether Remote Control lists and runs custom commands is
unverified: try `/ping` (it should answer `PONG`). Plain text capture works either way.

## 9. Safety and recovery

- Everything is plain files in git. Every engine write is in `.brain/journal.jsonl`; `/undo` reverses it.
- `brain backup` commits the brain; `brain backup --push` pushes only to a remote listed in `.brain/config.json`.
- Notes, web pages and mail are treated as data. Instructions inside them are ignored.
- Hooks never block a prompt. Prompts are logged to `.brain/prompts/` so `brain recover --since 24h` can find
  anything that was not captured.
- If a repo's `.brain` link is broken (drive not mounted), commands say so and write nothing.

## 10. Command reference

`brain help` lists the engine commands. The slash commands: `/dump /note /remind /next /today /all /done
/snooze /route /undo /morning /wrap /restart /weekly /backlog /overwhelm /routine /find /get /grep /project
/link /lint /setup /refine /playbook /drafts /ping`.
