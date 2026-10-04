# Sync states, invalidators, realtime and persistence

## Contents

1. Sync states
2. Invalidators
3. Realtime
4. Feature flags
5. Persisted query cache
6. Waterfalls
7. Sources

## 1. Sync states

`staleTime` is the time during which the cache does not refetch. After that time, the data is stale. A stale
query refetches when a component mounts it, when the app comes to the foreground, or when the network
comes back.

| Tier | `staleTime` | Realtime | Examples |
|---|---|---|---|
| Static | `5 * 60_000` to `15 * 60_000` | No | Brands, categories, feature flags, role |
| Normal | `60_000` (the default of the client) | No | Appliances, locations, profile |
| Live | `0` to `30_000` | Yes | The active job, offers, notifications |

Rules:

- Select the tier by this question: "Who changes this data while the user looks at it?" If the answer is
  "only this user", the tier is Normal.
- A kill-switch flag is Live or has a short stale time. Other flags are Static.
- Use `refetchInterval` only if Realtime is not available for the table. Polling uses battery and data.
- Pull-to-refresh calls `query.refetch()`. It is not a reason for a short stale time.

## 2. Invalidators

Write this table in the resource map before you write the mutations.

| Event | Set directly | Invalidate |
|---|---|---|
| `createAppliance` success | `appliances.detail(id)` | `appliances.lists()` |
| `updateAppliance` success | `appliances.detail(id)` | `appliances.lists()` |
| `deleteAppliance` success | remove `appliances.detail(id)` | `appliances.lists()` |
| `createJob` success | `jobs.detail(id)` | `jobs.lists()`, `appliances.detail(applianceId)` |
| Realtime event on `jobs` | none | `jobs.all` |
| `SIGNED_OUT` | none | `queryClient.clear()` |

Rules:

- Invalidate by key prefix. Do not edit lists by hand. The server sorts and filters the list.
- If a mutation on resource A changes what resource B shows, the A mutation imports the B keys.
- An optimistic update is an exception. Use it only for a small, reversible change (for example "mark as
  read"). Do not use it for a create, or for a write with server business rules.

## 3. Realtime

```ts
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { jobKeys } from './queries';

export function useJobsRealtime(clientId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`jobs:${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `client_id=eq.${clientId}` },
        () => void queryClient.invalidateQueries({ queryKey: jobKeys.all }),
      )
      .subscribe();

    return () => void supabase.removeChannel(channel);
  }, [clientId, queryClient]);
}
```

- Put the hook in `features/<resource>/realtime.ts`. Mount it in the layout of the routes that show the data.
- The table must be in the publication: `alter publication supabase_realtime add table jobs;`
- RLS applies to each event. A user receives only the rows that the user can select.
- An event can be lost while the app is in the background. The focus refetch gets the current data, thus
  the Live tier must keep a short stale time.
- Above approximately 3,000 subscribers for the same changes, Supabase recommends Broadcast.
- Do not write the event payload into the cache. The payload does not have joined data and can arrive out
  of sequence.

## 4. Feature flags

A flags table is a Static tier resource. It uses the same feature module shape (`features/config/`).

```ts
export const useFlag = (flag: string) =>
  useQuery({ ...flagQueries.all(), select: (flags) => flags[flag]?.enabled ?? false });
```

- A flag controls what the app shows. RLS controls what the server permits.
- A flag cannot make a native module available. The binary must contain the module.
- Do not make a second store for flags.

## 5. Persisted query cache

Default: do not persist. The session is persisted, and the queries refetch at startup.

Add persistence only if the user names a requirement, for example "show the last job list with no network".

```tsx
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Application from 'expo-application';
import Storage from 'expo-sqlite/kv-store';

const persister = createAsyncStoragePersister({ storage: Storage });

<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{
    persister,
    maxAge: 24 * 60 * 60_000,
    buster: Application.nativeApplicationVersion ?? '',
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && q.meta?.persist === true,
    },
  }}
>
```

- Opt in for each query with `meta: { persist: true }`. Do not persist all queries.
- Set `gcTime` of a persisted query to `maxAge` or more. If not, the cache discards the data before the
  persister restores it.
- `buster` discards the stored cache when the app version changes. A stored row can have an old shape.
- On `SIGNED_OUT`, call `queryClient.clear()` and `persister.removeClient()`.
- Do not persist mutations in the first version. Paused mutations that start again after a restart need
  `setMutationDefaults` and a conflict policy.
- Secrets do not go in the query cache.

## 6. Waterfalls

Bad: profile, then roles, then flags, then appliances, each after the one before.

Good: when the session is settled, each independent query starts at the same time. A component that calls
three hooks starts three requests in parallel.

A dependent query is correct only if the second request needs data from the first. Use `enabled` for it.
If one screen needs data from two tables for each row, use a Supabase embedded select or a view. Do not
make one request for each row.

## 7. Sources

- TanStack Query, important defaults: https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults
- TanStack Query, query invalidation: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation
- TanStack Query, request waterfalls: https://tanstack.com/query/v5/docs/framework/react/guides/request-waterfalls
- TanStack Query, persistQueryClient: https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient
- Supabase, Postgres changes: https://supabase.com/docs/guides/realtime/postgres-changes
- Expo SQLite key-value store: https://docs.expo.dev/versions/latest/sdk/sqlite/
