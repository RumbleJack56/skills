# RumbleJack56 Skills

Agent skills organized into **buckets**, one per use case, under [`skills/`](skills).

Each skill is a standard [`SKILL.md`](https://docs.claude.com/en/docs/claude-code/skills), so the repo works
with Claude Code's plugin system, the open [`skills` CLI](https://skills.sh) (`npx skills`), and any agent that
reads `SKILL.md` files.

## Catalog

<!-- catalog:start -->
| Bucket | Use case | Skills | Claude Code plugin |
|---|---|---|---|
| [`general-productivity`](skills/general-productivity) | Personal organization and planning: capture, prioritize and track what to do without losing focus | `adhd` | ✓ `/rumblejack-skills:…` |
| [`in-progress`](skills/in-progress) | Beta skills still being tested. Not shipped in the Claude Code plugin; install individually with npx skills | _none yet_ | npx only |
| [`niche`](skills/niche) | Specialized, opinionated setups for specific tools and environments | `setup-vps` | ✓ `/rumblejack-skills:…` |
<!-- catalog:end -->

## Install

Pick **one** route per machine. If you install both, every skill shows up twice.

### Claude Code plugin: every shipped bucket, one namespace

```text
/plugin marketplace add RumbleJack56/skills
/plugin install rumblejack-skills@rumblejack-skills
```

Skills are namespaced under the plugin, e.g. `/rumblejack-skills:adhd`. The plugin ships
every bucket marked ✓ above. Beta buckets such as `in-progress` are left out on purpose.

To enable it for a whole team, put this in the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "rumblejack-skills": { "source": { "source": "github", "repo": "RumbleJack56/skills" } }
  },
  "enabledPlugins": { "rumblejack-skills@rumblejack-skills": true }
}
```

### `npx skills`: pick by bucket or by skill (any agent)

```bash
# Interactive picker over every skill, including in-progress ones
npx skills add RumbleJack56/skills

# One bucket
npx skills add https://github.com/RumbleJack56/skills/tree/main/skills/<bucket>

# Specific skills
npx skills add RumbleJack56/skills --skill <skill-a> --skill <skill-b>
```

Add `--list` to preview, `-g` to install globally, or `-a claude-code` (or another agent) to choose the
target agent. Skills installed this way have no namespace (`/adhd`).

### Manual

Copy `skills/<bucket>/<skill>/` into `~/.claude/skills/` (personal) or `.claude/skills/` (project).

## Conventions for skills

Skills here only read and write three directories in the project they run in:
`.mynotes/` (gitignored, personal tracking), `.scratchpad/` (gitignored, active working memory) and `docs/`
(committed, formal documentation). See [AGENTS.md](AGENTS.md).

## Repository layout

```text
.claude-plugin/
  plugin.json                 # the one plugin: namespace, version; skills[] is generated
  marketplace.json            # lets `/plugin marketplace add` find it; plugins[] is generated
skills/
  buckets.json                # bucket descriptions + whether each ships in the plugin
  <bucket>/
    README.md                 # generated
    <skill>/
      SKILL.md                # frontmatter: name + description, then instructions
      ...                     # optional references/, assets/, scripts/
templates/skill/SKILL.md.tmpl # template used by new-skill
scripts/skills.mjs            # scaffolding, sync and validation (Node ≥18, no deps)
```

## Authoring

```bash
# New bucket (add --unshipped to keep it out of the Claude Code plugin)
node scripts/skills.mjs new-bucket web-dev "Building and shipping web apps"

# New skill in a bucket, then fill in the TODOs in its SKILL.md
node scripts/skills.mjs new-skill web-dev nextjs-routing "Use when adding or debugging Next.js App Router routes..."

# Promote a beta skill: move the folder from skills/in-progress/ to its bucket, then sync
node scripts/skills.mjs sync

# Check everything (CI runs this on every push and PR)
node scripts/skills.mjs validate
```

Rules the validator checks:

- Bucket and skill names are kebab-case, and skill names match their directory names.
- Every bucket folder is listed in `skills/buckets.json`.
- Skill names are unique across the whole repo, because every shipped skill shares one namespace and
  `npx skills --skill <name>` must be unambiguous.
- Each `SKILL.md` has a `description` of at most 1024 characters and no leftover `TODO`s.
- The generated files (`plugin.json` skills, `marketplace.json` plugins, bucket READMEs, this catalog)
  are up to date.

Bump `version` in `.claude-plugin/plugin.json` and run `sync` when you release changes, so Claude Code users
get the update.
