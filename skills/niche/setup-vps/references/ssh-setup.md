# Getting root SSH access

Goal: `ssh -o BatchMode=yes root@<ip> true` succeeds from the machine running the agent.

1. **Have a key.** Check for `~/.ssh/id_ed25519.pub`. If there isn't one:
   `ssh-keygen -t ed25519 -C "<you>@<machine>"`
2. **Get the key onto the server's root account.** Pick one:
   - Add the key in the provider's panel when creating the VPS (DigitalOcean, Hetzner, Vultr and others
     support this). This is the easiest option.
   - The provider emailed a root password: `ssh-copy-id root@<ip>` (it asks for that password once).
   - Web console only: paste the key into `/root/.ssh/authorized_keys`, then run
     `chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys`.
3. **Optional alias** in `~/.ssh/config`, so you can type `ssh myvps`:

   ```
   Host myvps
       HostName 203.0.113.10
       User root
       IdentityFile ~/.ssh/id_ed25519
   ```

4. **Test it:** `ssh -o BatchMode=yes myvps true` should exit silently. If it says "Permission denied",
   repeat step 2. If it times out, check the IP address and the provider's firewall or security group
   (port 22).

The first connection asks you to accept the host key. Do that once in a normal terminal before letting an
agent use `BatchMode`.
