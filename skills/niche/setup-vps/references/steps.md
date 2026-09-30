# Steps: what each one does and how

These are **guidelines**. Adapt package names, groups and service names to what the preflight step found in
`facts.md`. Every step must be idempotent: check first, then change.

Step names match the functions in `assets/setup-skeleton.sh`. They run in this order:

| # | Step | Needs confirmation because |
|---|---|---|
| 1 | `preflight` | Read-only, but confirms we're root on the right box |
| 2 | `packages` | Installs software |
| 3 | `deploy_user` | Creates the `deploy` and `shared` groups and the `deploy` service user |
| 4 | `users` | Creates human users and sets group membership and sudo |
| 5 | `keys` | Writes authorized_keys |
| 6 | *(passwords)* | Not in the script; see below |
| 7 | `shared_dirs` | Changes ownership and permissions of /srv and /shared |
| 8 | `firewall` | **Can lock the user out** |
| 9 | `fail2ban` | Can ban the user's own IP after failed logins |
| 10 | `podman_deploy` | Changes sysctl and linger |
| 11 | `traefik` | Opens 80/443 to the internet (only if wanted) |
| 12 | `verify` | Read-only |
| 13 | `ssh_harden` | **Can lock the user out**, so it's optional and always last |

## 1. preflight

Check `[ "$(id -u)" = 0 ]`. Print `/etc/os-release` (`ID`, `ID_LIKE`, `VERSION_ID`), `getenforce` if it
exists, `systemctl --version | head -1` and the SSH port. On Ubuntu 22.10+, sshd may be socket-activated
(`ssh.socket`), so confirm the port with `ss -tlnp | grep -w sshd` as well as `sshd -T | grep '^port '`.

## 2. packages

| Family | Install |
|---|---|
| Fedora | `dnf install -y podman podman-compose acl firewalld fail2ban` |
| RHEL/Alma/Rocky | `dnf install -y epel-release` first (on RHEL itself, enable CRB and install the EPEL rpm), then the same list as Fedora |
| Debian/Ubuntu | `apt-get update && apt-get install -y podman podman-compose uidmap dbus-user-session acl ufw fail2ban python3-systemd` |

Anything else: work out the equivalents. Rootless Podman needs `newuidmap`/`newgidmap` (the `uidmap` or
`shadow` package) and a user D-Bus session.

## 3. deploy_user

```bash
getent group deploy >/dev/null || groupadd deploy
getent group shared >/dev/null || groupadd shared
id deploy &>/dev/null || useradd -m -g deploy -s /usr/sbin/nologin -c "Container service user" deploy
grep -q '^deploy:' /etc/subuid || echo "deploy has no subuid range"   # then add one that doesn't overlap
grep -q '^deploy:' /etc/subgid || echo "deploy has no subgid range"   # usermod --add-subuids/--add-subgids
```

Use a regular user, not `--system`, so useradd assigns subuid and subgid ranges. If a `deploy` user already
exists but isn't in this shape (for example it has a login shell), report it and ask. Don't change it silently.

## 4. users

For each user, `id "$u" &>/dev/null || useradd -m -s /bin/bash "$u"`, then
`usermod -aG deploy,shared "$u"` (only the groups the user asked for). Sudo users also get
`usermod -aG "$ADMIN_GROUP" "$u"`.

- `ADMIN_GROUP` is `wheel` on the RHEL family and Arch, and `sudo` on Debian and Ubuntu. Check that the
  group is enabled with `grep -rE '^%(wheel|sudo)' /etc/sudoers /etc/sudoers.d/`.
- If a user is listed as non-sudo but is already in the admin group, **ask** before running
  `gpasswd -d "$u" "$ADMIN_GROUP"`.
- Never delete users. If the user wants that, it's a separate, explicit request.

## 5. keys

For each user and each key (the keys are embedded in the script; they're public):

```bash
home=$(getent passwd "$u" | cut -d: -f6); grp=$(id -gn "$u")
install -d -m 700 -o "$u" -g "$grp" "$home/.ssh"
touch "$home/.ssh/authorized_keys"
grep -qxF "$key" "$home/.ssh/authorized_keys" || printf '%s\n' "$key" >> "$home/.ssh/authorized_keys"
chown "$u:$grp" "$home/.ssh/authorized_keys"; chmod 600 "$home/.ssh/authorized_keys"
command -v restorecon >/dev/null && restorecon -R "$home/.ssh"
```

Check each key before embedding it: `ssh-keygen -lf <(echo "$key")` must succeed.

## 6. passwords (outside the script)

Run these locally. None of them prints a password:

```bash
f=.scratchpad/setup-vps/<host>/passwords.txt
git check-ignore -q "$f"                                   # must succeed in a git repo
awk -F: 'NF<2 || $1=="" || $2=="" {bad=1} END{exit bad}' "$f" && cut -d: -f1 "$f"   # checks the format, lists usernames only
ssh root@<host> chpasswd < "$f"
```

If the user gave another format (such as YAML or CSV), convert it with a pipe straight into `chpasswd`,
never into a new file or the chat.

## 7. shared_dirs

For each `dir:group` pair (the defaults are `/srv:deploy` and `/shared:shared`):

```bash
mkdir -p "$dir"
chgrp "$grp" "$dir"
chmod 2770 "$dir"
setfacl -m g:"$grp":rwx "$dir"
setfacl -d -m u::rwx,g::rwx,g:"$grp":rwx,o::--- "$dir"
```

The default ACL makes new files and folders group-writable whatever each user's umask is. Files still
only become executable if their creator asks for that.

If the directory already has contents, **ask** before applying the change recursively (`chgrp -R`, `g+s` on
subdirectories, `setfacl -R -m` and `-R -d -m` on directories). Warn that `2770` on `/srv` hides it from
any system service that used it before (such as a stock web server).

## 8. firewall

Re-read `SSH_PORT` just before this step and state it to the user.

- **firewalld:** `systemctl enable --now firewalld`, then
  `firewall-cmd --permanent --add-port=$SSH_PORT/tcp --add-service=http --add-service=https` and
  `firewall-cmd --reload`. List the other services allowed in the default zone (such as `cockpit` or
  `dhcpv6-client`) and **ask** before removing any of them.
- **ufw:** `ufw allow $SSH_PORT/tcp`, `ufw allow 80/tcp`, `ufw allow 443/tcp`,
  `ufw default deny incoming`, `ufw default allow outgoing`, then `ufw --force enable`. The allow rules
  must come before `enable`.

Remind the user that the provider's own cloud firewall or security group also has to allow these ports.

## 9. fail2ban

Write `/etc/fail2ban/jail.d/sshd-setup-vps.local`:

```ini
[sshd]
enabled = true
port = <SSH_PORT>
backend = systemd
```

Then run `systemctl enable --now fail2ban` and `fail2ban-client status sshd`. Tell the user how to unban
themselves: `fail2ban-client set sshd unbanip <ip>`.

## 10. podman_deploy

```bash
echo 'net.ipv4.ip_unprivileged_port_start=80' > /etc/sysctl.d/90-unprivileged-ports.conf
sysctl -p /etc/sysctl.d/90-unprivileged-ports.conf
loginctl enable-linger deploy
uid=$(id -u deploy)
for i in $(seq 1 10); do [ -d /run/user/$uid ] && break; sleep 1; done
as_deploy systemctl --user enable --now podman.socket podman-restart.service
as_deploy podman network exists proxy || as_deploy podman network create proxy
```

`as_deploy` is defined in the skeleton. It uses `runuser` with `XDG_RUNTIME_DIR` and the D-Bus address and
runs from `/`, because `deploy` can't read `/root`. With systemd 248 or newer,
`systemctl --user -M deploy@ …` also works.

## 11. traefik

1. **DNS pre-check (locally, before this step).** For each domain, `dig +short A <d>` and
   `dig +short AAAA <d>` must include the VPS's public IP. Warn about any mismatch and ask whether to
   continue.
2. Create `/srv/services/traefik/{dynamic,letsencrypt}` with owner `deploy:deploy`.
3. Write `compose.yaml` and `.env` from `assets/traefik/` using quoted heredocs (`<<'EOF'`) in the step.
   Fill in `ACME_EMAIL` and set `PODMAN_SOCK=/run/user/<uid>/podman/podman.sock`, then run
   `chown deploy:deploy` on both files.
4. **acme.json must be exactly 600.** The default ACL from step 7 would make it group-readable, and
   Traefik refuses to use it then:
   ```bash
   touch letsencrypt/acme.json
   setfacl -b letsencrypt letsencrypt/acme.json
   chmod 700 letsencrypt
   chmod 600 letsencrypt/acme.json
   chown -R deploy:deploy letsencrypt
   ```
5. `as_deploy sh -c 'cd /srv/services/traefik && podman compose up -d'`, then check
   `as_deploy podman logs --tail 20 traefik`.

Apps join the external `proxy` network, use Traefik labels with `tls.certresolver=le`, and set
`restart: always`. Deploying apps is outside this skill, but record this in `docs/vps/<host>.md`.

## 12. verify

Print the following. Change nothing.

- `id <user>` for everyone
- `sudo -l -U <user>` for sudo users
- `stat -c '%A %U:%G %n'` and `getfacl -p` on the shared dirs
- `firewall-cmd --list-all` or `ufw status verbose`
- `fail2ban-client status sshd`
- `loginctl show-user deploy -p Linger`
- `as_deploy podman ps`
- `curl -sI http://localhost`, which should return a 3xx redirect to https when Traefik is running

## 13. ssh_harden (optional, last)

Do this only after the user confirms that a **new terminal** can log in with a key as a sudo user and that
`sudo true` works there.

```bash
grep -qE '^\s*Include\s+/etc/ssh/sshd_config\.d/' /etc/ssh/sshd_config || echo "no Include: edit sshd_config itself"
cat > /etc/ssh/sshd_config.d/01-setup-vps.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t && { systemctl reload sshd 2>/dev/null || systemctl reload ssh; }
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) '
```

The filename starts with `01-` because sshd uses the **first** value it finds, and cloud images often ship
`50-cloud-init.conf` with `PasswordAuthentication yes`.

**After hardening, root can't SSH in.** Future runs go through a sudo user, and `bash -s` can't be used
because sudo needs the TTY for its password prompt:

```bash
scp .scratchpad/setup-vps/<host>/setup.sh <user>@<host>:/tmp/setup-vps.sh
ssh -t <user>@<host> 'sudo bash /tmp/setup-vps.sh <step>; rm -f /tmp/setup-vps.sh'
```

Piping passwords with `chpasswd` over stdin doesn't work after hardening, because sudo needs stdin for its
own prompt. So apply every password **before** hardening. Later password changes are done interactively by
a sudo user on the box: `sudo passwd <user>`.
