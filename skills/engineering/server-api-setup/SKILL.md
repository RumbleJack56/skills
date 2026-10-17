---
name: server-api-setup
description: "Sets up server state in an Expo React Native app with Supabase, Zod and TanStack Query: feature modules (schema, api, queries, mutations), query keys, stale times, invalidation, Realtime and the auth session. Use for any data fetching, Supabase query or mutation, React Query, cache invalidation or server data validation work, or when a screen calls Supabase directly."
---

# Server API Setup

This skill makes the server state layer of an Expo React Native app. Supabase is the server. Zod validates
the data at the boundary. TanStack Query owns the cache and the fetch lifecycle.

The skill packages patterns and decisions. It is not a tutorial. Read the project first, then adapt the
patterns to the versions that the project uses.

## Definitions

| Term | Definition |
|---|---|
| Server state | Data that the server owns. The client holds a copy that can be out of date. |
| Resource | One type of server state, for example `appliances`. |
| Feature module | The folder `features/<resource>/`. It holds all code for one resource. |
| Boundary | A point where data enters or leaves the app. |
| Query key | The cache identity of a query. |
| Sync state | The freshness policy of a resource: stale time, realtime, mutation policy. |
| Invalidator | The rule that tells which query keys an event makes stale. |

## Where things live

The skills of this user share a three-directory convention at the project root.

| Directory | Committed? | Role in this skill |
|---|---|---|
| `.scratchpad/` | No (gitignored) | **Work area.** `.scratchpad/server-api-setup/facts.md` holds the discovery notes. |
| `docs/` | Yes | **Record.** `docs/app/server-state.md` holds the resource map. |
| `.mynotes/` | No (gitignored) | Not used. |

Ideas move up the chain as they mature: `.scratchpad/` -> `.mynotes/` -> `docs/`.

Before you write to `.scratchpad/`, run `git check-ignore -q .scratchpad/`. If the directory is not
ignored, add `.scratchpad/` and `.mynotes/` to `.gitignore` and tell the user.

Application source code is the work product. It goes in the app tree (`app/`, `features/`, `lib/`).

## Rules

Each rule has a reason. If a rule does not fit the project, tell the user before you change it.

1. **One owner.** TanStack Query owns all server data. Do not copy server data into `useState`, Context or
   a store. A second copy goes out of date.
2. **Imports go down.** `app/` -> `features/` -> `lib/`. A screen does not call Supabase directly.
3. **`api.ts` is plain TypeScript.** It does not import React, TanStack Query, the router or a store. Thus
   you can call it from a hook, a test or a script.
4. **Zod at boundaries only.** Parse each Supabase response. Parse each mutation input. Do not parse again
   inside the app.
5. **The key contains each input.** Each variable that changes the result is in the query key. The user ID
   is one of them, thus two users never share a cache entry.
6. **Mutations wait for the server.** After success, set the known entity with `setQueryData` and invalidate
   the lists. Optimistic updates are an exception that the user must approve.
7. **Realtime invalidates.** A realtime event marks queries stale. It does not write to the cache.
8. **RLS is the security boundary.** A route guard and a feature flag control what the user sees. They do
   not authorize an operation.
9. **Memory cache first.** Add a persisted query cache only for a named offline or startup requirement.
10. **No waterfalls.** Queries that do not depend on each other run in parallel.

## Workflow

### 1. Discover

Read the project. Write the facts to `.scratchpad/server-api-setup/facts.md`.

- Expo SDK version, and the versions of `@supabase/supabase-js`, `@tanstack/react-query` and `zod`.
- The Supabase client file, if one exists, and its session storage.
- The generated database types, if they exist. If not, propose
  `npx supabase gen types typescript --project-id <ref> > lib/database.types.ts`.
- The tables, their owner columns and their RLS policies. Ask the user for the schema if you cannot read it.
- Each place where a screen calls `supabase` directly. These are the migration targets.

If the project uses Zod 3 or TanStack Query 4, tell the user. Adapt the syntax. Do not upgrade silently.

### 2. Foundation

Make these files once for each app. Read [references/foundation.md](references/foundation.md).

| File | Content |
|---|---|
| `lib/supabase.ts` | The one Supabase client. Session storage. Token refresh tied to `AppState`. |
| `lib/query-client.ts` | The one `QueryClient`. Defaults. `focusManager` and `onlineManager` wiring. |
| `lib/auth.tsx` | `AuthProvider` with `session`. It clears the query cache on `SIGNED_OUT`. |
| `app/_layout.tsx` | Providers and `Stack.Protected` guards for `(auth)` and `(app)`. |

### 3. Define objects

For each resource, write `features/<resource>/schema.ts`. Read
[references/feature-module.md](references/feature-module.md).

- One row schema for each table or view that the app reads.
- One input schema for each mutation.
- Export the types with `z.infer`. Do not write a second type by hand.

### 4. Define sync states

For each resource, select a tier. Read [references/sync-and-realtime.md](references/sync-and-realtime.md).

| Tier | `staleTime` | Realtime | Use for |
|---|---|---|---|
| Static | 5 to 15 minutes | No | Lookup tables, feature flags |
| Normal | 60 seconds | No | Lists and details that the user edits |
| Live | 0 to 30 seconds | Yes | Data that another actor changes while the user looks at it |

Control freshness with `staleTime`. Do not disable the automatic refetch triggers globally.

### 5. Create callers and queriers

Write `api.ts`, then `queries.ts`, then `mutations.ts`.

- **Caller** (`api.ts`): one async function for each operation. It throws the Supabase error. It returns
  parsed data.
- **Querier** (`queries.ts`): one key factory and one `queryOptions` factory for each resource. Hooks are
  thin wrappers.
- **Mutation** (`mutations.ts`): one `useMutation` hook for each write.

### 6. Define invalidators

For each mutation, list the keys that it makes stale. Write the list in the resource map before you write
the code. A mutation on one resource can make a different resource stale, for example a new job changes
the appliance detail.

### 7. Realtime updates

Only for the Live tier. Subscribe in one hook for each resource. The callback invalidates the keys of that
resource. Mount the hook in the layout of the routes that show the data.

### 8. Local saving

The default is no persisted query cache. If the user names an offline or startup requirement, read the
persistence section of [references/sync-and-realtime.md](references/sync-and-realtime.md) and propose the
smallest set of queries to persist.

### 9. Record and verify

1. Write `docs/app/server-state.md` from [assets/resource-map.md](assets/resource-map.md).
2. Run the type check and the lint of the project.
3. Search for `supabase.from(` outside `features/*/api.ts`. The result must be empty.
4. Tell the user what you made, what you did not make, and what they must do (for example RLS policies or
   the Realtime publication).

## Composition

This skill owns server state only. It works alone. If the sibling skills are in use, these are the joins:

| Other concern | Join |
|---|---|
| Client state (Zustand, `client-state-setup`) | A store holds an ID or a filter. The query key takes that value. On `SIGNED_OUT`, reset the stores after `queryClient.clear()`. |
| Delivery (EAS, `ota-playbook`) | `lib/supabase.ts` sends app version headers. The version policy is a Static tier query. A removed column breaks old binaries, thus use expand, then contract. |

Provider order in `app/_layout.tsx`: `QueryClientProvider`, then the version gate (if present), then
`AuthProvider`, then the routes.

## Decisions (do not change these silently)

- **`select` names the columns.** `select('*')` hides which columns a binary needs. A named list shows the
  contract and makes a schema change safe to plan.
- **`.parse`, not `.safeParse`, in `api.ts`.** A contract failure is a query error. The error state of the
  screen shows it, and the `QueryCache` `onError` callback reports it one time.
- **No retry on a `ZodError`.** The same response fails again.
- **No `repositories/`, `services/` or `managers/` folders.** The feature module is the only layer between
  a screen and Supabase.
