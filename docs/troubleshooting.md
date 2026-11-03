# Troubleshooting & FAQ

[← Documentation index](./README.md)

Symptom-first debugging guide. Each entry lists the likely cause and the concrete fix.

---

## Authentication

### `YptAuthError: Not signed in. Call client.auth.signIn()…`

The request needed a token, none was present, and no recovery was configured.

```ts
// Any one of these fixes it:
new YptJs({ token });
new YptJs({ refreshToken });
new YptJs({ credentials: { email, password } });
await ypt.auth.signIn({ email, password });
```

### A `401` happens again even though recovery ran

The client recovers **once** per request. A second `401` means the refreshed token is also
rejected (revoked account, wrong environment, or wrong `baseUrl`).

- Check that the account is not suspended (code `114`).
- Verify `baseUrl` points at the same environment the token was issued for.
- Verify `authScheme` (`"JWT"` by default; some deployments expect `"Bearer"`).
- Try a fresh `signIn` to rule out a stale token.

### `YptAuthError` with code `112`, `113`, or `114`

| Code  | Meaning                   | Fix                                                            |
| :---- | :------------------------ | :------------------------------------------------------------- |
| `112` | Incorrect password        | Re-check credentials; social accounts may not have a password. |
| `113` | Unknown email/account     | Confirm the account exists and the email is exact.             |
| `114` | Suspended/blocked account | Not recoverable client-side.                                   |

### `restoreSession` throws but a normal request works

`restoreSession` is strict: it throws if no access token comes back. The constructor's lazy
recovery has the same behavior internally but may fall back to credentials. If you want
leniency at startup, omit the explicit `restoreSession` call and let the first request
recover.

### Logout did not clear my saved tokens

By design. `logout()` clears the in-memory session (even if the request fails) but does not
fire `onTokenChange` / `onSessionChange`. Delete your persisted copy yourself:

```ts
try {
  await ypt.auth.logout();
} finally {
  await deletePersistedTokens();
}
```

### Social sign-up fails

- `provider` must be one of `KAKAO`, `NAVER`, `GOOGLE`, `APPLE`, `FACEBOOK`.
- `token` is provider-specific: access token, ID token, or Apple identity token.
- `nickname` must be non-empty after trimming.
- Expired OAuth tokens surface as an API/auth error — refresh the OAuth token first.

### Sign-in succeeded, but the call rejected

`signIn` stores tokens **before** running the splash handshake. If the handshake fails, you
get an error while the session is already authenticated. Check `ypt.isAuthenticated`; if
true, you can continue or retry `splashLogin()`.

---

## Validation

### `YptValidationError` with `target: "input"`

The request never left your process. Common causes:

| Field                                     | Rule                                                                   |
| :---------------------------------------- | :--------------------------------------------------------------------- |
| `email`                                   | Must match `x@y.z` after trimming                                      |
| `password`                                | Non-empty; 8 chars + 2 categories with `strictPasswordValidation`      |
| `groupId`                                 | Positive integer or numeric string; `"abc"` and `"1&x=2"` are rejected |
| `q`                                       | At least 2 trimmed characters                                          |
| `maxPeopleNum`                            | 2–100                                                                  |
| `concurrency`                             | Positive integer                                                       |
| `answers`                                 | At least one entry                                                     |
| `baseUrl` / `cdnUrl`                      | Must be valid absolute URLs                                            |
| `timeoutMs`, `maxRetries`, `retryDelayMs` | Non-negative; retries integer                                          |
| `authScheme`                              | `"JWT"` or `"Bearer"` only                                             |

### `YptValidationError` with `target: "response"`

The request succeeded but the payload no longer matches the client's schema. This is the
upstream-drift canary.

```ts
catch (error) {
  if (error instanceof YptValidationError && error.target === "response") {
    console.error(error.issues);
    console.error(JSON.stringify(error.raw, null, 2));
  }
}
```

Do not retry this in a loop. Check for a newer library version, and report the failing
`path` with a redacted payload.

### `YptValidationError` when calling `validateTitle("")`

Empty titles are rejected locally. Trim the title before calling.

---

## HTTP and network

### `YptHttpError: HTTP 500` on `getMembers`

The most common cause upstream is sending `countryID`. This client never sends it. If you
use a custom `fetch`, proxy, or wrapper that appends query parameters, remove `countryID`
from member-list requests.

If it persists without `countryID`, the group id may be invalid or the account may lack
access. Inspect `error.status`, `error.url`, and `error.body`.

### `YptHttpError: Unexpected non-JSON response`

A `2xx` response with an empty body or HTML/plain text. Usually:

- `baseUrl` points at a login page, captive portal, or proxy.
- The endpoint changed and returned an HTML error page.
- A proxy stripped the JSON content type/body.

### `YptHttpError: HTTP 404` / `405`

The path or method changed upstream, or `baseUrl` is wrong. Verify
`https://pi.tgclab.com` (or your intended mirror) and compare with
[Upstream API](./upstream-api.md).

### `YptNetworkError` / `AbortError`

No HTTP response was produced. Causes: DNS, TLS, offline, firewall, or the client timeout
firing.

```ts
new YptJs({ timeoutMs: 30_000 }); // raise it
new YptJs({ timeoutMs: 0 }); // disable (not recommended in production)
```

Always set a timeout in production. Retry `YptNetworkError` with your own bounded backoff.

### `429 Too Many Requests`

The client honors `Retry-After` for `GET` retries (capped at 30 s). If you still see `429`:

- Lower `listAllMembers({ concurrency })` to `1–2`.
- Increase polling intervals.
- Reduce `maxRetries` if you are amplifying load.
- Stop parallel clients for the same account.

### Retry storm / long stalls

`maxRetries: 2` means up to 3 attempts for a `GET`, each with exponential backoff. On a
persistently failing upstream this can look like a stall. Set `maxRetries: 0` for
latency-sensitive paths and surface the error immediately.

### POST failed and was not retried

Intentional. `POST` operations (join, apply, warn, chat, notice, create) can have side
effects, so they are never retried automatically. Retry manually only if the operation is
idempotent for your use case.

---

## Data and telemetry

### `liveStudyTime` looks too high or too low

- `liveStudyMs = todayStudyMs + max(0, now - sessionStartMs)`.
- A wrong `now` injection produces wrong values:

```ts
new YptJs({ now: () => Date.now() }); // default is already this
```

- If `sessionStartMs` is `null`, no elapsed time is added.
- If the session start is in the future, elapsed time is clamped to `0`.
- YPT's `sm` excludes the currently running session; the client adds it.

### A member is studying but shows `00:00:00`

YPT intermittently reports `todayStudyMs = 0` for one group while another group has the
real value. Use `listAllMembers()`, which takes the maximum across groups. See
[cross-group merge](./groups.md#6-cross-group-unified-roster).

### "Today" seems off by a day

YPT rolls the study day over by the **group's** timezone, not UTC midnight. Use
`GroupMember.studyDate`, `GroupMember.lastActiveDate`, or `YptUser.today` instead of
computing local dates yourself.

### Duplicate people in a merged roster

Use `listAllMembers()`, not a manual concat of `getMembers()` results. It deduplicates by
`userId` and reports `duplicatesRemoved`.

### `groups.get(id)` returns `null`

There is no per-group detail endpoint. `get()` filters your **joined** groups. If the group
exists but you have not joined it, the result is `null`. Use `search()` for discovery.

### `searchJoined` made a network request

Expected. It filters the result of `listJoined()`; it does not cache. If you need repeated
searches, call `listJoined()` once and filter in your application.

### `getLeaderboard(id, "total")` is a type error

Only `"daily" | "weekly" | "monthly"` are supported by the type union. If you cast to bypass
it, the value is passed through to upstream, which may reject it.

### `role` has an unexpected value

`GroupMember.role` is asserted from the upstream string, not validated. Modern payloads have
been observed with values outside `"OWNER" | "MANAGER" | "MEMBER"`. Branch defensively.

---

## Runtime and packaging

### `TypeError: fetch is not defined`

You are on Node < 18 or an environment without global `fetch`. Upgrade, or inject a
compatible implementation:

```ts
import { fetch } from "undici";
new YptJs({ fetch });
```

### `ERR_REQUIRE_ESM` / `Cannot use import statement outside a module`

Use the correct entry point for your module system:

```js
// CJS
const { YptJs } = require("ypt-js");
```

```ts
// ESM
import { YptJs } from "ypt-js";
```

The package provides both `index.cjs` and `index.js` through conditional exports. Do not
import `dist/` paths directly.

### TypeScript cannot find declarations

- Ensure `moduleResolution` is `node16`, `nodenext`, or `bundler`.
- Import from the package root (`"ypt-js"`), not an internal file path.
- Run `tsc --noEmit` to confirm your project picks up the package's `exports` types.

### Browser usage

The client expects a JSON API at `https://pi.tgclab.com` and does not manage CORS. Browsers
will typically block these cross-origin requests. Run the client server-side and expose your
own API to the browser.

---

## Development

### Tests fail with network errors

The test suite must never make live calls. Use the `mockFetch` helper in `test/helpers.ts`
or inject a custom `fetch`. See [Contributing](./contributing.md).

### `bun test` vs `bun run test`

- `bun run test` executes the npm script: `vitest run`.
- `bun test` invokes Bun's built-in test runner.

CI currently runs `bun test`. If you add tests that depend on Vitest-specific APIs, run
them locally with `bun run test` and confirm the CI runner behavior before merging.

### Formatting fails in CI

```bash
bun run format        # write
bun run format:check  # verify
```

Prettier runs over the whole repo; commit formatted output.

---

## FAQ

**Can I use this in the browser?**
Not reliably. The upstream does not provide CORS headers. Run it server-side.

**Does it persist sessions automatically?**
No. Use `onTokenChange` / `onSessionChange` and store tokens yourself.

**Does it refresh tokens before they expire?**
No. It reacts to `401`. You can schedule `splashLogin()` yourself using `expiresAt`.

**Can I read chat messages or study logs?**
No. Only the operations in the [API reference](./api-reference.md) exist.

**How do I get `categoryId` values for search/create?**
The client does not expose a categories endpoint. Use values observed in the official app
or in search results (`SearchGroupResult.categoryId`).

**Is there a rate limit?**
The client does not impose one. It retries `429` politely and defaults to low concurrency.
You are responsible for request volume.

**Are there typings for raw payloads?**
Yes. Raw interfaces and schemas are exported for advanced use. See
[Upstream API](./upstream-api.md).

**Why is `YptClient` exported?**
It is an alias of `YptJs` retained for compatibility. Prefer `YptJs` in new code.

---

## Related

- [Error handling](./error-handling.md)
- [API reference](./api-reference.md)
- [Architecture](./architecture.md)
- [Upstream API](./upstream-api.md)
