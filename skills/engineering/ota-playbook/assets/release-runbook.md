# Release runbook

Updated: <YYYY-MM-DD>. Expo SDK <version>. EAS CLI <version>.

## Configuration

| Item | Value |
|---|---|
| Runtime version policy | `appVersion` |
| Channels | `development`, `staging`, `production` |
| Promotion model | A: staging uses the production backend, promote the same update |
| Enforcement | Startup gate and Data API pre-request function (426) |
| Policy table | `public.app_platform_config` |

## Compatibility matrix

| App version | Runtime version | Server supports it | Status |
|---|---|---|---|
| 1.4.x | 1.4.0 | Yes | Supported (`min_version`) |
| 1.5.x | 1.5.0 | Yes | Current (`latest_version`) |

## Build or update?

A change needs a build if it touches: a package with native code, the Expo SDK, a permission, a config
plugin, the app icon or name, or the `expo-updates` configuration. All other changes are an update.

## OTA release

- [ ] The change has no native part
- [ ] `version` is the same as the production binary
- [ ] Type check, lint, tests
- [ ] `npx expo export --platform all`
- [ ] `eas update --channel staging --environment production --message "<msg>"`
- [ ] QA on a staging binary (open it two times)
- [ ] `eas update:republish --group <id> --destination-channel production`
- [ ] Error rate checked for the new update ID

## Native release

- [ ] `version` increased
- [ ] Type check, lint, tests
- [ ] `eas build --profile production --platform all`
- [ ] Binaries tested on devices
- [ ] `eas submit --profile production --platform all`
- [ ] Released in the stores
- [ ] `latest_version` set
- [ ] Matrix in this document updated

## Rollback

- [ ] `eas update:rollback`, type: <published update | embedded update>
- [ ] Previous update confirmed on a production binary
- [ ] Cause recorded below

## Minimum-version change

- [ ] Replacement version available in each store
- [ ] Users below the new minimum: <count>
- [ ] `min_version` changed for each platform
- [ ] 426 count checked
- [ ] Matrix in this document updated

## Breaking server change

- [ ] Expand: new schema added, old schema kept
- [ ] Release: app that uses the new schema shipped
- [ ] Adopt: adoption at <target>
- [ ] Enforce: `min_version` raised (if a binary is necessary)
- [ ] Contract: old schema removed

## Release log

| Date | Type | Version or update ID | Note |
|---|---|---|---|
| | | | |
