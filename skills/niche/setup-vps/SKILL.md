---
name: setup-vps
description: "Sets up a fresh or existing VPS/Linux server over SSH as root. It creates users (with or without sudo), SSH keys and passwords, a `deploy` service user and group, shared group directories (/srv, /shared) with setgid and default ACLs, a firewall (SSH/80/443), fail2ban, rootless Podman, and optionally a Traefik reverse proxy with Let's Encrypt. It writes an idempotent step-by-step script to .scratchpad/, can run it step by step over SSH with confirmation, adapts to the distro from /etc/os-release, and records the result in docs/vps/. Use this skill whenever the user wants to set up, provision, bootstrap or harden a VPS, server, droplet, VM or box, add users or sudo users to a server, set up shared or deploy directories, install Podman, or put Traefik or a reverse proxy with HTTPS in front of containers, even if they don't say VPS."
---

# Setup VPS

This skill turns a VPS the user has root SSH access to into a multi-user box. Each person gets their own
account. The `deploy` and `shared` groups own shared directories. One `deploy` service user runs every
container with rootless Podman, and Traefik can optionally sit in front of the containers with automatic
HTTPS.

It always **generates a script first**. It runs the script on the server only when the user asks, and then
one step at a time with confirmation before each step. Commands in this skill are guidelines, not a fixed
recipe: read what the server actually is and adapt.

## Where things live

The user's skills share a three-directory convention at the project root (the git root, or the current
directory outside a repo):

| Directory | Committed? | This skill's role |
|---|---|---|
| `.scratchpad/` | No (gitignored) | **Working area.** `.scratchpad/setup-vps/<host>/` holds `facts.md`, `setup.sh` and `passwords.txt`. |
| `docs/` | Yes | **Record.** `docs/vps/<host>.md` says what the box has. **Never put secrets here.** |
| `.mynotes/` | No (gitignored) | Not used. |

Ideas move up the chain as they mature: `.scratchpad/` → `.mynotes/` → `docs/`.

`<host>` is a short, filesystem-safe name for the server: an SSH alias, the hostname or the IP address.

**Before writing anything,** make sure `.scratchpad/` is gitignored. In a git repo, check with
`git check-ignore -q .scratchpad/`. If it isn't ignored, append `.scratchpad/` and `.mynotes/` to
`.gitignore` and say so. `passwords.txt` sits in there, so a leak into a commit is the worst failure this
skill can have.

## Non-negotiable safety rules

1. **Don't lock the user out.** Before any firewall or sshd change, confirm that key-based SSH works for
   the connection being used. Open the *actual* SSH port, read from `sshd -T | grep '^port '`, not an
   assumed 22. Keep the current root session alive while testing.
2. **Passwords never go in the script,** or in command arguments, logs, chat or `docs/`. Apply them with
   `ssh root@<host> chpasswd < .scratchpad/setup-vps/<host>/passwords.txt` (stdin only). Never `cat`
   the file or echo it back.
3. **SSH hardening is optional and happens last.** Offer it every time but never assume it. Apply it only
   after the user confirms that a second terminal can log in with a key as a sudo user.
4. **Validate before reloading.** Run `sshd -t` before reloading sshd, and `visudo -cf` on any sudoers file.
5. **Confirm every step** before running it on the server. Show what the step will do, run it, show the
   result, then ask before the next one. Stop and diagnose on the first failure; never barrel on.
6. **Idempotent everywhere.** Every step checks state before it changes anything (user exists? already in
   group? line already present?), so re-running is always safe.

## Workflow

### 1. Access

Ask for the SSH target, e.g. `root@203.0.113.10` or an alias from `~/.ssh/config`. Test it with
`ssh -o BatchMode=yes <target> true`. If that fails, walk the user through
[references/ssh-setup.md](references/ssh-setup.md) and stop until it works.

Ask whether they want **script only** (they'll run it themselves) or **script + run it for me**. The answer
can change later.

### 2. Discover (read-only)

Over SSH, gather the facts and save them to `.scratchpad/setup-vps/<host>/facts.md`:

- `/etc/os-release`: the distro family, version, package manager, admin group (`wheel` on the RHEL family
  and Arch, `sudo` on Debian and Ubuntu), firewall tool (firewalld or ufw), whether EPEL is needed, and
  whether SELinux is enforcing (`getenforce`).
- The SSH port, `sshd -T` values for `permitrootlogin` and `passwordauthentication`, and the systemd version.
- **Existing state:** human users (UID ≥ 1000), the groups `deploy` and `shared`, `/srv` and `/shared`
  with their owners, modes and ACLs, Podman and compose versions, linger status, whether Traefik is
  running, and the firewall rules.
- The public IPv4 and IPv6 addresses (used for the DNS check).

If the box is already partly set up, say what's there. The run then becomes **incremental**: only the
missing pieces are planned, e.g. "add user X", "grant sudo to Y" or "add Traefik".

### 3. Clarify requirements

Ask in one compact message, and pre-fill anything discovery already answered:

1. **Users.** Which accounts should exist, and which of them get sudo?
2. **Keys.** How do we get each user's public key? It varies by user: pasted, a URL, a local file, and so
   on. Use whatever method the user gives. Don't guess.
3. **Passwords (sudo users).** Ask the user to create `.scratchpad/setup-vps/<host>/passwords.txt` with
   one `user:password` line per user. Accept any format they prefer, as long as it can be converted to
   `user:password` lines for `chpasswd`. Check that it exists and is gitignored, but don't read it aloud.
   A sudo user without a password can't use sudo; warn about this rather than going ahead silently.
4. **Shared directories.** The defaults are `/srv` (group `deploy`) and `/shared` (group `shared`). Ask
   them to confirm, and ask who belongs to which group (by default, everyone is in both).
5. **Reverse proxy?** If yes: the ACME email address, plus any domains to check now (optional).
6. **SSH hardening?** Disable root login and password authentication. Ask each time.

The firewall (SSH, 80, 443) and fail2ban are in scope by default, but still get confirmed step by step.
Automatic updates, hostname, timezone, swap, the Traefik dashboard and app deployment are **out of scope**.
Mention that if the user asks for them.

### 4. Generate

Write `.scratchpad/setup-vps/<host>/setup.sh`, starting from
[assets/setup-skeleton.sh](assets/setup-skeleton.sh). It's one bash script with one function per step and a
dispatcher, so a single step runs with:

```bash
ssh root@<host> 'bash -s -- <step>' < .scratchpad/setup-vps/<host>/setup.sh
```

Fill in the steps from [references/steps.md](references/steps.md), adapted to the facts in `facts.md`
(package names, admin group, firewall tool, SELinux, SSH service name). Public keys can be embedded in
the script; passwords can't. If Traefik is wanted, embed `compose.yaml` and `.env` in the `traefik` step
as quoted heredocs, using [assets/traefik/compose.yaml](assets/traefik/compose.yaml) and
[assets/traefik/env.example](assets/traefik/env.example) as templates.

Run `bash -n setup.sh` (and `shellcheck` if it's available). Then show the user the plan as a numbered list
of steps with one line per step, and point them to the script file.

### 5. Run (only if asked)

The step order is in `references/steps.md`: preflight → packages → deploy user and groups → users → keys →
passwords → shared directories → firewall → fail2ban → Podman for deploy → Traefik → verify → optional
SSH hardening.

For each step: say what it does in one or two lines, ask to proceed, run it, and show the key output.
Before the firewall step, restate the SSH port being kept open. For the passwords step, run the `chpasswd`
stdin command (it isn't part of the script). For the Traefik step, run the DNS pre-check first: every
domain should resolve to the VPS's public IP. If one doesn't, warn and ask whether to continue, because
issuing the certificate will fail until DNS is correct.

If the user chose script only, give them the per-step command above and the passwords command, then stop.

### 6. Verify and record

- The verify step checks each user's groups, `sudo -l -U <user>` for sudo users, directory modes and ACLs,
  `firewall-cmd --list-all` or `ufw status`, `fail2ban-client status sshd`, linger, `podman ps` as
  `deploy`, and `curl -sI http://localhost` for Traefik.
- Ask the user to open a **new terminal** and SSH in as one sudo user, then run `sudo true`. Wait for
  them to confirm that it works.
- Only after that, offer SSH hardening (if they said yes in step 3), and then run the verify step again.
- Write or update `docs/vps/<host>.md` from [assets/host-record.md](assets/host-record.md). It records
  the OS, users and sudo status, groups, directories, the service user, the firewall, fail2ban, Traefik
  status and the date. It contains no secrets and no private data beyond account names.
- Offer to delete `passwords.txt` (`shred -u` where available). Don't delete it without asking.
- If SSH was hardened, root can no longer log in. Later runs go through a sudo user (see the end of
  `references/steps.md`), and every password must already be applied.

End with a short summary: what was changed, what was skipped, and anything the user still needs to do,
such as pointing DNS records at the server.

## Key design decisions (don't silently change these)

- **One service user runs every container.** Rootless Podman is per-user: each user has their own socket,
  networks and containers. If each person ran their own stack, Traefik couldn't route to the others'
  containers. `deploy` is a regular (non-system) user, so it gets `/etc/subuid` ranges, with a
  `nologin` shell and linger enabled. Its primary group is `deploy`, and the humans who deploy are
  members of that group.
- **Root drives the rootless parts,** in a single pass with no "log in as someone else and continue". Use
  `runuser -u deploy -- env XDG_RUNTIME_DIR=/run/user/<uid> …` and `systemctl --user -M deploy@ …`. On
  systemd older than 248, use the `runuser` + `XDG_RUNTIME_DIR` form for `systemctl --user` as well.
- **Ports 80/443** come from `net.ipv4.ip_unprivileged_port_start=80` in `/etc/sysctl.d/`.
- **Reboots.** Containers use `restart: always` and the `deploy` user's `podman-restart.service` is
  enabled. Older Podman versions only restart containers with the `always` policy, so avoid
  `unless-stopped`.
- **Shared directories** use `chgrp` + `2770` (setgid) + default ACLs `g:<group>:rwx`, so files that any
  member creates stay writable by the whole group whatever their umask.
- **Nobody runs containers by hand as other users.** Human members of `deploy` edit files under `/srv`,
  and deployment automation (CI, webhooks) is out of scope.
