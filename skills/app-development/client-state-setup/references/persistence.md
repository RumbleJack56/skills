# Persistence

Persist only preferences (row 9 of the classification table). The examples are for Zustand 5.

## Contents

1. Select the storage
2. Persisted store template
3. Version and migrate
4. Hydration
5. What not to persist
6. Sources

## 1. Select the storage

Use the storage that the project has. Do not add a second engine.

| Storage | Type | Use when |
|---|---|---|
| `localStorage` from `expo-sqlite/localStorage/install` | Synchronous | Default for a new Expo project. The Supabase client can use the same one. |
| `react-native-mmkv` | Synchronous | The project has MMKV. It needs a development build. |
| `@react-native-async-storage/async-storage` | Asynchronous | The project has it. A hydration gate is necessary. |
| `expo-secure-store` | Encrypted, approximately 2 KB for each value | Secrets only. Do not use it for a store. |

## 2. Persisted store template

`lib/stores/preferences.ts`:

```ts
import 'expo-sqlite/localStorage/install';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Data = { theme: 'system' | 'light' | 'dark'; onboardingSeen: boolean };
type Actions = { themeSelected: (theme: Data['theme']) => void; onboardingCompleted: () => void };

const useStore = create<Data & { actions: Actions }>()(
  persist(
    (set) => ({
      theme: 'system',
      onboardingSeen: false,
      actions: {
        themeSelected: (theme) => set({ theme }),
        onboardingCompleted: () => set({ onboardingSeen: true }),
      },
    }),
    {
      name: 'preferences',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: ({ actions, ...data }) => data,
    },
  ),
);

export const useTheme = () => useStore((s) => s.theme);
export const useOnboardingSeen = () => useStore((s) => s.onboardingSeen);
export const usePreferenceActions = () => useStore((s) => s.actions);
```

- `partialize` must remove `actions`. JSON drops functions, thus the stored `actions` is `{}`. The default
  merge then replaces the real actions with `{}`.
- `name` is the storage key. It must be unique in the app.
- For MMKV, give `createJSONStorage` an object with `getItem`, `setItem` and `removeItem` that call the
  MMKV instance.

## 3. Version and migrate

Increase `version` each time the shape of the persisted data changes. An OTA update can deliver a new
shape to a device that has old data.

```ts
version: 2,
migrate: (persisted, from) => {
  const data = persisted as Record<string, unknown>;
  if (from < 2) data.theme = data.darkMode ? 'dark' : 'system';
  return data as Data;
},
```

- If the version is different and no `migrate` exists, the stored data is discarded.
- A new field with a default value needs no migration. The default merge keeps the initial value.
- A rollback of an update can run old code on new data. Thus a migration must not delete a field that the
  previous version reads, until that version is not supported.

## 4. Hydration

- **Synchronous storage:** the store has the stored data before the first render. No gate is necessary.
- **Asynchronous storage:** the first render has the initial state. Gate the UI that depends on it.

```ts
export function usePreferencesHydrated() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  return hydrated;
}
```

Keep the splash screen until the hook returns `true`. If not, the user sees the wrong theme or the
onboarding screen for a moment.

## 5. What not to persist

| Data | Reason | Owner |
|---|---|---|
| Server data | It goes out of date, and a second cache has no invalidation. | The server cache and its persister. |
| Session and tokens | The auth client persists them. | The auth client. |
| Secrets | The store storage is not encrypted. | `expo-secure-store`. |
| Drafts | An old draft confuses the user after a restart. | Memory, unless the user decides differently. |
| `actions` and derived values | They are code, not data. | The store definition. |

A persisted user-scoped store must reset on sign-out. The reset writes the initial state to the storage.

## 6. Sources

- Zustand, persist middleware: https://zustand.docs.pmnd.rs/reference/middlewares/persist
- Zustand, persisting store data: https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data
- Expo SQLite, localStorage and key-value store: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
