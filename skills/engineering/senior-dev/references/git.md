# Git: commits, pull requests and releases

Git is the safety net. A commit is a save point, a branch is a sandbox, and the history is documentation.
Small, atomic changes are easy to review and easy to revert.

## Before the first commit

- Commit only when the user asks. On the default branch, make a branch first.
- Read the project rules (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`). Their rules for messages, branch
  names, sign-off and attribution (for example, no AI co-author trailer) win over every default here.
- Match the history. Run `git log --oneline -15` and `git branch -a`, and copy the style that you see. Use
  conventional prefixes (`feat:`, `fix:`) only if the repo uses them, or if the repo has no history yet.
- Branch names: copy the repo pattern. With no pattern, use `feature/<short-name>`, `fix/<short-name>`,
  `chore/<short-name>` or `refactor/<short-name>`.

## Hygiene before each commit

```bash
git status --short
git diff --staged
git diff --staged | grep -inE 'password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY'
```

- Read the staged diff. Make sure that it holds only this change.
- Look at each secret match. A real secret never goes in a commit. Tell the user if one is already in the
  history, because removing it later rewrites history.
- Run the project's own checks. Find them in `package.json` scripts, `Makefile`, `justfile`,
  `pyproject.toml` or the CI workflow. Do not assume `npm test`.
- Never commit build output, `.env` files, keys or dependency folders (`node_modules/`, `.venv/`). Commit
  lockfiles and migrations when the project does.
- If a hook fails, fix the cause. Never skip hooks (`--no-verify`) unless the user asks.

## Atomic commits

- One logical change per commit. The build and the tests pass at each commit.
- Keep these in separate commits: a refactor and a behavior change, formatting and logic, a dependency
  bump and a feature. A small rename can stay with the feature that needs it.
- Size: about 100 lines is easy to review, about 300 is acceptable for one change, about 1000 must be split.
- Message: the subject says what, in the imperative, in about 72 characters or fewer. The body says why,
  and gives what the diff cannot show: the alternative you rejected, the linked issue, the risk.

```text
Good:
fix: resolve DATA_DIR with pathlib

A trailing slash in APP_DATA produced data//uploads, and cleanup
skipped those files. Existing files in the doubled path are not moved.

Bad:
update config.py
```

### Split a messy working tree

1. Run `git status --short` and `git diff --stat`. Group the files by concern.
2. Stage one group by path: `git add <paths>`. Commit it. Repeat.
3. One file holds two concerns? Save its diff (`git diff <file> > .scratchpad/senior-dev/part.patch`),
   delete the hunks of the other concern from the patch, then `git apply --cached` the patch.
4. Run the checks at each commit if the groups depend on each other.

## Pull requests

- One concern per PR. Over about 1000 lines: split it into a stack or a sequence of PRs.
- The body uses the same shape as the report in `SKILL.md`:

```text
<what changed and why, 1 to 3 lines>
Tested: <commands and results>
Skipped: <what is not in this PR>. Risk: <blast radius, migration, rollout>.
```

- Never force-push a branch that other people use. On your own branch, use `--force-with-lease`.
- Pushing and opening a PR are outward-facing. Do them only when the user asks.

## Debugging with history

```bash
git bisect start && git bisect bad && git bisect good <sha>
git bisect run <test command>        # finds the first bad commit
git log -S '<symbol>' --oneline      # commits that added or removed a string
git log -L :<function>:<file>        # history of one function
git blame -w <file>                  # last change to each line, ignoring whitespace
```

## Releases

Only for code that something else depends on: a package, an API, an app, a plugin.

- **Semantic versioning.** `MAJOR.MINOR.PATCH`. Breaking change: major. Additive change: minor. Fix:
  patch. A behavior change that consumers relied on is breaking, whatever the size of the diff. If you are
  not sure, treat it as breaking. Before 1.0, follow the project's practice.
- **One source of truth.** Bump the version where the project keeps it, with its release procedure (a
  release doc, a script). The tag, the version file and the changelog must agree.
- **Tag.** `git tag -a vX.Y.Z -m "Release X.Y.Z"`. Push the tag only when the user asks.
- **Changelog.** If the project keeps one, add the entry in the same change, newest first, grouped as
  Added, Changed, Fixed, Deprecated, Removed, Security, and written for user impact. A breaking change gets
  a migration note. If the project has no changelog, do not make one unless the user asks.
