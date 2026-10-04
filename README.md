# RumbleJack56 Skills

Agent skills organized into **buckets**, one per use case. Each skill is a standard `SKILL.md`, so it works
with Claude Code, the [`skills` CLI](https://skills.sh) (`npx skills`), and any agent that reads `SKILL.md`
files.

## Catalog

<!-- catalog:start -->
| Bucket | Use case | Skills | Claude Code plugin |
|---|---|---|---|
| [`app-development`](skills/app-development) | React Native app development with Expo: server state, client state, and over-the-air release playbooks | `client-state-setup`, `ota-playbook`, `server-api-setup` | ✓ `/rumblejack-skills:…` |
| [`general-productivity`](skills/general-productivity) | Personal organization and planning: capture, prioritize and track what to do without losing focus | `adhd` | ✓ `/rumblejack-skills:…` |
| [`in-progress`](skills/in-progress) | Beta skills still being tested. Not shipped in the Claude Code plugin; install individually with npx skills | _none yet_ | npx only |
| [`niche`](skills/niche) | Specialized, opinionated setups for specific tools and environments | `setup-vps` | ✓ `/rumblejack-skills:…` |
<!-- catalog:end -->

## Install

Pick **one** route per machine. If you install both, every skill shows up twice.

### Claude Code plugin (every shipped bucket)

```text
/plugin marketplace add RumbleJack56/skills
/plugin install rumblejack-skills@rumblejack-skills
```

This installs every bucket marked ✓ above. Beta buckets such as `in-progress` are left out.

To enable it for a whole team, put this in the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "rumblejack-skills": { "source": { "source": "github", "repo": "RumbleJack56/skills" } }
  },
  "enabledPlugins": { "rumblejack-skills@rumblejack-skills": true }
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
| Claude Code plugin | `/rumblejack-skills:<skill>`, e.g. `/rumblejack-skills:adhd` |
| `npx skills` or manual | `/<skill>`, e.g. `/adhd` |

Examples:

- **`adhd`**: "I'm overwhelmed, here's everything I need to do: …", "what should I work on next?",
  "break this task down".
- **`setup-vps`**: "set up my new VPS at 203.0.113.10 for alice (sudo) and bob, with Traefik in front".

Skills only read and write three folders in the project they run in:

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
