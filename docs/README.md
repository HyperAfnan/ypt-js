# ypt-js Documentation

An **unofficial**, reverse-engineered TypeScript client for the private mobile API of
**Yeolpumta (YPT)** — a study-tracking app built around group accountability, live study
timers, attendance streaks, and leaderboards.

> **Disclaimer**
> This project is not affiliated with, endorsed by, or supported by YPT / TGCLab. It is an
> independent interoperability effort against an undocumented API. Use it responsibly:
> respect the upstream terms of service, keep request volume low, do not scrape personal
> data, and never store credentials or tokens you do not own.

---

## What you get

- **Typed, validated access** to YPT's auth and group APIs through a small `YptJs` client.
- **Dual-token sessions** (`accessToken` + `refreshToken`) with lazy sign-in and transparent
  recovery from one `401`.
- **Zod validation** on both caller input and upstream responses, so bad arguments never hit
  the network and API drift surfaces as a typed error instead of silent `undefined`s.
- **Clean domain models** — upstream minified keys (`dl.sm`, `is_studying`,
  `today_study_seconds`) become idiomatic camelCase properties (`todayStudyMs`,
  `isStudying`, `liveStudyMs`).
- **Live study math** that adds the currently running session to YPT's stored total.
- **Cross-group aggregation** that deduplicates the same person seen in multiple groups.
- **Native `fetch`**, ESM + CommonJS builds, and full `.d.ts` declarations.

---

## Requirements

| Requirement | Detail                                                  |
| :---------- | :------------------------------------------------------ |
| Runtime     | Node.js **18+** (or Bun). Uses global `fetch`.          |
| TypeScript  | Optional, but recommended. Types ship with the package. |
| Module      | ESM (`import`) or CommonJS (`require`).                 |
| Stack       | Zero runtime dependencies except `zod`.                 |

---

## Install

```bash
bun add ypt-js
# or
npm install ypt-js
# or
pnpm add ypt-js
# or
yarn add ypt-js
```

---

## 60-second example

```ts
import { YptJs } from "ypt-js";

const ypt = new YptJs({
  credentials: {
    email: process.env.YPT_EMAIL!,
    password: process.env.YPT_PASSWORD!,
  },
});

// Signs in lazily on the first call.
const groups = await ypt.groups.listJoined();
console.log(groups.map((g) => `${g.id}: ${g.name} (${g.role})`));

// Real-time roster for one group.
const members = await ypt.groups.getMembers(groups[0].id);
for (const member of members) {
  console.log(
    member.nickname,
    member.liveStudyTime,
    member.isStudying ? `studying ${member.currentSubject ?? ""}` : "away",
  );
}
```

No credentials at hand? Every data method also works with a token you already hold:

```ts
const ypt = new YptJs({ token: process.env.YPT_ACCESS_TOKEN });
const groups = await ypt.groups.listJoined();
```

---

## Documentation map

| Guide                                   | Read it when you need to…                                                    |
| :-------------------------------------- | :--------------------------------------------------------------------------- |
| [Getting started](./getting-started.md) | Install, configure the client, understand the three auth strategies.         |
| [Authentication](./authentication.md)   | Sign in, social OAuth, token rotation, session restore, profile operations.  |
| [Groups](./groups.md)                   | Search, create, join, read live rosters, attendance, leaderboards, moderate. |
| [API reference](./api-reference.md)     | Exact signatures, options, types, schemas, exports, and endpoint mapping.    |
| [Error handling](./error-handling.md)   | Understand the error hierarchy, retries, and recovery patterns.              |
| [Architecture](./architecture.md)       | How requests, validation, and upstream→domain mapping work internally.       |
| [Cookbook](./cookbook.md)               | Copy-paste recipes for persistence, polling, proxies, and batch work.        |
| [Troubleshooting](./troubleshooting.md) | Diagnose auth failures, validation errors, timeouts, and API quirks.         |
| [Upstream API](./upstream-api.md)       | The reverse-engineered wire protocol and minified-key glossary.              |
| [Contributing](./contributing.md)       | Set up the repo, add endpoints, run tests, and ship a release.               |

---

## Supported surface

| Area           | Operations                                                                                                                                 |
| :------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**       | Email sign-in, social sign-up (Kakao/Naver/Google/Apple/Facebook), splash-login handshake, refresh-token rotation, session restore, logout |
| **Account**    | Firebase custom token, push-token registration, nickname/username checks, status message                                                   |
| **Groups**     | Public search, joined-group listing, title validation, create, join (open/PIN), apply, review applicants, leave                            |
| **Telemetry**  | Live member roster, per-group attendance matrix, daily/weekly/monthly leaderboards, cross-group unified roster                             |
| **Moderation** | Warn, cancel warning, kick, blacklist, unblacklist, list blacklist                                                                         |
| **Social**     | Nudges (single/all), group chat messages, notices                                                                                          |
| **Utilities**  | `avatarUrl`, `formatDuration`, `mergeMembers`, `validatePassword`, raw→domain mappers                                                      |

Anything not listed here (e.g. reading chat history or study-log history) is **not
implemented** by this client.

---

## Design guarantees

1. **Validate before sending.** Constructor options and method arguments are Zod-validated.
   Invalid input throws `YptValidationError` with `target: "input"` before any network I/O.
2. **Validate on the way back.** Raw responses are checked against lenient schemas that
   tolerate unknown fields. A structurally broken response throws
   `YptValidationError` with `target: "response"` and preserves the raw payload.
3. **Only idempotent retries.** `GET` requests retry on network errors, `429`, and `5xx`.
   `POST` requests are never retried automatically.
4. **One shared re-auth.** Concurrent requests that hit an expired token share a single
   sign-in/refresh operation.
5. **No hidden global state.** Sessions live on the client instance; persistence is entirely
   your responsibility through `onTokenChange` / `onSessionChange`.
6. **Deterministic testing.** Inject `fetch` and `now` to test without network access or
   time-dependent flakes.

---

## Versioning & compatibility

- Package entry points: ESM (`dist/index.js`), CJS (`dist/index.cjs`), and matching `.d.ts`
  / `.d.cts` declarations.
- `YptJs` is the primary class. `YptClient` remains exported as an identical alias.
- The public API follows semantic versioning. Upstream API changes are handled through the
  lenient validation layer; a breaking upstream change may require a minor/patch release.

---

## License

[MIT](../LICENSE) © 2026 HyperAfnan
