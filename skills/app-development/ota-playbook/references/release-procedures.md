# Release procedures

One procedure for each release type. Do the steps in sequence. Ask the user before each command that
changes a channel, a store listing or the version policy.

Confirm each command with `eas <command> --help`.

## Contents

1. OTA release
2. Native release
3. Rollout
4. Rollback
5. Minimum-version change
6. Expand, then contract
7. CI gates
8. Monitoring
9. Sources

## 1. OTA release

Precondition: the change has no native part (see "Build or update?" in `SKILL.md`).

1. Make sure that `version` and the runtime version are the same as the production binary.
2. Run the type check, the lint and the tests.
3. Run `npx expo export --platform all`. It must complete.
4. Publish to staging: `eas update --channel staging --environment <env> --message "<what changed>"`.
5. Open a staging binary two times. The second start has the update.
6. Do the QA.
7. Promote with the model of the project (see `eas-setup.md`, section 4).
8. Look at the error rate for the new update ID.
9. If the error rate increases, do the rollback procedure.

Persisted client data: if the update changes the shape of data on the device, it must contain a migration.

App store rules: an update can correct and improve the app. It must not change the primary purpose of the
app.

## 2. Native release

1. Increase `version` in the app config. The runtime version changes with it (`appVersion` policy).
2. Run the type check, the lint and the tests.
3. Build: `eas build --profile production --platform all`.
4. Test the binaries on devices. Make sure that each one reads the production channel.
5. Submit: `eas submit --profile production --platform all`.
6. Release in the stores. Use a phased release if the store has one.
7. When the binary is available to all users, set `latest_version` in the policy table.
8. Do not change `min_version` now. That is a different procedure.

After this release, two runtime versions are in use. A fix for the two needs one update for each runtime:
publish from the release branch of the old version and from the current branch.

## 3. Rollout

A rollout sends an update to a percentage of users.

```bash
eas update --channel production --environment production --rollout-percentage 10 --message "<msg>"
eas update:edit                       # change the percentage
eas update:revert-update-rollout      # stop and go back
```

- Only one rollout can be active on a branch.
- Complete (100) or revert the rollout before the next publish for the same runtime version.
- Suggested steps: 10, 50, 100. Wait at each step until the error data is sufficient to decide.
- Do not increase the percentage faster than you can see and reverse a failure.

## 4. Rollback

```bash
eas update:rollback
```

The command asks for the type:

| Type | Effect | Use when |
|---|---|---|
| To a published update | Publishes the previous update again | The previous update was good. |
| To the embedded update | The binary runs the update that it contains | No published update is good. |

- A rollback is a new publish. Users get it at the next start, then use it at the start after that.
- A publish after the rollback replaces the rollback.
- A rollback does not undo a server change, or data that the bad update wrote on the device.
- A failure in native code needs a new binary. An update cannot repair it.

## 5. Minimum-version change

This is a deployment. It can lock users out.

1. Make sure that the replacement version is available in each store for all users.
2. Count the active users below the new minimum. Tell the user the number.
3. Make sure that the server no longer needs to support the old binaries.
4. Change `min_version` for each platform in the policy table.
5. Look at the count of 426 responses. It must agree with the number from step 2.

For an emergency (a security problem or a binary that damages data), steps 1 and 4 are sufficient. Tell
the user the effect before you do it.

## 6. Expand, then contract

Use this for each server change that an old binary cannot read: a removed or renamed column, a changed
type, a changed RPC signature, a stricter constraint or policy.

| Step | Server | App | Policy |
|---|---|---|---|
| 1. Expand | Add the new column or RPC. Keep the old one. Keep the two in sync. | | |
| 2. Release | | Ship the app that uses the new one. | Set `latest_version` |
| 3. Adopt | | Wait until sufficient users have the new version. | |
| 4. Enforce | | | Raise `min_version` |
| 5. Contract | Remove the old column or RPC. | | |

- If the new app code is JavaScript only, step 2 is an OTA release for each supported runtime, and step 4
  is frequently not necessary. Wait until the update adoption is sufficient, then contract.
- A change that only adds (a nullable column, a new table) needs no sequence.
- The invariant: each binary at `min_version` or above works with the current server.

## 7. CI gates

| Trigger | Gates |
|---|---|
| Each pull request | Type check, lint, unit tests, `npx expo export` |
| OTA release | The pull request gates, fingerprint check, publish to staging |
| Native release | The OTA gates, native build, device tests, submit |
| Database migration | Migration on a test database, RLS tests, contract tests with the oldest supported app version |

The most important database test: the queries of the oldest supported binary work after the migration. A
test that only applies the migration is not sufficient.

## 8. Monitoring

Send these as tags to the error reporter and the analytics: app version, build number, platform, runtime
version, update ID, channel.

Watch after each release:

- The crash rate and the start failures for the new update ID.
- The update adoption.
- The count of 426 responses.
- The users in three groups: below the minimum, supported, latest.

## 9. Sources

- Rollouts: https://docs.expo.dev/eas-update/rollouts/
- Rollbacks: https://docs.expo.dev/eas-update/rollbacks/
- EAS CLI for updates: https://docs.expo.dev/eas-update/eas-cli/
- Deployment patterns: https://docs.expo.dev/eas-update/deployment-patterns/
- Submit to the stores: https://docs.expo.dev/submit/introduction/
