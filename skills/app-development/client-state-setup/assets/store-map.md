# Client state

Updated: <YYYY-MM-DD>. Stack: Zustand <version>, storage: <engine>.

## State inventory

Row numbers are from the classification table of the `client-state-setup` skill.

| State | Row | Owner |
|---|---|---|
| Appliance list | 1 | Server cache |
| Selected job tab | 3 | Route param |
| Add-appliance draft | 7 | `applianceDraft` store |
| Theme | 9 | `preferences` store |

## Stores

| Store | File | Data fields | Actions | Scope | Persisted fields | Version |
|---|---|---|---|---|---|---|
| applianceDraft | `features/appliances/store.ts` | `locationId`, `barcode`, `name` | `flowStarted`, `locationSelected`, `barcodeScanned`, `nameChanged` | user | none | n/a |
| preferences | `lib/stores/preferences.ts` | `theme`, `onboardingSeen` | `themeSelected`, `onboardingCompleted` | device | all data | 1 |

## Flows

| Flow | Routes | Draft store | Reset at |
|---|---|---|---|
| Add appliance | `appliances/new`, `select-location`, `scan-barcode` | applianceDraft | start, mutation success, sign-out |

## Joins with server state

| Store value | Query key that takes it |
|---|---|
| none | |

## Decisions

- <decision and reason>
