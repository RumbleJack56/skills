# VPS: <host>

Set up with the `setup-vps` skill. Last updated: YYYY-MM-DD. **No secrets in this file.**

## Box

| | |
|---|---|
| Address | `<ip or alias>` |
| OS | `<PRETTY_NAME>` |
| SSH port | `<port>` |
| SELinux | `<enforcing/permissive/none>` |
| Root SSH login | `<allowed / disabled>` |
| Password SSH login | `<allowed / disabled>` |

## Users

| User | Sudo | Groups | Key source |
|---|---|---|---|
| `alice` | yes | deploy, shared | `<where the key came from, e.g. "pasted", "github">` |

`deploy` is the container service user (no login shell, linger on). It runs rootless Podman and every
container.

## Shared directories

| Directory | Group | Mode | Default ACL |
|---|---|---|---|
| `/srv` | deploy | 2770 | `g:deploy:rwx` |
| `/shared` | shared | 2770 | `g:shared:rwx` |

## Network

- Firewall (`<firewalld/ufw>`): `<ssh port>`, 80 and 443 are open; everything else is closed.
- fail2ban: `sshd` jail enabled.
- Unprivileged ports start at 80 (`/etc/sysctl.d/90-unprivileged-ports.conf`).

## Reverse proxy

`<not installed>`, or Traefik v3 in `/srv/services/traefik`, run by `deploy`, with Let's Encrypt (HTTP
challenge) and ACME email `<email>`.

To put an app behind it: join the external `proxy` network, set `restart: always`, and add the labels
`traefik.enable=true`, `traefik.http.routers.<app>.rule=Host(\`<domain>\`)`,
`traefik.http.routers.<app>.entrypoints=websecure`, `traefik.http.routers.<app>.tls.certresolver=le` and
`traefik.http.services.<app>.loadbalancer.server.port=<port>`. Deploy it as `deploy`.

## History

- YYYY-MM-DD: initial setup (<steps run>, <steps skipped>)
