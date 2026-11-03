# Cookbook

[← Documentation index](./README.md)

Copy-paste recipes for common production tasks. Examples assume Node.js 18+ unless noted.
Adapt storage, logging, and scheduling to your environment.

---

## 1. Persist and restore a session

Tokens live in memory. Persist them yourself through `onTokenChange`, and restore them at
startup.

```ts
import { chmod, readFile, writeFile } from "node:fs/promises";
import { YptJs } from "ypt-js";

const TOKEN_FILE = "/var/lib/myapp/ypt-session.json";

interface SavedTokens {
  accessToken?: string;
  refreshToken?: string;
}

async function loadTokens(): Promise<SavedTokens> {
  try {
    return JSON.parse(await readFile(TOKEN_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveTokens(tokens: SavedTokens): Promise<void> {
  await writeFile(TOKEN_FILE, JSON.stringify(tokens), { mode: 0o600 });
  await chmod(TOKEN_FILE, 0o600);
}

const saved = await loadTokens();

const ypt = new YptJs({
  token: saved.accessToken,
  refreshToken: saved.refreshToken,
  onTokenChange: (accessToken, refreshToken) => {
    void saveTokens({ accessToken, refreshToken });
  },
});

// Explicit restore gives you a clear startup failure point.
if (saved.refreshToken) {
  try {
    await ypt.auth.restoreSession(saved.refreshToken);
  } catch {
    // Refresh token expired/revoked: fall back to interactive login.
  }
}
```

> In production, encrypt the refresh token at rest (KMS, OS keychain, secret manager) and
> restrict file permissions. The JSON file above is the minimal version.

---

## 2. Bootstrap with credentials and persist rotations

```ts
import { YptJs } from "ypt-js";

const ypt = new YptJs({
  credentials: {
    email: process.env.YPT_EMAIL!,
    password: process.env.YPT_PASSWORD!,
  },
  onTokenChange: (accessToken, refreshToken) => saveTokens({ accessToken, refreshToken }),
});

// First call signs in lazily.
await ypt.groups.listJoined();
```

Each rotation (initial sign-in, splash handshake, 401 recovery) fires the callback, so the
saved refresh token stays current.

---

## 3. Poll a live roster with change detection

```ts
import type { GroupMember, YptJs } from "ypt-js";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export async function pollRoster(
  ypt: YptJs,
  groupId: number,
  signal: AbortSignal,
  intervalMs = 30_000,
): Promise<void> {
  let previous = new Map<number, string>();

  while (!signal.aborted) {
    const members = await ypt.groups.getMembers(groupId);
    const current = new Map<number, string>(
      members.map((m) => [m.userId, `${m.isStudying}:${m.isPaused}:${m.currentSubject ?? ""}`]),
    );

    for (const member of members) {
      const before = previous.get(member.userId);
      const now = current.get(member.userId);
      if (before !== undefined && before !== now) {
        console.log(`${member.nickname} changed state → ${now}`);
      }
    }

    previous = current;
    await sleep(intervalMs, signal);
  }
}
```

Use one poller per group, keep intervals conservative (30–60 s), and stop with an
`AbortController`.

---

## 4. Cross-group leaderboard with partial failures

```ts
import { YptJs } from "ypt-js";

const ypt = new YptJs({ credentials });

try {
  const result = await ypt.groups.listAllMembers({ concurrency: 2 });

  for (const member of result.members.slice(0, 10)) {
    console.log(
      `#${member.nickname} ${member.liveStudyTime} ` +
        `(${member.groupNames.length} group${member.groupNames.length === 1 ? "" : "s"})`,
    );
  }

  console.table(
    result.failedGroups.map((f) => ({
      groupId: f.groupId,
      error: f.error instanceof Error ? f.error.message : String(f.error),
    })),
  );
} catch (error) {
  // Only thrown when every group failed.
  console.error("Entire roster fetch failed", error);
}
```

`duplicatesRemoved` tells you how much cross-group overlap there was; `uniqueMemberCount`
is the size of the merged leaderboard.

---

## 5. Moderate many members without aborting the batch

```ts
const targets = [19_482_103, 16_300_695, 20_112_884];

const results = await Promise.allSettled(
  targets.map((userId) => ypt.groups.warnMember(groupId, userId)),
);

for (let i = 0; i < results.length; i++) {
  const result = results[i];
  if (result.status === "rejected") {
    console.error("Failed to warn", targets[i], result.reason);
  }
}
```

> `POST` requests are never retried automatically. If you retry manually, make sure the
> operation is safe to repeat (a duplicate warning is a real side effect).

---

## 6. Paginate public group search

The API has no total count exposed by the client, so page until a short page.

```ts
import type { SearchGroupResult, YptJs } from "ypt-js";

async function searchAllPages(ypt: YptJs, q: string, pageSize = 20, maxPages = 10) {
  const seen = new Map<number, SearchGroupResult>();

  for (let page = 1; page <= maxPages; page++) {
    const batch = await ypt.groups.search({ q, page, limit: pageSize, onlyAvailable: true });
    for (const group of batch) seen.set(group.id, group);
    if (batch.length < pageSize) break;
  }

  return [...seen.values()];
}
```

Deduplicate by `id` in case the upstream shifts results between pages.

---

## 7. Add logging without leaking secrets

```ts
const ypt = new YptJs({
  credentials,
  fetch: async (input, init) => {
    const started = performance.now();
    const response = await fetch(input, init);
    const url = new URL(input);

    console.info(
      JSON.stringify({
        method: init?.method ?? "GET",
        path: url.pathname,
        status: response.status,
        ms: Math.round(performance.now() - started),
        // Never log headers, bodies, query tokens, or user identifiers.
      }),
    );

    return response;
  },
});
```

For a proxy or custom agent, wrap your own fetch implementation:

```ts
import { ProxyAgent, fetch as undiciFetch } from "undici";

const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY!);

const ypt = new YptJs({
  fetch: (input, init) =>
    undiciFetch(input, { ...init, dispatcher } as Parameters<typeof undiciFetch>[1]),
});
```

---

## 8. Deterministic tests with a scripted fetch

```ts
import { expect, test } from "vitest";
import { YptJs } from "ypt-js";

test("lists joined groups", async () => {
  const calls: URL[] = [];

  const ypt = new YptJs({
    token: "test-token",
    fetch: async (input) => {
      calls.push(new URL(input));
      return new Response(
        JSON.stringify({ s: true, ms: [], cs: [], gs: [{ id: 1, t: "Study" }], ps: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const groups = await ypt.groups.listJoined();

  expect(calls[0].pathname).toBe("/group/groups/v2");
  expect(groups).toEqual([
    {
      id: 1,
      name: "Study",
      category: null,
      owner: null,
      role: "Member",
      memberCount: 0,
      maxCapacity: 0,
      isPrivate: false,
      notice: null,
    },
  ]);
});
```

Freeze time for live calculations with `now`:

```ts
const ypt = new YptJs({ token, now: () => 1_773_456_900_000 });
```

---

## 9. Build an attendance summary

```ts
async function attendanceSummary(ypt: YptJs, groupId: number, start: string, end: string) {
  const matrix = await ypt.groups.getAttendances(groupId, start, end);

  return matrix.attendances
    .map((member) => {
      const totalSeconds =
        member.totalSeconds ?? member.days.reduce((sum, day) => sum + day.studySeconds, 0);
      const passedDays = member.days.filter((d) => d.passed).length;

      return {
        userId: member.userId,
        nickname: member.nickname,
        totalHours: Math.round((totalSeconds / 3600) * 10) / 10,
        passedDays,
        totalDays: member.days.length,
        streakDays: member.streakDays ?? 0,
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours);
}
```

---

## 10. Run one client per user

`YptJs` holds a single session. For a multi-tenant service, keep a client per authenticated
user rather than mutating tokens on a shared instance.

```ts
const clients = new Map<string, YptJs>();

function clientFor(userKey: string, tokens: SavedTokens): YptJs {
  let client = clients.get(userKey);
  if (!client) {
    client = new YptJs({
      ...tokens,
      onTokenChange: (accessToken, refreshToken) =>
        saveTokensForUser(userKey, { accessToken, refreshToken }),
    });
    clients.set(userKey, client);
  }
  return client;
}

async function saveTokensForUser(userKey: string, tokens: SavedTokens): Promise<void> {
  await saveTokens(tokens); // replace with per-user storage keyed by userKey
}
```

Remember to evict idle clients; each one retains its credentials in memory if supplied.

---

## 11. Graceful shutdown

```ts
const controller = new AbortController();

process.once("SIGTERM", () => {
  controller.abort();
});

await pollRoster(ypt, groupId, controller.signal);
```

Since the client uses `fetch` with `AbortSignal.timeout`, wrapping your own polling loop in
an abortable signal is the cleanest way to stop background work.

---

## Related

- [Authentication](./authentication.md)
- [Groups](./groups.md)
- [Error handling](./error-handling.md)
- [Troubleshooting](./troubleshooting.md)
