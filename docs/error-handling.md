# Error Handling

[← Documentation index](./README.md)

Every failure throws a subclass of `YptError`. This guide explains exactly which class is
thrown for which condition, what data each carries, and how to build reliable recovery.

---

## 1. Hierarchy

```text
YptError
├── YptValidationError        caller input or upstream response failed Zod validation
├── YptNetworkError           the request never produced an HTTP response
├── YptHttpError              HTTP failure without a YPT error envelope
└── YptApiError               YPT envelope error: { s: false, c, m }
    └── YptAuthError          authentication / authorization failure
```

```ts
import {
  YptError,
  YptValidationError,
  YptNetworkError,
  YptHttpError,
  YptApiError,
  YptAuthError,
} from "ypt-js";
```

All classes support the standard `cause` option. `instanceof` checks work as shown because
the subclasses extend their parents normally.

---

## 2. When each error is thrown

| Error                | Thrown when                                                                      | Useful fields                                             |
| :------------------- | :------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| `YptValidationError` | Constructor/method input fails Zod, **or** an upstream response fails its schema | `target: "input" \| "response"`, `issues`, `raw`, `cause` |
| `YptNetworkError`    | `fetch` rejects: DNS, TLS, offline, aborted timeout                              | `cause`                                                   |
| `YptHttpError`       | Non-2xx without `{ s: false }`, or a 2xx body that is not a JSON object          | `status`, `url`, `body`                                   |
| `YptApiError`        | Envelope `{ s: false, c, m }` with a non-auth code                               | `code`, `status`, `body`                                  |
| `YptAuthError`       | Envelope code `112`/`113`/`114`, HTTP `401`, or no token available               | `code`, `status`, `body`, `message`                       |

### Input vs. response validation

```ts
try {
  await ypt.groups.getMembers("not-a-number");
} catch (error) {
  if (error instanceof YptValidationError) {
    error.target; // "input"
    error.issues; // Zod issues [{ path: [...], message: "..." }]
  }
}

try {
  await ypt.groups.listJoined();
} catch (error) {
  if (error instanceof YptValidationError && error.target === "response") {
    // Upstream changed shape. error.raw holds the original payload.
    console.error(error.raw);
    console.error(error.issues);
  }
}
```

Input validation happens **before** any request. A response validation error means the
request succeeded but the payload no longer matches what the client can safely map.

### API envelope errors

```json
{ "s": false, "c": 1300, "m": "Group does not exist" }
```

becomes:

```ts
YptApiError {
  message: "Group does not exist (code 1300)",
  name: "YptApiError",
  code: 1300,
  status: 200, // the HTTP status that carried the envelope
  body: { s: false, c: 1300, m: "Group does not exist" }
}
```

The envelope is interpreted **before** the HTTP status, so a logical error delivered with
`200` still throws. Authentication codes `112`, `113`, and `114` produce `YptAuthError`
instead of `YptApiError`.

### Auth failures

| Condition                                                | Error                                               |
| :------------------------------------------------------- | :-------------------------------------------------- |
| Envelope code `112`, `113`, `114`                        | `YptAuthError` with that `code`                     |
| HTTP `401` (with or without envelope)                    | `YptAuthError`                                      |
| Request needs a token, none exists, recovery unavailable | `YptAuthError` with a "Not signed in" message       |
| `restoreSession` yields no token                         | `YptAuthError` ("Refresh token invalid or expired") |
| Sign-in response has no token                            | `YptApiError`                                       |

### HTTP failures

- Non-2xx with no parseable envelope → `YptHttpError`. `body` is the parsed JSON when it
  was valid JSON, otherwise `undefined`.
- 2xx with an empty/non-JSON body → `YptHttpError` whose `body` is a short text snippet
  (max 200 chars).
- `401` is special-cased to `YptAuthError` before this rule.

### Network failures

```ts
YptNetworkError {
  message: "Network error on GET /group/groups/v2",
  cause: <original fetch/abort error>
}
```

Timeouts use `AbortSignal.timeout`, so an aborted request arrives here with an `AbortError`
cause. `timeoutMs: 0` disables the timeout entirely.

---

## 3. Retry behavior

| Situation                      | `GET`                                            | `POST`                      |
| :----------------------------- | :----------------------------------------------- | :-------------------------- |
| Network error / timeout        | Retried up to `maxRetries`                       | Not retried                 |
| `429 Too Many Requests`        | Retried, honoring `Retry-After` (capped at 30 s) | Not retried                 |
| `5xx`                          | Retried up to `maxRetries`                       | Not retried                 |
| `401` with recovery configured | One re-auth, then one retry                      | One re-auth, then one retry |
| Other `4xx`                    | Not retried                                      | Not retried                 |

Backoff: `retryDelayMs * 2^(attempt - 1)` plus up to 25% jitter. With the defaults
(`maxRetries: 2`, `retryDelayMs: 500`), a failing `GET` makes three total attempts.

> Because `POST`s are never retried, moderation, chat, and creation operations are not
> automatically idempotent. If you need retry safety, add your own idempotency guard at the
> application level.

### What retries do _not_ cover

- Schema validation failures (retrying would not fix the payload).
- `YptApiError` logical failures.
- Auth failures after the single recovery attempt.

---

## 4. Recovery patterns

### Typed error handling

```ts
import {
  YptAuthError,
  YptApiError,
  YptHttpError,
  YptNetworkError,
  YptValidationError,
} from "ypt-js";

async function listGroupsSafely(ypt: YptJs) {
  try {
    return await ypt.groups.listJoined();
  } catch (error) {
    if (error instanceof YptValidationError) {
      // Programming error or upstream drift.
      throw error;
    }
    if (error instanceof YptAuthError) {
      // Re-authenticate or prompt the user.
      throw error;
    }
    if (error instanceof YptNetworkError) {
      // Safe to retry later with your own backoff.
      return [];
    }
    if (error instanceof YptHttpError) {
      // 5xx may be transient; 4xx is a caller problem.
      throw error;
    }
    if (error instanceof YptApiError) {
      // Business rule rejection.
      throw error;
    }
    throw error;
  }
}
```

### Refresh the session yourself

Automatic recovery covers one `401`. If you want to refresh proactively:

```ts
if (ypt.expiresAt && Date.now() >= ypt.expiresAt * 1000) {
  await ypt.auth.splashLogin();
}
```

`expiresAt` units are whatever upstream returned (the sample payloads use epoch seconds).
Verify the unit for your account before comparing.

### Partial batch failures

`listAllMembers()` isolates per-group failures:

```ts
const result = await ypt.groups.listAllMembers();

for (const failure of result.failedGroups) {
  console.warn("Group failed:", failure.groupId, failure.error);
}
```

If **every** group fails, the method throws the first error instead of returning an empty
result.

### Distinguishing "not found" from failure

`groups.get(id)` returns `null` when the group is not in your joined list. It does not throw
for a valid-but-absent id. Reserve `try/catch` for transport, auth, and validation problems.

### Debugging upstream drift

```ts
catch (error) {
  if (error instanceof YptValidationError && error.target === "response") {
    console.error("Raw payload:", JSON.stringify(error.raw, null, 2));
    console.error("Failed fields:", error.issues.map((i) => i.path.join(".")));
  }
}
```

Do not log raw payloads in production without redacting user ids, nicknames, and tokens.

---

## 5. Error envelope reference

Every YPT response is expected to carry `s` (success boolean), and optionally `c` (code) and
`m` (message).

| Shape                                         | Result                                                              |
| :-------------------------------------------- | :------------------------------------------------------------------ |
| `{ s: true, ... }`                            | Success; resource schema validation runs next                       |
| `{ s: false, c, m }`                          | `YptAuthError` for 112/113/114 or HTTP 401, otherwise `YptApiError` |
| `{ s: false }` without `c`                    | `YptApiError` with `code: undefined`                                |
| Non-object JSON (array, string, number, null) | `YptHttpError`                                                      |
| Empty body                                    | `YptHttpError`                                                      |

The known auth codes are exported:

```ts
import { AUTH_ERROR_CODES } from "ypt-js";
// ReadonlySet<number> { 112, 113, 114 }
```

---

## 6. Operational checklist

- Treat `YptValidationError(target: "response")` as a **library compatibility incident**:
  capture the schema path, open an issue, and avoid retry loops.
- Retry `YptNetworkError` and `5xx` with bounded backoff.
- Never retry a `POST` blindly; check whether the operation is safe to repeat.
- Clear persisted tokens after `logout()`, including in the failure path.
- Redact `authorization`, `token`, `refreshToken`, email addresses, nicknames, and user ids
  from logs.
- Keep `maxRetries` small. The default of `2` is already polite.

---

## Related

- [Authentication](./authentication.md)
- [API reference → Errors](./api-reference.md#8-errors)
- [Troubleshooting](./troubleshooting.md)
