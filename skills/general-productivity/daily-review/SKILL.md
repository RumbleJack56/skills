---
name: daily-review
description: "Run the second brain's day rhythm: the morning review (routines, due reminders, inbox count, today's plan), the evening wrap (flush live tasks, record wins, roll unfinished work back with no guilt) and the weekly review. Use when the user says good morning, morning, check-in, wrap up, end of day, weekly review, or /morning, /wrap, /restart. Also use at the first message of a new day in a brain folder. Short replies, at most 3 priorities, one Next action."
---

# Daily review

Conventions: `brain-notes`. Engine: the `brain` command (installed by `brain-setup`). Never do the tasks.

## Morning (`/morning`)

`brain morning` does the mechanical part and prints it. It runs once per day safely (re-running changes nothing):

1. Rolls the previous day over (`today.md` to `daily/`), flushes any `tasks.now.md` left by a session that died, and counts slips.
2. Spawns today's routines into `today.md`. Missed occurrences collapse into one.
3. Lists reminders that are due or older, first.
4. Counts the inbox (by tag, not folder).
5. Runs `plan today`.

Reply: due reminders (max 3, rest as a count), inbox count, the plan (max 3), routine checklist on its own line, one `**Next:**`.
Default is quick. Offer inbox triage (`route`) only if the inbox has items due and energy is not low. Ask for the day's one win ("What is one win today?") and store it with `brain today win "<text>"`.

## Wrap (`/wrap`)

1. `brain flush`: done tasks in `tasks.now.md` become done in `tasks.md` and wins in `today.md`; urgent wins are marked; unfinished tasks planned for today go back with `slips +1`; others return as they were.
2. Reply with the wins first. Then at most one question: a task that just hit `slips::3` (shrink, split, move `start::`, or drop). Never list what was not done.
3. Optional: ask what to carry to tomorrow's first step.

## Restart (`/restart`, or the morning after 3 or more days away)

`brain restart` prints at most 8 lines: inbox count with review dates spread over days (max 5 a day), old reminders as one count (hard ones like meds and rent stay listed), collapsed routines, slipped-task count. Never list what was missed. End with one `**Next:**`.

## Weekly (`/weekly`)

`brain weekly`: wins of the week, backlog count with the 3 oldest tasks, projects untouched for 14 days (one question each: continue, pause, done), drafts waiting for confirmation, inbox trend. Max 15 lines.

## Rules

- No guilt wording. A missed day is a replan.
- Streak only when growing.
- Replies stay short. Detail is in the files.
