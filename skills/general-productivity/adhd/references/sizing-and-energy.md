# Sizing and energy

## Sizes

| Tag | Time | Example |
|---|---|---|
| T (tiny) | ≤ 5 min | Reply to one email, rename a file, send a calendar invite |
| S (small) | ≈ 15 min | File documents, review a short PR, book an appointment |
| M (medium) | ≈ 25 min (one sprint) | Write an outline, fix a well-understood bug |
| L (large) | ≈ 50 min | Deep work: design a feature, draft a section |

Break anything bigger than L down before it goes into a plan. "Do taxes" is a project, not a task.

## Energy

| Level | Best for |
|---|---|
| high | Creative work, complex problems, anything new or ambiguous |
| med | Meetings, routine tasks, reviewing, follow-ups |
| low | Email, filing, admin, tidying, tasks that are purely mechanical |

Tag a task by what it *needs*, not by how important it is. Important tasks can be low energy.

## A good step

- **Starts with a verb:** "Download statements", not "Statements".
- **Has a visible finish line:** you can tell when it's done without judging quality.
- **Can be done in one go:** it doesn't wait on anyone else. Write waiting items as "Ask X for Y".
- **The first step is almost impossible to fail:** "Open the tax folder" counts.

## Example: "Do taxes"

```
## Taxes 2025
- [ ] Open last year's return and the tax folder · T · low
- [ ] List which forms are needed (W-2, 1099s, receipts) · S · med
- [ ] Download 2025 bank statements · S · low
- [ ] Download 1099s from brokerage · S · low
- [ ] Gather charitable-donation receipts into one folder · S · low
- [ ] Enter income into tax software · M · med
- [ ] Enter deductions · M · high
- [ ] Review and submit · M · high
```

## Example: "Refactor the auth module" (a code project)

The breakdown stops at the plan. It never starts the refactor.

```
## Auth refactor
- [ ] Open auth/ and list the files it touches · T · low
- [ ] Write down in 3 lines what's painful about it now · S · med
- [ ] Find the tests that cover login and session · S · med
- [ ] Sketch the target structure (just file names) · M · high
- [ ] Move session handling into its own module · L · high
```
