---
name: ota-playbook
description: "Sets up and runs releases for an Expo React Native app: EAS Update, runtime version, channels, rollouts, rollbacks and a server-enforced minimum app version (HTTP 426). Use for OTA updates, expo-updates, build-or-update decisions, hotfixes, forced updates, release planning, or breaking backend changes that affect old app versions."
---

# OTA Playbook

This skill sets up delivery for an Expo React Native app and gives the procedures to release safely.

The skill packages patterns and decisions. It is not a tutorial. EAS CLI flags change between versions,
thus confirm each command with `eas <command> --help` before you give it to the user.

## The model

Three systems. Keep them apart.

| System | Delivers | Controlled by |
|---|---|---|
| EAS Build | The binary: native code, Expo SDK, permissions, native configuration | App stores |
| EAS Update | The update: JavaScript and assets for a compatible binary | Channels |
| Version policy | The decision: which binaries the server supports | Server data |

```text
binary --runtimeVersion--> compatible update --app version--> version policy --> API and database
```

If a release breaks one link of this chain, the release is not valid.

## Definitions

| Term | Definition |
|---|---|
| Binary | A native build that a store installs. |
| Update | A JavaScript and asset bundle that EAS Update delivers. |
| Runtime version | The string that tells which updates a binary can run. They must be equal. |
| Channel | The name that a binary uses to request updates. It is set at build time. |
| Branch | A list of updates. A channel points to a branch. |
| Update group | One publish. It has one ID and one update for each platform. |
| `min_version` | The oldest app version that the server supports. |
| `latest_version` | The newest app version that is available in the store. |
| Enforcement | A server refusal (HTTP 426) of a binary below `min_version`. |

## Where things live

The skills of this user share a three-directory convention at the project root.

| Directory | Committed? | Role in this skill |
|---|---|---|
| `.scratchpad/` | No (gitignored) | **Work area.** `.scratchpad/ota-playbook/facts.md` holds the discovery notes. |
| `docs/` | Yes | **Record.** `docs/app/release.md` holds the runbook and the compatibility matrix. |
| `.mynotes/` | No (gitignored) | Not used. |

Ideas move up the chain as they mature: `.scratchpad/` -> `.mynotes/` -> `docs/`.

Before you write to `.scratchpad/`, run `git check-ignore -q .scratchpad/`. If the directory is not
ignored, add `.scratchpad/` and `.mynotes/` to `.gitignore` and tell the user.

Application source code and configuration (`app.json`, `eas.json`, `lib/`) are the work product.

## Safety rules

1. **Ask before each command that other people can see.** `eas build`, `eas submit`, `eas update`, a
   rollback, and a change of `min_version` affect real users. Show the command, then wait for a "yes".
2. **Never publish to the production channel as a test.** Use the staging channel.
3. **Never raise `min_version` before the replacement binary is available in the store.** If you do, users
   are locked out with no way to update.
4. **Never put a secret in the app.** `EXPO_PUBLIC_*` values, the app config and the bundle are public.
5. **Have a rollback path before the first production update.** Do one rollback on staging to prove it.

## Build or update?

| Change | Delivery |
|---|---|
| JavaScript, TypeScript, styles, images, fonts loaded by JavaScript | Update |
| New or upgraded package that has native code | Build |
| Expo SDK or React Native upgrade | Build |
| Permission, entitlement, `Info.plist`, `AndroidManifest.xml` | Build |
| Config plugin, app icon, splash screen, app name, scheme | Build |
| `expo-updates` configuration (`runtimeVersion`, `updates.*`, channel) | Build |

If you are not sure, the change needs a build. A feature flag or an update cannot add a native module to a
binary that does not contain it.

## Workflow

### 1. Discover

Read the project. Write the facts to `.scratchpad/ota-playbook/facts.md`.

- Expo SDK version. `expo-updates` and `expo-application` installed or not.
- `app.json` or `app.config.*`: `version`, `runtimeVersion`, `updates`.
- `eas.json`: build profiles, channels, `autoIncrement`, `appVersionSource`.
- The backend: direct Supabase access, a custom API, or the two together.
- Environments: does staging use the same backend as production?
- CI: which checks and which EAS commands run there.

### 2. Decide

Ask the user these four questions in one message. Give the default.

| Decision | Default | Alternative |
|---|---|---|
| Runtime version policy | `appVersion` with a fingerprint check in CI | `fingerprint` |
| Channels | `development`, `staging`, `production` | One channel for each release version |
| Promotion | Model A: staging uses the production backend, promote the same update | Model B: publish again from the same commit |
| Enforcement | Startup gate and server 426 | Startup gate only (tell the user this is not enforcement) |

Read [references/eas-setup.md](references/eas-setup.md) for the reasons and the trade-offs.

### 3. Configure EAS

Follow [references/eas-setup.md](references/eas-setup.md): `expo-updates`, the runtime version, `eas.json`
profiles and channels. This step changes native configuration, thus a new binary is necessary.

### 4. Version policy and enforcement

Follow [references/version-enforcement.md](references/version-enforcement.md):

1. The policy table on the server.
2. The version headers on each request.
3. The server check that returns 426.
4. One central 426 handler in the client.
5. The startup gate and the force-update screen.

### 5. Runbook

Write `docs/app/release.md` from [assets/release-runbook.md](assets/release-runbook.md). Fill in the real
channel names, commands and matrix. Remove the procedures that the project does not use.

### 6. Verify

1. `npx expo export --platform all` completes.
2. A staging binary receives a staging update.
3. A rollback on staging returns the previous update.
4. With `min_version` above the test binary on a test backend, the API returns 426 and the force-update
   screen shows.
5. Tell the user which of these checks you did not do, and why.

## Operate

For a release request, find the type and follow the procedure in
[references/release-procedures.md](references/release-procedures.md).

| Request | Procedure |
|---|---|
| "Ship this fix" and the change is JavaScript only | OTA release |
| The change needs a build | Native release |
| "The update is bad" | Rollback |
| "Force users to update" | Minimum-version change |
| A breaking schema or API change | Expand, then contract |

## Composition

This skill owns delivery and compatibility only. It works alone. If the sibling skills are in use, these
are the joins:

| Other concern | Join |
|---|---|
| Server state (`server-api-setup`) | The Supabase client sends the version headers and has the 426 handler. The version policy is a query with a long stale time. The gate is above the auth provider. |
| Client state (`client-state-setup`) | An update that changes a persisted store must increase the store `version` and have a `migrate`. A rollback runs old code on new data. |

## Decisions (do not change these silently)

- **`min_version` and `latest_version` are independent.** The minimum is a compatibility decision. It is
  not "the newest release".
- **The client check is for the user. The server check is the contract.** A client-only check is not
  enforcement. Never tell the user that it is.
- **Supported binaries must work with the current server.** Remove a column or an endpoint only after
  `min_version` excludes each binary that reads it.
- **Roll back, do not roll forward, if the previous update was good.** A rollback is faster and has no new
  risk.
- **No release management code in the app.** The app has a gate, a handler and a screen. The procedures are
  in the runbook.
