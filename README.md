# RumbleJack56 Skills

Agent skills organized into **buckets**, one per use case. Each skill is a standard `SKILL.md`, so it works
with Claude Code, the [`skills` CLI](https://skills.sh) (`npx skills`), and any agent that reads `SKILL.md`
files.

## Catalog

<!-- catalog:start -->
| Bucket | Use case | Skills | Claude Code plugin |
|---|---|---|---|
| [`content`](skills/content) | Writing and reviewing content: short-form video scripts, hooks and social posts | `content-principles` | ✓ `/content:…` |
| [`engineering`](skills/engineering) | Engineering playbooks: a lazy senior-dev discipline for any code change, plus React Native with Expo (server state, client state, over-the-air release) | `client-state-setup`, `ota-playbook`, `senior-dev`, `server-api-setup` | ✓ `/engineering:…` |
| [`frontend`](skills/frontend) | Frontend design: art direction and anti-slop styling for websites and app screens | `design-taste-frontend` | ✓ `/frontend:…` |
| [`general-productivity`](skills/general-productivity) | Second brain for Claude Code and Obsidian (FLAP method): capture, route, plan the day, projects, routines, reminders, knowledge notes. Works from the plugin or npx skills; brain-setup installs the engine | `backlog`, `brain-notes`, `brain-setup`, `capture`, `daily-review`, `overwhelm`, `plan`, `playbook`, `project-sync`, `refine`, `reminders`, `route`, `routines`, `task-graph` | ✓ `/general-productivity:…` |
| [`in-progress`](skills/in-progress) | Beta skills still being tested. Not shipped in the Claude Code plugin; install individually with npx skills | _none yet_ | npx only |
| [`niche`](skills/niche) | Specialized, opinionated setups for specific tools and environments | `setup-vps` | ✓ `/niche:…` |
<!-- catalog:end -->

## Second brain (`general-productivity`)

A second brain for Claude Code and Obsidian, built on the FLAP method (fleeting, literature, atomic, project).
One folder is an Obsidian vault, a Claude Code directory and a private git repo. It works from the Claude Code
plugin or from `npx skills`: the engine ships inside the `brain-setup` skill. It needs Node 18 or newer,
`rg` (ripgrep) and GNU `sed`.

After installing, ask Claude to set up your brain (or run `/general-productivity:brain-setup`). Then work from
the brain folder. Read the [usage guide](docs/second-brain/usage.md).

## Install

Pick **one** route per machine. If you install both, every skill shows up twice. For the second brain, install the whole `general-productivity` bucket (the skills call each other).

### Claude Code plugins (one per bucket)

```text
/plugin marketplace add RumbleJack56/skills
/plugin install general-productivity@rumblejack-skills
/plugin install engineering@rumblejack-skills
/plugin install niche@rumblejack-skills
```

Install only the buckets you want. Skills are invoked as `/<bucket>:<skill>`. Beta buckets such as
`in-progress` are not in the plugin list.

To enable one for a whole team, put this in the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "rumblejack-skills": { "source": { "source": "github", "repo": "RumbleJack56/skills" } }
  },
  "enabledPlugins": { "general-productivity@rumblejack-skills": true }
}
```

### `npx skills` (by bucket or by skill, any agent)

```bash
# Interactive picker over every skill, including beta ones
npx skills add RumbleJack56/skills

# One bucket
npx skills add https://github.com/RumbleJack56/skills/tree/main/skills/<bucket>

# Specific skills
npx skills add RumbleJack56/skills --skill <skill-a> --skill <skill-b>
```

Add `--list` to preview, `-g` to install globally, or `-a claude-code` (or another agent) to choose the
target agent.

### Manual

Copy `skills/<bucket>/<skill>/` into `~/.claude/skills/` (personal) or `.claude/skills/` (project).

## Usage

Skills load automatically when your request matches what they do, so you can just describe what you need.
You can also call one directly:

| Installed via | Invoke as |
|---|---|
| Claude Code plugin | `/<bucket>:<skill>`, e.g. `/general-productivity:plan` |
| `npx skills` or manual | `/<skill>`, e.g. `/plan` |

Examples:

- **`overwhelm`, `plan`, `capture`** (second brain): "I'm overwhelmed, here's everything I need to do: …",
  "what should I work on next?", "need to call the dentist".
- **`senior-dev`**: "add a CSV export to the users page", "uploads land in the wrong folder, fix it", or
  `/engineering:senior-dev` before any code change.
- **`design-taste-frontend`**: "build a landing page for my bakery", "this page looks AI-made, make it look
  designed". Its scripts need Node 22+ and Chrome, Edge or Chromium.
- **`setup-vps`**: "set up my new VPS at 203.0.113.10 for alice (sudo) and bob, with Traefik in front".

The `engineering` and `niche` skills only read and write three folders in the project they run in (the second
brain works in its own brain folder):

| Folder | Git | Used for |
|---|---|---|
| `.scratchpad/` | ignored | Working files for the current task |
| `.mynotes/` | ignored | Personal tracking |
| `docs/` | committed | Finished documentation |

A skill makes sure `.scratchpad/` and `.mynotes/` are gitignored before writing to them.

## Acknowledgements

I'm thankful to [Matt Pocock](https://github.com/mattpocock), [coleam00](https://github.com/coleam00) and
claudecodehq for the inspiration behind several of these skills. These are of course tuned to how I prefer
to use them, but their implementations were a great support. I will continue to improve this.

`content/content-principles` is [Remy Gaskell](https://github.com/aiwithremy)'s
[content-principles](https://github.com/aiwithremy/content-principles) skill, included unchanged.

`frontend/design-taste-frontend` is [Leonxlnx](https://github.com/Leonxlnx)'s
[taste-skill](https://github.com/Leonxlnx/taste-skill) (tasteskill v2), included unchanged under its MIT licence.
