# Version policy and enforcement

The client check gives the user a good message. The server check is the contract. Use the two together.

## Contents

1. Policy table
2. Version headers
3. Server check: Supabase Data API
4. Server check: other entry points
5. Central 426 handler
6. Startup gate
7. Offline start
8. Sources

## 1. Policy table

```sql
create table public.app_platform_config (
  platform       text primary key check (platform in ('ios', 'android')),
  min_version    text not null,
  latest_version text not null,
  store_url      text not null,
  updated_at     timestamptz not null default now()
);

alter table public.app_platform_config enable row level security;
create policy "public read" on public.app_platform_config
  for select to anon, authenticated using (true);
```

- No insert, update or delete policy. Only a migration or the dashboard changes the policy.
- Versions have three numeric parts: `1.5.0`. Do not use a suffix such as `-beta`.

| Client version | Result |
|---|---|
| below `min_version` | Forced update |
| `min_version` or above, below `latest_version` | Optional update |
| `latest_version` or above | Current |

## 2. Version headers

`lib/app-version.ts`:

```ts
import * as Application from 'expo-application';
import { Platform } from 'react-native';

export const appVersion = Application.nativeApplicationVersion ?? '0.0.0';

export const versionHeaders = {
  'X-App-Version': appVersion,
  'X-App-Build': Application.nativeBuildVersion ?? '',
  'X-App-Platform': Platform.OS,
};

export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
```

- These are the versions of the binary. An update does not change them.
- Never compare versions as strings. `'1.10.0' < '1.9.0'` is true for strings.
- The headers are compatibility data. They are not authentication. A changed client can send a false
  value. The check stops old binaries. It does not stop an attacker; RLS does that.

## 3. Server check: Supabase Data API

The Data API (PostgREST) calls a pre-request function before each request. Thus direct Supabase access can
have server enforcement with no API server between.

```sql
create or replace function public.check_app_version()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  headers json := current_setting('request.headers', true)::json;
  version text := headers ->> 'x-app-version';
  cfg     public.app_platform_config;
begin
  -- Not the mobile app (dashboard, scripts, web): no check.
  if version is null or version !~ '^\d+\.\d+\.\d+$' then return; end if;
  -- The policy table stays readable, so an old binary can show the store link.
  if current_setting('request.path', true) like '%/app_platform_config' then return; end if;

  select * into cfg from public.app_platform_config
  where platform = headers ->> 'x-app-platform';
  if not found then return; end if;

  if string_to_array(version, '.')::int[] < string_to_array(cfg.min_version, '.')::int[] then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'APP_UPDATE_REQUIRED',
        'message', 'This app version is not supported.',
        'details', cfg.min_version,
        'hint', cfg.store_url)::text,
      detail = json_build_object('status', 426, 'headers', json_build_object())::text;
  end if;
end;
$$;

alter role authenticator set pgrst.db_pre_request = 'public.check_app_version';
notify pgrst, 'reload config';
```

Cautions:

- **An error in this function fails each API request.** Apply it first on a branch or a staging project.
- To disable it: `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`
- It adds one small read to each request.
- It covers only the Data API. It does not cover Auth, Storage, Realtime or Edge Functions.
- A request with no version header passes. Thus binaries that are older than the headers are not stopped.
  Accept this limit, or refuse requests with no header after you confirm that only the mobile app uses the
  Data API.

## 4. Server check: other entry points

| Entry point | Check |
|---|---|
| Edge Function | Read `x-app-version` at the top. Return status 426 with the same JSON body. Put the check in one shared helper. |
| Custom API or BFF | One middleware before the routes. |
| Storage, Realtime | No pre-request hook. Call a version function in the RLS policy only if an operation must be refused. |

For most apps, the Data API and the Edge Functions are sufficient. An old binary that cannot read or write
data cannot do harm.

## 5. Central 426 handler

Handle 426 in one place. Do not handle it in each query.

`lib/update-required.ts`:

```ts
import { useSyncExternalStore } from 'react';

let required = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const versionFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status === 426 && !required) {
    required = true;
    listeners.forEach((listener) => listener());
  }
  return response;
};

export const useUpdateRequired = () => useSyncExternalStore(subscribe, () => required);
```

In `lib/supabase.ts`:

```ts
createClient(url, key, {
  global: { headers: versionHeaders, fetch: versionFetch },
  auth: { /* ... */ },
});
```

The state has one direction: it becomes `true` and stays `true` until the app starts again. If the project
has a client state library, a store with one field is an alternative.

## 6. Startup gate

The gate is above the auth provider. Normal routes do not render before the decision.

```tsx
type Gate = 'loading' | 'update-required' | 'ready';

export function useVersionGate(): Gate {
  const forced = useUpdateRequired();
  const policy = useQuery({
    queryKey: ['app-policy', Platform.OS],
    queryFn: () => getAppPolicy(Platform.OS),
    staleTime: 15 * 60_000,
    enabled: !__DEV__,
  });

  if (__DEV__) return 'ready';
  if (forced) return 'update-required';
  if (policy.isSuccess) {
    return compareVersions(appVersion, policy.data.min_version) < 0 ? 'update-required' : 'ready';
  }
  if (policy.isError || policy.fetchStatus === 'paused') return 'ready';
  return 'loading';
}
```

```tsx
const gate = useVersionGate();
if (gate === 'loading') return null;                 // the splash screen stays
if (gate === 'update-required') return <ForceUpdateScreen />;
return <AuthProvider>{/* routes */}</AuthProvider>;
```

- `getAppPolicy` reads one row of `app_platform_config` and parses it. It is a normal caller.
- `ForceUpdateScreen` has one message and one button: `Linking.openURL(storeUrl)`. It has no close button.
- For an optional update, show a banner that the user can close when
  `compareVersions(appVersion, latest_version) < 0`.
- In Expo Go and in development, the native version is not the version of the app. Thus the gate is off.

## 7. Offline start

A paused or failed policy query gives `ready`. This is the default, because:

- An app that was supported at the last start can start with no network.
- Each API request is still checked by the server.

If obsolete binaries must never start, store the last policy with a time, and refuse to start when the
stored policy is older than a set limit. Ask the user before you add this. It locks out users with no
network.

## 8. Sources

- Supabase, securing the Data API (pre-request function):
  https://supabase.com/docs/guides/api/securing-your-api
- PostgREST, raise errors with a custom status: https://docs.postgrest.org/en/stable/references/errors.html
- Expo Application: https://docs.expo.dev/versions/latest/sdk/application/
- HTTP 426 Upgrade Required: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/426
