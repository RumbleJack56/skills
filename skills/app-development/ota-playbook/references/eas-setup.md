# EAS setup

Confirm each command with `eas <command> --help`. The EAS CLI changes frequently.

## Contents

1. Install
2. Runtime version policy
3. `eas.json`
4. Environment values and promotion
5. How a binary applies an update
6. Optional: update prompt in the app
7. Optional: code signing
8. Sources

## 1. Install

```bash
npx expo install expo-updates expo-application
eas update:configure
```

`eas update:configure` adds `updates.url` and a `runtimeVersion` to the app config, and channels to
`eas.json`. Read the diff. Then set the values below.

## 2. Runtime version policy

```json
{
  "expo": {
    "version": "1.5.0",
    "runtimeVersion": { "policy": "appVersion" },
    "updates": { "url": "https://u.expo.dev/<project-id>" }
  }
}
```

| Policy | Runtime version | Good | Bad |
|---|---|---|---|
| `appVersion` | The `version` field, for example `1.5.0` | Easy to read. It agrees with `min_version`. | A native change with no version increase sends an incompatible update. |
| `fingerprint` | A hash of the native project | An incompatible update is almost not possible. | The value is a hash. A small native change makes a new runtime. |
| `nativeVersion` | `version` and build number | One runtime for each build | Each build needs its own updates. |
| A fixed string | What you write | Full control | You must change it by hand. |

Default: `appVersion`, with this rule and this guard.

- **Rule:** each native change increases `version`.
- **Guard:** CI compares the fingerprint of the commit with the fingerprint of the production build. If
  they are different and `version` is the same, CI fails. See `eas fingerprint:compare --help`.

Use `fingerprint` if the team changes native code frequently or does not have the CI guard.

The binary and the update must be made with the same policy. A change of policy needs a new binary.

## 3. `eas.json`

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "staging",
      "environment": "preview"
    },
    "production": {
      "channel": "production",
      "environment": "production",
      "autoIncrement": true
    }
  }
}
```

- The channel is put in the binary at build time. A production binary reads only the production channel.
- `autoIncrement` increases the build number (`versionCode`, `buildNumber`). It does not change `version`.
- `appVersionSource: "remote"` keeps the build number on EAS. The `version` field stays in the app config.
- Each channel points to a branch with the same name by default. Keep that.

## 4. Environment values and promotion

`EXPO_PUBLIC_*` values are put into the bundle when the update is exported. `eas update --environment
<name>` selects which values. A republished update keeps its values. Thus the promotion model depends on
the backends.

**Model A: staging uses the production backend.** The staging channel is a release candidate channel.

```bash
eas update --channel staging --environment production --message "<what changed>"
# QA on a staging binary
eas update:republish --group <update-group-id> --destination-channel production
```

- The update that QA tested is the update that production gets.
- The staging binary must also use production values. Set `"environment": "production"` in the `preview`
  profile.
- QA uses test accounts on the production backend.

**Model B: staging has a different backend.** A staging update contains staging URLs. Do not republish it
to production.

```bash
eas update --channel staging --environment preview --message "<what changed>"
# QA on a staging binary, then from the same commit:
eas update --channel production --environment production --rollout-percentage 10 --message "<same>"
```

- The production update is a new export from the same commit. It is not the same artifact.
- The rollout percentage is the safety that the promotion does not give.
- CI must publish from a tagged commit, not from a work tree with local changes.

Never mix the models. Write the selected model in the runbook.

## 5. How a binary applies an update

With the default configuration (`checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`):

1. Cold start: the app starts with the newest update that is on the device.
2. The app downloads a newer update in the background.
3. The next cold start uses that update.

Thus most users get a fix on the second start after the publish. Do not expect immediate adoption.

If an update fails at start, `expo-updates` goes back to the previous good update or to the update in the
binary. `Updates.isEmergencyLaunch` is then `true`. Report it to the error reporter.

## 6. Optional: update prompt in the app

Use this only for an app that stays open for a long time.

```tsx
import * as Updates from 'expo-updates';

const { isUpdatePending } = Updates.useUpdates();
// show a "Restart to update" button; on press:
await Updates.reloadAsync();
```

- Do not reload with no user action. The user can lose a draft.
- These APIs do not work in a development build or in Expo Go.
- Send `Updates.updateId`, `Updates.channel` and `Updates.runtimeVersion` to the error reporter as tags.

## 7. Optional: code signing

Code signing makes the binary refuse an update that does not have a valid signature. Add it if the threat
model includes a compromised update server or account. The private key stays out of the repository and
out of the binary. See the Expo code signing guide.

## 8. Sources

- EAS Update, get started: https://docs.expo.dev/eas-update/getting-started/
- Runtime versions: https://docs.expo.dev/eas-update/runtime-versions/
- Runtime version policies: https://docs.expo.dev/versions/latest/sdk/updates/
- Deployment patterns: https://docs.expo.dev/eas-update/deployment-patterns/
- Environment variables with EAS Update: https://docs.expo.dev/eas-update/environment-variables/
- `eas.json` reference: https://docs.expo.dev/eas/json/
- Code signing: https://docs.expo.dev/eas-update/code-signing/
