# Foundation

The four files that each app has one time. The examples are for a current Expo SDK (React 19, Expo Router
with `Stack.Protected`), `supabase-js` 2 and TanStack Query 5. Adapt them to the versions in the project.

## Contents

1. Packages
2. `lib/supabase.ts`
3. `lib/query-client.ts`
4. `lib/auth.tsx`
5. `app/_layout.tsx`
6. Roles and bootstrap queries
7. Sources

## 1. Packages

```bash
npx expo install @supabase/supabase-js expo-sqlite expo-network
npm install @tanstack/react-query zod
```

## 2. `lib/supabase.ts`

```ts
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { Database } from './database.types';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

- Only the publishable (anon) key goes in the app. A secret or service-role key never goes in the app.
- `expo-secure-store` has a value limit of approximately 2 KB. A session is larger. Do not use it directly
  as the session storage.
- If the project has a different session storage that works, keep it.

## 3. `lib/query-client.ts`

```ts
import { QueryClient, QueryCache, focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';
import { ZodError } from 'zod';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => console.error('query failed', query.queryKey, error),
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (count, error) => !(error instanceof ZodError) && count < 2,
    },
  },
});

onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(!!s.isConnected));
  return sub.remove;
});

AppState.addEventListener('change', (status) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});
```

Effects of this wiring:

| Event | Effect |
|---|---|
| App goes to the background | No focus refetch. |
| App comes to the foreground | Stale queries on the screen refetch. |
| Device goes offline | Queries and mutations pause. |
| Device comes online | Paused work continues. Stale queries refetch. |

Replace `console.error` with the error reporter of the project.

## 4. `lib/auth.tsx`

```tsx
import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { queryClient } from './query-client';
import { supabase } from './supabase';

// undefined = not settled, null = signed out
const AuthContext = createContext<Session | null | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext value={session}>{children}</AuthContext>;
}

export const useSession = () => use(AuthContext);

export function useUserId(): string {
  const session = use(AuthContext);
  if (!session) throw new Error('useUserId is only for routes in (app)');
  return session.user.id;
}
```

- `onAuthStateChange` sends `INITIAL_SESSION` when the stored session is restored. Thus no
  `getSession()` call is necessary.
- Do not `await` a Supabase call in the callback. The auth client holds a lock and the call can stop.
- With React 18, use `<AuthContext.Provider>` and `useContext`.

## 5. `app/_layout.tsx`

```tsx
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootStack() {
  const session = useSession();
  if (session === undefined) return null; // the splash screen stays

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
```

- `Stack.Protected` is client navigation only. RLS authorizes each operation.
- Keep the splash screen until the session is settled (`SplashScreen.preventAutoHideAsync()`, then
  `hideAsync()`).
- A step such as "complete sign up" is one more guard: `guard={!!session && !profile.complete}`.

## 6. Roles and bootstrap queries

- Read the role from the server (`profiles` or `user_roles`) with a Static tier query. Derive UI flags from
  it: `const isClient = role === 'client'`.
- After the session is settled, start the profile, role and flag queries together. They do not depend on
  each other, thus they must not run as a chain.
- A route group for a role uses one more `Stack.Protected` guard.

## 7. Sources

- Expo, using Supabase: https://docs.expo.dev/guides/using-supabase/
- Supabase, Expo quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native
- TanStack Query, React Native: https://tanstack.com/query/v5/docs/framework/react/react-native
- TanStack Query, important defaults: https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults
- Expo Router, protected routes: https://docs.expo.dev/router/advanced/protected/
