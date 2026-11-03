# Getting Started

[← Documentation index](./overview.md)

This guide takes you from installation to a working, authenticated client. It covers runtime
support, every constructor option, and the three supported ways to establish a session.

---

## 1. Install

```bash
bun add ypt-js
# or: npm install ypt-js
# or: pnpm add ypt-js
# or: yarn add ypt-js
```

The package has a single runtime dependency: `zod`. It relies on the global `fetch`
available in Node.js 18+ and Bun. No polyfill is bundled.

---

## 2. Import styles

### ESM (recommended)

```ts
import { YptJs } from "ypt-js";
```

### CommonJS

```js
const { YptJs } = require("ypt-js");
```

Both builds expose the same API and ship TypeScript declarations (`.d.ts` for ESM,
`.d.cts` for CJS).

### Type-only imports

```ts
import type { Group, GroupMember, YptUser, YptJsOptions } from "ypt-js";
```

---

## 3. Create a client

Everything is configured through a single options object. Only `token`,
`refreshToken`, or `credentials` are needed to make authenticated calls.

```ts
import { YptJs } from "ypt-js";

const ypt = new YptJs({
  credentials: {
    email: process.env.YPT_EMAIL!,
    password: process.env.YPT_PASSWORD!,
  },
});
```

The constructor is synchronous and performs **no network I/O**. Authentication happens
lazily on the first request that needs a token.

### Complete options reference

| Option            | Type                                                       | Default                       | Description                                                                                   |
| :---------------- | :--------------------------------------------------------- | :---------------------------- | :-------------------------------------------------------------------------------------------- |
| `token`           | `string`                                                   | —                             | Existing access token/JWT to use immediately.                                                 |
| `refreshToken`    | `string`                                                   | —                             | Long-lived token used to rotate the access token through splash-login.                        |
| `expiresAt`       | `number`                                                   | —                             | Access-token expiry timestamp. Stored and surfaced only; the client does not pre-empt expiry. |
| `credentials`     | `{ email: string; password: string }`                      | —                             | Enables lazy sign-in and credential-based recovery after a `401`. Held in memory only.        |
| `onTokenChange`   | `(token: string, refreshToken?: string) => void`           | —                             | Called whenever the access token changes, including rotation.                                 |
| `onSessionChange` | `(session: SessionInfo) => void`                           | —                             | Called with the full session snapshot whenever it changes.                                    |
| `authScheme`      | `"JWT" \| "Bearer"`                                        | `"JWT"`                       | Prefix used in the `Authorization` header.                                                    |
| `baseUrl`         | `string`                                                   | `"https://pi.tgclab.com"`     | API gateway base URL. Must be a valid URL.                                                    |
| `cdnUrl`          | `string`                                                   | `"https://alicdn.tgclab.com"` | CDN base used for avatars and studicons.                                                      |
| `userAgent`       | `string`                                                   | `"Dart/3.11 (dart:io)"`       | Sent as `User-Agent`. The upstream expects an app-like value.                                 |
| `headers`         | `Record<string, string>`                                   | `{}`                          | Extra headers. These are merged last and can override defaults.                               |
| `timeoutMs`       | `number`                                                   | `15000`                       | Per-request timeout. `0` disables it.                                                         |
| `maxRetries`      | `number`                                                   | `2`                           | Extra attempts for idempotent `GET`s on network errors, `429`, and `5xx`.                     |
| `retryDelayMs`    | `number`                                                   | `500`                         | Base delay for exponential backoff with jitter.                                               |
| `language`        | `string`                                                   | `"en"`                        | Sent as `language` in sign-in and splash-login bodies.                                        |
| `device`          | `Partial<SplashDevice>`                                    | see below                     | Overrides for the splash-login device handshake.                                              |
| `fetch`           | `(input: string, init?: RequestInit) => Promise<Response>` | `globalThis.fetch`            | Custom fetch for proxies, instrumentation, or tests.                                          |
| `now`             | `() => number`                                             | `Date.now`                    | Clock used to compute live study time. Injectable for deterministic tests.                    |

`YptClientOptions` is an alias of `YptJsOptions`.

### Splash device defaults

| Field         | Default     |
| :------------ | :---------- |
| `version`     | `810046`    |
| `pushToken`   | `""`        |
| `timezone`    | `"UTC"`     |
| `deviceType`  | `"WIN"`     |
| `osVersion`   | `10`        |
| `deviceModel` | `"Desktop"` |
| `pv`          | `2`         |

Override any subset with `device`:

```ts
const ypt = new YptJs({
  token,
  device: { timezone: "Asia/Dhaka", deviceType: "ANDROID", deviceModel: "Pixel 8" },
});
```

> **Note:** The upstream uses group-local timezones for daily rollover. If you compute
> "today" yourself, use the value returned in `GroupMember.studyDate` / `YptUser.today`
> rather than UTC midnight.

---

## 4. Choose an authentication strategy

### A. Pass an access token

Best for short-lived processes or when your application already manages YPT sessions.

```ts
const ypt = new YptJs({ token: process.env.YPT_ACCESS_TOKEN });
const groups = await ypt.groups.listJoined();
```

If the token is expired and no refresh token or credentials are configured, requests fail
with `YptAuthError`.

### B. Pass a refresh token

Restores a session across restarts. When a request needs a token (initially or after a
`401`), the client calls splash-login with the refresh token and stores the rotated pair.

```ts
const ypt = new YptJs({
  refreshToken: await loadRefreshToken(),
  onTokenChange: (accessToken, refreshToken) => saveTokens({ accessToken, refreshToken }),
});

// Optional explicit handshake before the first call:
await ypt.auth.restoreSession(await loadRefreshToken());
```

### C. Pass credentials

Enables lazy email/password sign-in and automatic re-login after a `401`.

```ts
const ypt = new YptJs({
  credentials: { email, password },
  onTokenChange: (accessToken, refreshToken) => saveTokens({ accessToken, refreshToken }),
});

const groups = await ypt.groups.listJoined(); // signs in first
```

### D. Manual control

Call `signIn` yourself and persist the result. This is useful when credentials come from a
request, a CLI prompt, or a secrets manager.

```ts
const ypt = new YptJs();
const user = await ypt.auth.signIn({ email, password });
await saveTokens({ accessToken: ypt.accessToken!, refreshToken: ypt.refreshToken });
```

### Recovery precedence

When a request is about to run without a token, or receives a `401`:

1. If a refresh token is available, try `POST /user/v2/splash-login`.
2. If that fails or yields no access token, and credentials were supplied, call
   `POST /user/sign-in-jwt`.
3. If neither produces a token, throw `YptAuthError`.

Only **one** recovery attempt is made per request, and concurrent requests share the same
in-flight recovery operation.

---

## 5. Make your first calls

```ts
import { YptJs, formatDuration } from "ypt-js";

const ypt = new YptJs({
  credentials: { email: process.env.YPT_EMAIL!, password: process.env.YPT_PASSWORD! },
});

const groups = await ypt.groups.listJoined();

for (const group of groups) {
  const members = await ypt.groups.getMembers(group.id);
  const active = members.filter((m) => m.isStudying && !m.isPaused);

  console.log(`${group.name}: ${active.length}/${members.length} studying`);

  for (const member of active.slice(0, 3)) {
    console.log(`  ${member.nickname} — ${formatDuration(member.liveStudyMs)}`);
  }
}
```

---

## 6. Read the response models

The client returns domain objects, never raw upstream payloads. For example, a raw member
record like:

```json
{
  "ud": 16300695,
  "n": "Afnan",
  "dl": { "sm": 14400000, "is": true, "ss": 1773456000000, "sn": "Distributed Systems" }
}
```

is returned as a `GroupMember`:

```ts
{
  userId: 16300695,
  nickname: "Afnan",
  isStudying: true,
  isPaused: false,
  currentSubject: "Distributed Systems",
  todayStudyMs: 14400000,
  liveStudyMs: 14400000 + (Date.now() - 1773456000000),
  todayStudyTime: "04:00:00",
  liveStudyTime: "04:15:00",
  // …plus avatar, role, session, and cam metadata when present
}
```

Both the legacy (`ms` + `dl`) and modern (`members` + `today_study_seconds`) payload shapes
are supported and normalized to the same interface. See
[Groups → Live roster](./groups.md#5-live-roster--real-time-telemetry) for the full field
semantics.

---

## 7. Handle failures intentionally

```ts
import { YptAuthError, YptNetworkError, YptValidationError } from "ypt-js";

try {
  await ypt.groups.listJoined();
} catch (error) {
  if (error instanceof YptAuthError) {
    // Bad credentials, expired session, or suspended account.
  } else if (error instanceof YptValidationError) {
    // Invalid input or an upstream response that no longer matches the schema.
    console.error(error.target, error.issues);
  } else if (error instanceof YptNetworkError) {
    // DNS/TLS/timeout/offline. Safe to retry with your own backoff.
  }
}
```

See [Error handling](./error-handling.md) for the complete hierarchy and retry semantics.

---

## 8. Test without touching the network

Inject both `fetch` and `now`:

```ts
import { YptJs } from "ypt-js";

const ypt = new YptJs({
  token: "test-token",
  now: () => 1_700_000_000_000,
  fetch: async (url, init) =>
    new Response(JSON.stringify({ s: true, ms: [], cs: [], gs: [], ps: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
});
```

The `fetch` signature is `(input: string, init?: RequestInit) => Promise<Response>`, so any
`undici`, proxy, or mock implementation works.

---

## Next steps

- [Authentication & session lifecycle](./authentication.md)
- [Groups & telemetry](./groups.md)
- [API reference](./api-reference.md)
- [Production cookbook](./cookbook.md)
