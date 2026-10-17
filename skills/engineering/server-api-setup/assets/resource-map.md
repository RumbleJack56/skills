# Server state

Updated: <YYYY-MM-DD>. Stack: Supabase, Zod <version>, TanStack Query <version>, Expo SDK <version>.

## Resources

| Resource | Table or RPC | Owner column | Tier | `staleTime` | Realtime | Persisted |
|---|---|---|---|---|---|---|
| appliances | `appliances` | `client_id` | Normal | 60 s | No | No |

## Query keys

| Key | Inputs | Caller |
|---|---|---|
| `['appliances', 'list', clientId]` | `clientId` | `getAppliances` |
| `['appliances', 'detail', id]` | `id` | `getAppliance` |

## Mutations and invalidators

| Mutation | Input schema | Sets | Invalidates |
|---|---|---|---|
| `createAppliance` | `newApplianceSchema` | `appliances.detail(id)` | `appliances.lists()` |

## Realtime

| Table | Filter | Invalidates | Mounted in |
|---|---|---|---|
| none | | | |

## Server prerequisites

- [ ] RLS policies exist for each table in this document.
- [ ] Each Live table is in the `supabase_realtime` publication.
- [ ] `lib/database.types.ts` is generated from the current schema.

## Decisions

- <decision and reason>
