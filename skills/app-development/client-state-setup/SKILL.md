---
name: client-state-setup
description: "Sets up client state in an Expo React Native app with Zustand. It decides where each piece of state lives, then makes small stores for cross-route drafts, shared UI state and persisted preferences. Use for Zustand, stores, global or UI state, multi-step forms, values passed back between screens, persisted settings, or store re-render loops."
---

# Client State Setup

This skill makes the client state layer of an Expo React Native app with Zustand. The most important
output is a decision: which state goes in a store, and which state does not.

The skill packages patterns and decisions. It is not a tutorial. Read the project first, then adapt the
patterns to the versions that the project uses.

## Definitions

| Term | Definition |
|---|---|
| Client state | Data that only the device owns. No server copy exists. |
| Server state | Data that the server owns. It is not client state, and it does not go in a store. |
| Store | One Zustand store. It holds one domain of client state. |
| Draft | Client state for a flow that goes across more than one route. |
| Preference | Client state that stays on the device after a restart. |
| Action | A function in the store that records an event and changes the state. |
| Selector | A function that reads one value from the store. |

## Where things live

The skills of this user share a three-directory convention at the project root.

| Directory | Committed? | Role in this skill |
|---|---|---|
| `.scratchpad/` | No (gitignored) | **Work area.** `.scratchpad/client-state-setup/inventory.md` holds the state inventory. |
| `docs/` | Yes | **Record.** `docs/app/client-state.md` holds the store map. |
| `.mynotes/` | No (gitignored) | Not used. |

Ideas move up the chain as they mature: `.scratchpad/` -> `.mynotes/` -> `docs/`.

Before you write to `.scratchpad/`, run `git check-ignore -q .scratchpad/`. If the directory is not
ignored, add `.scratchpad/` and `.mynotes/` to `.gitignore` and tell the user.

Application source code is the work product. It goes in the app tree (`features/`, `lib/`).

## The classification table

Use the first row that is true. Only the rows marked **Zustand** get a store.

| # | Question | Owner |
|---|---|---|
| 1 | Does the server own the data? | The server cache (TanStack Query). Not a store. |
| 2 | Is it the session or the user identity? | The auth provider. Not a store. |
| 3 | Must a deep link or the back button restore it? | Expo Router params. |
| 4 | Does only one component use it? | `useState` or `useReducer`. |
| 5 | Is it the fields of a form on one screen? | Local state or a form library. |
| 6 | Is it a secret? | `expo-secure-store`. Not a store. |
| 7 | Does a flow across more than one route build it? | **Zustand** draft store. |
| 8 | Do distant screens read or change it? | **Zustand** store. |
| 9 | Must it stay on the device after a restart? | **Zustand** store with `persist`. |

If no row is true, use `useState`. A store that is not necessary is one more thing to reset and to test.

## Rules

Each rule has a reason. If a rule does not fit the project, tell the user before you change it.

1. **No server data in a store.** A store holds the ID or the filter. The server cache holds the data. A
   copy in the store goes out of date.
2. **Small stores.** One store for each domain. Stores do not import each other.
3. **Export hooks, not the store.** A component cannot subscribe to the full store by accident.
4. **Atomic selectors.** One selector returns one value. In Zustand 5, a selector that returns a new object
   or array on each call causes a render loop. If you must return an object, use `useShallow`.
5. **Actions are events.** Write `locationSelected(id)`, not `setLocationId(id)`. The logic stays in the
   store.
6. **Actions are apart from data.** Put them in one `actions` object. That object never changes, thus one
   hook returns all actions with no render cost.
7. **Do not store derived values.** Calculate them in a selector or in the component.
8. **Persist only what is necessary.** Use `partialize`. Never persist `actions`, tokens or server data.
9. **Each store has a reset.** A user-scoped store resets on sign-out. A draft resets when its flow starts
   and when its flow ends.

## Workflow

### 1. Discover

Read the project. Write the notes to `.scratchpad/client-state-setup/inventory.md`.

- The version of `zustand`, and the stores, Contexts or Redux slices that exist.
- Each flow that goes across more than one route (a wizard, a picker screen, a scanner screen).
- Each value that the app stores on the device (`AsyncStorage`, MMKV, `localStorage`, `expo-secure-store`).
- Each `useState` or Context that holds server data. Report these. They are for the server state layer.

### 2. Classify

List each piece of state. Give each one a row number from the classification table. Show the list to the
user before you write code. This list is the design.

### 3. Design the stores

For each store, write these items in the store map:

- The name and the feature that owns it.
- The data fields and their initial values.
- The actions, with event names.
- Scope: `user` (reset on sign-out) or `device` (stays).
- Persisted fields, if any, and the schema version.

### 4. Write the stores

Read [references/store-patterns.md](references/store-patterns.md). Put a feature store in
`features/<feature>/store.ts`. Put an app-wide store in `lib/stores/<name>.ts`.

### 5. Persistence

Only for row 9. Read [references/persistence.md](references/persistence.md). Select the storage, set
`partialize` and `version`, and decide if a hydration gate is necessary.

### 6. Sign-out reset

Register each user-scoped store in one reset registry. Call `resetAllStores()` on `SIGNED_OUT`. If the app
has a server cache, clear that cache in the same place.

### 7. Record and verify

1. Write `docs/app/client-state.md` from [assets/store-map.md](assets/store-map.md).
2. Run the type check and the lint of the project.
3. Search for store hooks that are called with no selector. The result must be empty.
4. Do the flow on a device or simulator: start it, go back, complete it, sign out. Make sure that no old
   draft data shows. If you cannot run the app, tell the user that this check is not done.

## Composition

This skill owns client state only. It works alone. If the sibling skills are in use, these are the joins:

| Other concern | Join |
|---|---|
| Server state (`server-api-setup`) | A store value is an input of a query key: `useQuery(jobQueries.list(userId, useJobFilter()))`. A draft is validated with the Zod input schema of the mutation at submit. The draft resets in the `onSuccess` of the mutation call. |
| Delivery (`ota-playbook`) | An OTA update can change the shape of a persisted store. Increase `version` and write `migrate` in the same update. |

## Decisions (do not change these silently)

- **Many small stores, not one store with slices.** Small stores reset and persist independently. Use
  slices only if one domain becomes too large for one file.
- **No middleware by default.** Add `persist` only for preferences. Add `immer` only for deeply nested
  updates. Add `devtools` only if the user asks.
- **One storage engine.** Use the storage that the project has. In a new Expo project, use the synchronous
  `localStorage` from `expo-sqlite`, because hydration is then synchronous.
- **A draft store is not persisted.** A draft that must survive a restart is a product decision. Ask the
  user.
