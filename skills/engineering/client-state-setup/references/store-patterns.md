# Store patterns

The examples are for Zustand 5 and TypeScript. Adapt them to the version in the project.

## Contents

1. Store template
2. Selectors and `useShallow`
3. Draft across routes
4. Store value as query input
5. Reset registry
6. Use outside React
7. Slices
8. Do not do this
9. Sources

## 1. Store template

`features/appliances/store.ts`:

```ts
import { create } from 'zustand';
import { registerReset } from '@/lib/stores/reset';

type Draft = { locationId: string | null; barcode: string | null; name: string };
type Actions = {
  flowStarted: () => void;
  locationSelected: (locationId: string) => void;
  barcodeScanned: (barcode: string) => void;
  nameChanged: (name: string) => void;
};

const initial: Draft = { locationId: null, barcode: null, name: '' };

const useStore = create<Draft & { actions: Actions }>()((set) => ({
  ...initial,
  actions: {
    flowStarted: () => set(initial),
    locationSelected: (locationId) => set({ locationId }),
    barcodeScanned: (barcode) => set({ barcode }),
    nameChanged: (name) => set({ name }),
  },
}));

registerReset(() => useStore.setState(initial));

export const useDraftLocationId = () => useStore((s) => s.locationId);
export const useDraftBarcode = () => useStore((s) => s.barcode);
export const useDraftName = () => useStore((s) => s.name);
export const useApplianceDraftActions = () => useStore((s) => s.actions);
export const getApplianceDraft = (): Draft => {
  const { actions, ...draft } = useStore.getState();
  return draft;
};
```

- `create<T>()(...)` has two calls. TypeScript needs this form.
- `set` merges at the first level. `set({ locationId })` keeps the other fields and the `actions`.
- The module does not export `useStore`.

## 2. Selectors and `useShallow`

```ts
// Good: one value, stable identity
const name = useDraftName();

// Bad in Zustand 5: a new object on each call -> render loop
const { name, barcode } = useStore((s) => ({ name: s.name, barcode: s.barcode }));

// Good, if you must have more than one value in one hook
import { useShallow } from 'zustand/react/shallow';
const { name, barcode } = useStore(useShallow((s) => ({ name: s.name, barcode: s.barcode })));
```

- A derived value is a selector: `useStore((s) => s.items.length)`.
- A selector that calls `.filter()` or `.map()` returns a new array. Use `useShallow`, or select the source
  array and calculate with `useMemo`.

## 3. Draft across routes

The flow: `appliances/new` opens `select-location` and `scan-barcode`. Each sub-route gives one value back.

```tsx
// appliances/new.tsx
const { flowStarted } = useApplianceDraftActions();
useEffect(flowStarted, [flowStarted]);          // an old draft never shows

// select-location.tsx
const { locationSelected } = useApplianceDraftActions();
const onPick = (id: string) => { locationSelected(id); router.back(); };

// appliances/new.tsx, submit
const create = useCreateAppliance();
const onSubmit = () => {
  const input = newApplianceSchema.safeParse(getApplianceDraft());
  if (!input.success) return setErrors(z.flattenError(input.error).fieldErrors);
  create.mutate(input.data, { onSuccess: () => { flowStarted(); router.back(); } });
};
```

- The sub-route does not know which screen opened it. It records an event and goes back.
- The mutation input schema validates the draft at submit. The store does not validate.
- Reset at the start and at the end. A reset only at the end fails if the user leaves the flow.
- If only one value goes back and a deep link must restore it, use a route param and not a store.

## 4. Store value as query input

```ts
// store: only the filter
export const useJobFilter = () => useStore((s) => s.status);

// screen: the filter is part of the query key
const status = useJobFilter();
const jobs = useQuery(jobQueries.list(userId, { status }));
```

The store never holds the job list. When the filter changes, the key changes and the cache gets the data.

## 5. Reset registry

`lib/stores/reset.ts`:

```ts
const resetters = new Set<() => void>();
export const registerReset = (reset: () => void) => void resetters.add(reset);
export const resetAllStores = () => resetters.forEach((reset) => reset());
```

Call it where the app handles sign-out:

```ts
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    queryClient.clear();
    resetAllStores();
  }
});
```

- Register only user-scoped stores. A device-scoped store (theme) is not registered.
- In tests, call `resetAllStores()` in `afterEach`.

## 6. Use outside React

`useStore.getState()` reads the current state in plain TypeScript, for example in a request header
function. `useStore.subscribe(listener)` listens. Export a named function for each such use. Do not export
the store.

## 7. Slices

Use slices only if one store becomes too large for one file.

```ts
const useStore = create<A & B>()((...a) => ({ ...createASlice(...a), ...createBSlice(...a) }));
```

Apply middleware only to the combined store, never in a slice.

## 8. Do not do this

| Pattern | Problem | Do this |
|---|---|---|
| `setJobs(data)` in a query `onSuccess` | Two copies of server data | Read the query where you need it. |
| `const state = useStore()` | A render on each change of the store | Atomic selector hooks. |
| `setLocationId`, `setStep`, `setName` from the screen | The screen holds the logic | Event actions. |
| One `useAppStore` for all | No independent reset or persist | One store for each domain. |
| A store that calls `router.push` | Hidden navigation | The screen navigates after the action. |
| A token in a store | A secret in plain storage | `expo-secure-store`, or the auth client. |
| `isLoading` or `error` for a fetch in a store | A second fetch lifecycle | The query or mutation state. |

## 9. Sources

- Zustand, TypeScript guide: https://zustand.docs.pmnd.rs/learn/guides/beginner-typescript
- Zustand, `useShallow`: https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow
- Zustand, migration to v5: https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5
- Zustand, reset state: https://zustand.docs.pmnd.rs/learn/guides/how-to-reset-state
- Zustand, slices pattern: https://zustand.docs.pmnd.rs/learn/guides/slices-pattern
- TkDodo, working with Zustand: https://tkdodo.eu/blog/working-with-zustand
