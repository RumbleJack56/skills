# Feature module

One folder for each resource. The example resource is `appliances`. Its owner column is `client_id`.

```text
features/appliances/
  schema.ts      Zod schemas and types          (imports: zod)
  api.ts         callers                        (imports: schema, lib/supabase)
  queries.ts     keys, queryOptions, read hooks (imports: api, @tanstack/react-query)
  mutations.ts   write hooks and invalidators   (imports: api, queries)
  components/    UI for this resource
```

## Contents

1. `schema.ts`
2. `api.ts`
3. `queries.ts`
4. `mutations.ts`
5. Use in a screen
6. Sources

## 1. `schema.ts`

```ts
import { z } from 'zod';

export const applianceSchema = z.object({
  id: z.uuid(),
  client_id: z.uuid(),
  name: z.string().nullable(),
  brand: z.string(),
  purchase_date: z.iso.date().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
export type Appliance = z.infer<typeof applianceSchema>;

export const newApplianceSchema = z.object({
  location_id: z.uuid(),
  name: z.string().trim().min(1).nullable(),
  brand: z.string().trim().min(1),
});
export type NewAppliance = z.infer<typeof newApplianceSchema>;
```

Map of Postgres types to Zod 4:

| Postgres | Zod 4 | Note |
|---|---|---|
| `uuid` | `z.uuid()` | Strict RFC 9562. Use `z.guid()` for non-standard seed IDs. |
| `timestamptz` | `z.iso.datetime({ offset: true })` | The default refuses `+00:00`. PostgREST sends an offset. |
| `date` | `z.iso.date()` | |
| `text` with a fixed set | `z.enum([...])` | An unknown value fails the parse. Use `z.string()` if the set grows. |
| `numeric` | `z.number()` or `z.string()` | PostgREST sends large `numeric` values as strings. Check a real row. |
| `jsonb` | A schema for the known shape | Use `z.unknown()` only if the app does not read it. |
| nullable column | `.nullable()` | Not `.optional()`. The key is present and the value is `null`. |

- `z.object` removes unknown keys. Thus a new column on the server does not break the app.
- The generated `Database` type checks the query at compile time. The Zod schema checks the data at run
  time. Keep both.
- The same input schema validates the form. Do not write a second form schema.

## 2. `api.ts`

```ts
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { applianceSchema, newApplianceSchema, type Appliance, type NewAppliance } from './schema';

const COLUMNS = 'id, client_id, name, brand, purchase_date, created_at';

export async function getAppliances(clientId: string): Promise<Appliance[]> {
  const { data, error } = await supabase
    .from('appliances')
    .select(COLUMNS)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return z.array(applianceSchema).parse(data);
}

export async function getAppliance(id: string): Promise<Appliance> {
  const { data, error } = await supabase.from('appliances').select(COLUMNS).eq('id', id).single();
  if (error) throw error;
  return applianceSchema.parse(data);
}

export async function createAppliance(input: NewAppliance): Promise<Appliance> {
  const { data, error } = await supabase
    .from('appliances')
    .insert(newApplianceSchema.parse(input))
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return applianceSchema.parse(data);
}
```

- Each caller has explicit inputs. It does not read the session, a store or the router.
- Each write returns the row (`.select().single()`). The mutation uses that row.
- Use an RPC (`supabase.rpc`) for a write that changes more than one table or has business rules. Parse its
  result the same way.

## 3. `queries.ts`

```ts
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useUserId } from '@/lib/auth';
import { getAppliance, getAppliances } from './api';

export const applianceKeys = {
  all: ['appliances'] as const,
  lists: () => [...applianceKeys.all, 'list'] as const,
  list: (clientId: string) => [...applianceKeys.lists(), clientId] as const,
  detail: (id: string) => [...applianceKeys.all, 'detail', id] as const,
};

export const applianceQueries = {
  list: (clientId: string) =>
    queryOptions({ queryKey: applianceKeys.list(clientId), queryFn: () => getAppliances(clientId) }),
  detail: (id: string) =>
    queryOptions({ queryKey: applianceKeys.detail(id), queryFn: () => getAppliance(id) }),
};

export const useAppliances = () => useQuery(applianceQueries.list(useUserId()));
export const useAppliance = (id: string) => useQuery(applianceQueries.detail(id));
```

- Keys go from general to specific. Thus `applianceKeys.all` invalidates each query of the resource.
- A filter or a page number is one more key element: `list: (clientId, filters) => [..., clientId, filters]`.
- Set `staleTime` in the `queryOptions` only if the tier is not Normal.
- For an input that can be absent, use `enabled: !!id`, or `queryFn: id ? () => get(id) : skipToken`.

## 4. `mutations.ts`

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAppliance } from './api';
import { applianceKeys } from './queries';

export function useCreateAppliance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAppliance,
    onSuccess: (appliance) => {
      queryClient.setQueryData(applianceKeys.detail(appliance.id), appliance);
      return queryClient.invalidateQueries({ queryKey: applianceKeys.lists() });
    },
  });
}
```

- `return` the invalidation promise. Then `isPending` stays true until the list is fresh.
- `setQueryData` is only for a row that the server returned.
- Navigation after success goes in the screen (`mutate(input, { onSuccess: () => router.back() })`). It
  does not go in the hook.
- For a delete: `queryClient.removeQueries({ queryKey: applianceKeys.detail(id) })`, then invalidate the
  lists.

## 5. Use in a screen

```tsx
const appliances = useAppliances();

if (appliances.isPending) return <Skeleton />;
if (appliances.isError) return <ErrorState onRetry={appliances.refetch} />;
return <ApplianceList data={appliances.data} />;
```

Two screens that call `useAppliances()` share one cache entry and one request. A route does not pass
resource data to a different route. It passes the ID.

## 6. Sources

- TanStack Query, query options: https://tanstack.com/query/v5/docs/framework/react/guides/query-options
- TanStack Query, query keys: https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
- TanStack Query, updates from mutation responses:
  https://tanstack.com/query/v5/docs/framework/react/guides/updates-from-mutation-responses
- Zod 4 string formats: https://zod.dev/api#string-formats
- Zod 4 migration: https://zod.dev/v4/changelog
- Supabase, generate types: https://supabase.com/docs/guides/api/rest/generating-types
