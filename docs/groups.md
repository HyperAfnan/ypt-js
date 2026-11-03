# Groups, Telemetry & Moderation

[← Documentation index](./README.md)

This guide covers every group operation in `ypt-js`: discovery, creation, membership,
real-time rosters, attendance, leaderboards, moderation, and social actions.

---

## 1. Concepts

### Group identifiers

All group methods accept `number | string`. Numeric strings are accepted for convenience,
but **non-numeric strings are rejected before any network call**:

```ts
await ypt.groups.getMembers("6814572"); // ✅ converted safely
await ypt.groups.getMembers(6814572); // ✅
await ypt.groups.getMembers("1&countryID=KR"); // ❌ YptValidationError, no request sent
```

### Roles

`Group.role` is derived from the bucket the group arrived in, not from a per-group field:

| Upstream bucket | `Group.role`        |
| :-------------- | :------------------ |
| `ms`            | `"Owner / Manager"` |
| `cs`            | `"Cam Study"`       |
| `gs`            | `"Member"`          |
| `ps`            | `"Member"`          |

If the same group id appears in multiple buckets, the first bucket wins
(`ms` → `cs` → `gs` → `ps`).

### Join types

| Join type    | How to join                                            |
| :----------- | :----------------------------------------------------- |
| `"DIRECT"`   | `join(groupId)` or `join(groupId, { password })`       |
| `"APPROVAL"` | `apply(groupId, { answers })`, then a manager approves |

---

## 2. Discovery

### Search public groups

```ts
const results = await ypt.groups.search({
  q: "Computer Science",
  categoryId: 1,
  orderType: "attendance",
  onlyAvailable: true,
  onlyCam: false,
  onlyOpen: true,
  page: 1,
  limit: 20,
});
```

Endpoint: `GET /group/list/search-2`

| Option          | Type                                                                               | Required | Notes                                  |
| :-------------- | :--------------------------------------------------------------------------------- | :------- | :------------------------------------- |
| `q`             | `string`                                                                           | yes      | Minimum 2 characters after trimming.   |
| `categoryId`    | `number`                                                                           | no       | Positive integer.                      |
| `orderType`     | `"time" \| "attendance" \| "cam" \| "mission" \| "owner" \| "new" \| "promotedAt"` | no       | Sort order.                            |
| `onlyAvailable` | `boolean`                                                                          | no       | Exclude full groups.                   |
| `onlyCam`       | `boolean`                                                                          | no       | Only cam-study rooms.                  |
| `onlyOpen`      | `boolean`                                                                          | no       | Only groups without approval/password. |
| `countryId`     | `string`                                                                           | no       | Regional filter (e.g. `"KR"`).         |
| `lang`          | `string`                                                                           | no       | Language filter.                       |
| `page`          | `number`                                                                           | no       | Positive integer.                      |
| `limit`         | `number`                                                                           | no       | Positive integer.                      |

Result: `SearchGroupResult[]`

```ts
interface SearchGroupResult {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  categoryId: number | null;
  owner: string | null;
  memberCount: number;
  maxCapacity: number;
  isPrivate: boolean;
  hasCam: boolean;
  joinType: "DIRECT" | "APPROVAL";
  averageStudySeconds: number | null;
  attendanceRate: number | null;
}
```

> Pagination is manual. The client does not expose an async iterator or total count.

### List joined groups

```ts
const groups = await ypt.groups.listJoined();
```

Endpoint: `GET /group/groups/v2`

```ts
interface Group {
  id: number;
  name: string;
  category: string | null;
  owner: string | null;
  role: "Owner / Manager" | "Cam Study" | "Member";
  memberCount: number;
  maxCapacity: number;
  isPrivate: boolean;
  notice: string | null;
}
```

### Get one joined group

```ts
const group = await ypt.groups.get(6814572); // Group | null
```

There is no per-group detail endpoint. This validates the id, calls `listJoined()`, and
returns the matching group or `null`.

### Search your joined groups

```ts
const matches = await ypt.groups.searchJoined("python");
```

Case-insensitive, client-side filter over the result of `listJoined()` — matching `id`,
`name`, `category`, and `owner`. An empty/whitespace query returns all joined groups.

> This still performs the `listJoined()` network request; it is not a cached search.

---

## 3. Create a group

### Validate a title first

```ts
const check = await ypt.groups.validateTitle("Midnight Coders");
if (!check.valid) console.error(check.message);
```

Endpoint: `POST /group/make/title/validate`

### Create

```ts
const created = await ypt.groups.create({
  title: "Midnight Coders",
  categoryId: 1,
  description: "Focused study group for nocturnal programmers.",
  maxPeopleNum: 30,
  joinType: "DIRECT",
  minDailyStudySeconds: 14_400,
  allowChat: true,
});

console.log(created.id, created.title);
```

Endpoint: `POST /group/make/v2`

| Field                  | Type                     | Default    | Validation / notes                       |
| :--------------------- | :----------------------- | :--------- | :--------------------------------------- |
| `title`                | `string`                 | —          | Trimmed, non-empty.                      |
| `categoryId`           | `number`                 | —          | Positive integer.                        |
| `description`          | `string`                 | `""`       |                                          |
| `maxPeopleNum`         | `number`                 | `50`       | Between 2 and 100.                       |
| `joinType`             | `"DIRECT" \| "APPROVAL"` | `"DIRECT"` |                                          |
| `password`             | `string \| null`         | `null`     | Sent for PIN-protected direct groups.    |
| `minDailyStudySeconds` | `number`                 | —          | Non-negative integer.                    |
| `questions`            | `string[]`               | —          | Screening questions for approval groups. |
| `allowChat`            | `boolean`                | `true`     |                                          |

The returned `id` is `0` if the upstream response omits both `id` and `group_id`; check it
before using it.

### PIN-protected group

```ts
await ypt.groups.create({
  title: "Private Study Room",
  categoryId: 1,
  maxPeopleNum: 10,
  joinType: "DIRECT",
  password: "secretpassword123",
});
```

### Approval-based group

```ts
await ypt.groups.create({
  title: "Med School Prep",
  categoryId: 5,
  maxPeopleNum: 25,
  joinType: "APPROVAL",
  questions: ["What is your target exam date?", "How many hours can you commit daily?"],
});
```

---

## 4. Membership

### Join an open or PIN-protected group

```ts
await ypt.groups.join(6814572);
await ypt.groups.join(6814572, { password: "secretpassword123" });
```

Endpoint: `POST /group/join/v2`

### Apply to an approval group

```ts
await ypt.groups.apply(6814572, {
  answers: ["December 2026", "Six hours daily, mostly pathology"],
});
```

Endpoint: `POST /group/group-user/join-info`

`answers` must contain at least one entry.

### Review an applicant (manager/owner)

```ts
await ypt.groups.reviewApplicant(6814572, {
  applicantUserId: 16_300_695,
  approved: true,
});

await ypt.groups.reviewApplicant(6814572, {
  applicantUserId: 19_482_103,
  approved: false,
  rejectReason: "Group is at capacity.",
});
```

Endpoint: `POST /group/group-user/join/approve-or-reject`

### Leave

```ts
await ypt.groups.leave(6814572);
await ypt.groups.leave(6814572, 19_482_103); // optional userId
```

Endpoint: `POST /group/leave`

---

## 5. Live roster & real-time telemetry

```ts
const members = await ypt.groups.getMembers(6814572, {
  includeAllUsers: true, // include offline/inactive members
});
```

Endpoint: `GET /logs/group/members/v2?groupID=<id>&include_all_users=<bool>`

> `countryID` is **never sent** by this client. Passing it upstream can produce an
> `HTTP 500`; the method deliberately does not expose it.

### `GroupMember` fields

| Field              | Type                                          | Meaning                                                               |
| :----------------- | :-------------------------------------------- | :-------------------------------------------------------------------- |
| `userId`           | `number`                                      | YPT user id. Records without one are skipped.                         |
| `nickname`         | `string`                                      | Display name.                                                         |
| `category`         | `string \| null`                              | Legacy member category.                                               |
| `isStudying`       | `boolean`                                     | Currently in a running session.                                       |
| `isPaused`         | `boolean`                                     | Session paused (`ia` / `ip`).                                         |
| `currentSubject`   | `string \| null`                              | Subject name, when available.                                         |
| `subjectDetails`   | `{ id, name, color? }?`                       | Present only when upstream sends a subject object.                    |
| `studyDate`        | `string \| null`                              | Group-local study date (`YYYY-MM-DD`).                                |
| `lastActiveDate`   | `string \| null`                              | Last activity date (`YYYY-MM-DD`).                                    |
| `todayStudyMs`     | `number`                                      | Study milliseconds YPT has recorded today (excludes running session). |
| `todayStudyTime`   | `string`                                      | `todayStudyMs` formatted as `HH:MM:SS`.                               |
| `liveStudyMs`      | `number`                                      | `todayStudyMs` + elapsed time in the current session.                 |
| `liveStudyTime`    | `string`                                      | `liveStudyMs` formatted as `HH:MM:SS`.                                |
| `sessionStartMs`   | `number \| null`                              | Session start (epoch ms), from `ss` or parsed `st`.                   |
| `sessionElapsedMs` | `number`                                      | `now - sessionStartMs` when studying, otherwise `0`.                  |
| `studiconId`       | `number \| null`                              | Default avatar id.                                                    |
| `hasCustomAvatar`  | `boolean`                                     | Whether a custom profile image exists.                                |
| `avatarUrl`        | `string \| null`                              | Resolved avatar URL.                                                  |
| `role`             | `"OWNER" \| "MANAGER" \| "MEMBER"` (asserted) | Modern payloads only.                                                 |
| `stateIcon`        | `string \| undefined`                         | Modern status icon (e.g. `"flame"`).                                  |
| `profileImage`     | `string \| undefined`                         | Modern profile image URL.                                             |
| `hasActiveCam`     | `boolean \| undefined`                        | Cam-study room metadata.                                              |
| `camSnapshotUrl`   | `string \| null \| undefined`                 | Cam snapshot URL.                                                     |
| `warningCount`     | `number \| undefined`                         | Warning strikes, when reported.                                       |

### How live time is computed

```
sessionElapsedMs =
  isStudying && sessionStartMs !== null && now > sessionStartMs
    ? now - sessionStartMs
    : 0

liveStudyMs = todayStudyMs + sessionElapsedMs
```

- The clock is `options.now` (default `Date.now`), so tests can freeze time.
- A future session start or a missing start yields no elapsed time.
- `todayStudyMs` is `today_study_seconds * 1000` for modern payloads, or `dl.sm` directly for
  legacy payloads. Both are clamped to `>= 0`.

### Field precedence

**Subject**

1. `current_subject.name` (object, also fills `subjectDetails`)
2. `current_subject` (string)
3. `dl.sn`, then `dl.sb`, then `dl.tt`

**Avatar**

1. Modern `profile_image`
2. Custom avatar → `<cdn>/user/profile/<userId>.jpg`
3. Studicon → `<cdn>/sc.v2/<studiconId>/normal1.png`
4. `null`

**Pause**

`isPaused` is `true` when either `dl.ia` or `dl.ip` is truthy. `isStudying` comes from modern
`is_studying` when present, otherwise `dl.is`.

### Legacy vs modern payloads

```json
// Legacy: times in milliseconds
{ "ms": [{ "ud": 1, "n": "A", "dl": { "sm": 14400000, "is": true, "ss": 1773456000000 } }] }

// Modern: times in seconds, richer metadata
{
  "members": [
    {
      "user_id": 1,
      "nickname": "A",
      "is_studying": true,
      "today_study_seconds": 14400,
      "current_subject": { "id": 10, "name": "Math", "color": "#FF5733" }
    }
  ]
}
```

Both normalize to the same `GroupMember`. Malformed records (missing ids, `null`) are
skipped rather than failing the whole roster.

> `role` is a type assertion over the upstream string, not a validated enum. Treat unknown
> values defensively if you branch on it.

---

## 6. Cross-group unified roster

```ts
const result = await ypt.groups.listAllMembers({ concurrency: 3 });

console.log(result.uniqueMemberCount);
console.log(result.duplicatesRemoved);
console.log(result.members[0].nickname, result.members[0].liveStudyTime);
```

1. Calls `listJoined()`.
2. Fetches each group's members with at most `concurrency` requests in flight (default `3`).
3. Merges users who appear in multiple groups.
4. Sorts by `liveStudyMs`, descending.

```ts
interface UnifiedMember extends GroupMember {
  groupIds: number[];
  groupNames: string[];
}

interface UnifiedMembersResult {
  members: UnifiedMember[];
  totalGroups: number;
  successfulGroups: number;
  failedGroups: Array<{ groupId: number; error: unknown }>;
  totalRawMembers: number;
  uniqueMemberCount: number;
  duplicatesRemoved: number;
}
```

### Merge rules

- **Session telemetry** (`isStudying`, `isPaused`, subject, session start) comes from the
  entry that is actively studying and not paused. If neither or both are active, the entry
  with the larger `liveStudyMs` wins.
- **`todayStudyMs` / `liveStudyMs`** are the **maximum** observed across groups. This
  protects against YPT intermittently reporting `0` for one group while another has the
  real value.
- `groupIds` / `groupNames` accumulate every group the user was seen in.
- A failed group is reported in `failedGroups` and does not abort the rest. If **every**
  group fails, the first error is thrown.

> Default concurrency is intentionally low (`3`). Raising it increases the chance of
> upstream throttling.

---

## 7. Attendance

```ts
const attendance = await ypt.groups.getAttendances(6814572, "2026-10-01", "2026-10-07");
```

Endpoint: `GET /logs/v70701/group/attendances?group_id=<id>&startDate=…&endDate=…`

```ts
interface GroupAttendanceResult {
  startDate: string;
  endDate: string;
  attendances: Array<{
    userId: number;
    nickname: string;
    days: Array<{ date: string; studySeconds: number; passed: boolean }>;
    streakDays?: number;
    totalSeconds?: number;
  }>;
}
```

- Dates are passed through as strings; use `YYYY-MM-DD` group-local dates.
- The client does not validate the range or reassemble missing days.

---

## 8. Leaderboards

```ts
const daily = await ypt.groups.getLeaderboard(6814572); // default "daily"
const weekly = await ypt.groups.getLeaderboard(6814572, "weekly");
const monthly = await ypt.groups.getLeaderboard(6814572, "monthly");
```

Endpoint: `GET /logs/group/member/ranks?group_id=<id>&type=<type>`

Supported types: `"daily" | "weekly" | "monthly"`. There is no `"total"` member in the
TypeScript union.

```ts
interface GroupLeaderboardResult {
  type: LeaderboardType;
  ranks: Array<{
    rank: number;
    userId: number;
    nickname: string;
    studySeconds: number;
    studyTime: string; // formatted HH:MM:SS
    profileImage: string | null;
  }>;
}
```

---

## 9. Moderation

All moderation operations require the appropriate group role (owner/manager). The client does
not pre-check permissions — upstream rejects unauthorized calls.

| Operation             | Method                             | Endpoint                   |
| :-------------------- | :--------------------------------- | :------------------------- |
| Warn member           | `warnMember(groupId, userId)`      | `POST /group/warn`         |
| Cancel warning        | `cancelWarning(groupId, userId)`   | `POST /group/warn/cancel`  |
| Kick member           | `kickMember(groupId, userId)`      | `POST /group/kick-out`     |
| Blacklist member      | `blacklistMember(groupId, userId)` | `POST /group/black/add`    |
| Remove from blacklist | `removeBlacklist(groupId, userId)` | `POST /group/black/delete` |
| List blacklist        | `listBlacklist(groupId)`           | `GET /group/black/all`     |

```ts
await ypt.groups.warnMember(6814572, 19_482_103);
await ypt.groups.kickMember(6814572, 19_482_103);
await ypt.groups.blacklistMember(6814572, 19_482_103);

const banned = await ypt.groups.listBlacklist(6814572);
// [{ userId, nickname, createdAt }]
```

---

## 10. Social actions

### Nudges

```ts
await ypt.groups.nudge(6814572, 19_482_103); // one member
await ypt.groups.nudgeAll(6814572); // all inactive members (manager/owner)
```

Endpoints: `POST /group/push/shake`, `POST /group/push/shake/all`

### Chat

```ts
await ypt.groups.sendChatMessage(6814572, "Let's crush today's goals!", {
  imageUrls: ["https://example.com/notes.png"],
});
```

Endpoint: `POST /group/chat`

The message is trimmed and must be non-empty. `imageUrls` defaults to `[]`.

### Notice

```ts
await ypt.groups.postNotice(6814572, "Study sprint starts Saturday at 10:00.", {
  sendPush: true, // default
});
```

Endpoint: `POST /group/notice`

The content is trimmed and must be non-empty.

---

## 11. Upstream quirks & operational guidance

1. **Never send `countryID` to `/logs/group/members/v2`.** It can make the upstream return
   `HTTP 500`. This client never includes it.
2. **Flapping zero study time.** YPT sometimes reports `todayStudyMs = 0` for an active user
   in one group. Prefer `listAllMembers()` (which takes the max across groups) when accuracy
   matters.
3. **Group-local date rollover.** Attendance and "today" are based on the group's timezone,
   not UTC. Use `studyDate` rather than computing the date yourself.
4. **Keep concurrency low.** The default `3` for `listAllMembers()` is deliberate. `429`
   responses are retried on `GET` honoring `Retry-After` (capped at 30s), but you should
   still avoid bursts.
5. **No bulk endpoints.** Moderation and chat are one call per target.
6. **No chat/log read APIs.** This client only sends chat messages; it does not read history.

---

## Related

- [Authentication](./authentication.md)
- [API reference → GroupsResource](./api-reference.md#4-groupsresource-clientgroups)
- [Cookbook](./cookbook.md)
- [Upstream API catalog](./upstream-api.md)
