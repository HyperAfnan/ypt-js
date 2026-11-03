# API Reference

[← Documentation index](./README.md)

Complete reference for the public surface of `ypt-js`. Every signature below matches
`src/index.ts` in the shipped package.

- [Entry points & exports](#1-entry-points--exports)
- [`YptJs` client](#2-yptjs-client)
- [`AuthResource` (`client.auth`)](#3-authresource-clientauth)
- [`GroupsResource` (`client.groups`)](#4-groupsresource-clientgroups)
- [Types](#5-types)
- [Utilities](#6-utilities)
- [Validation schemas](#7-validation-schemas)
- [Errors](#8-errors)
- [HTTP & retry semantics](#9-http--retry-semantics)

---

## 1. Entry points & exports

```ts
import {
  YptJs,
  YptClient, // identical alias of YptJs
  YptError,
  YptApiError,
  YptAuthError,
  YptHttpError,
  YptNetworkError,
  YptValidationError,
  AUTH_ERROR_CODES,
  avatarUrl,
  formatDuration,
  mergeMembers,
  validatePassword,
  mapUser,
  mapGroups,
  mapMembers,
  mapMember,
  mapSearchGroups,
  mapAttendances,
  mapLeaderboard,
} from "ypt-js";
```

Type-only exports are listed in [Types](#5-types). All Zod schemas are exported as values —
see [Validation schemas](#7-validation-schemas).

---

## 2. `YptJs` client

```ts
class YptJs {
  constructor(options?: YptJsOptions);

  readonly auth: AuthResource;
  readonly groups: GroupsResource;

  get token(): string | undefined;
  get accessToken(): string | undefined;
  get refreshToken(): string | undefined;
  get expiresAt(): number | undefined;
  get isAuthenticated(): boolean;
  get user(): YptUser | undefined;

  setToken(token: string): void;
  setSession(tokens: { accessToken: string; refreshToken?: string; expiresAt?: number }): void;
}
```

The constructor validates `options` with Zod and throws `YptValidationError` on invalid
values (bad URL, negative timeout, invalid credentials, unsupported `authScheme`, …). It
performs no network I/O.

### `YptJsOptions`

| Option            | Type                                             | Default                       | Description                                           |
| :---------------- | :----------------------------------------------- | :---------------------------- | :---------------------------------------------------- |
| `token`           | `string`                                         | —                             | Existing access token/JWT.                            |
| `refreshToken`    | `string`                                         | —                             | Refresh token for rotation and restore.               |
| `expiresAt`       | `number`                                         | —                             | Expiry timestamp (stored, not enforced).              |
| `credentials`     | `{ email: string; password: string }`            | —                             | Enables lazy sign-in and 401 recovery.                |
| `onTokenChange`   | `(token: string, refreshToken?: string) => void` | —                             | Fired whenever the access token changes.              |
| `onSessionChange` | `(session: SessionInfo) => void`                 | —                             | Fired with a full session snapshot.                   |
| `authScheme`      | `"JWT" \| "Bearer"`                              | `"JWT"`                       | Authorization header scheme.                          |
| `baseUrl`         | `string`                                         | `"https://pi.tgclab.com"`     | API base URL.                                         |
| `cdnUrl`          | `string`                                         | `"https://alicdn.tgclab.com"` | CDN base for avatars.                                 |
| `userAgent`       | `string`                                         | `"Dart/3.11 (dart:io)"`       | `User-Agent` header.                                  |
| `headers`         | `Record<string, string>`                         | `{}`                          | Extra headers, merged last.                           |
| `timeoutMs`       | `number`                                         | `15000`                       | Request timeout; `0` disables.                        |
| `maxRetries`      | `number`                                         | `2`                           | Extra `GET` attempts on network/`429`/`5xx` failures. |
| `retryDelayMs`    | `number`                                         | `500`                         | Backoff base.                                         |
| `language`        | `string`                                         | `"en"`                        | `language` sent to YPT.                               |
| `device`          | `Partial<SplashDevice>`                          | see below                     | Splash-login device overrides.                        |
| `fetch`           | `FetchLike`                                      | `globalThis.fetch`            | Custom fetch implementation.                          |
| `now`             | `() => number`                                   | `Date.now`                    | Clock for live study math.                            |

`YptClientOptions` is an alias of `YptJsOptions`. `YptClient` is an alias of `YptJs`.

### Getters

| Getter            | Returns                | Notes                                  |
| :---------------- | :--------------------- | :------------------------------------- |
| `token`           | `string \| undefined`  | Legacy alias of the access token.      |
| `accessToken`     | `string \| undefined`  | Current access token.                  |
| `refreshToken`    | `string \| undefined`  | Current refresh token.                 |
| `expiresAt`       | `number \| undefined`  | Last known expiry.                     |
| `isAuthenticated` | `boolean`              | True when any token is held.           |
| `user`            | `YptUser \| undefined` | Set by sign-in/social/restore mapping. |

### Methods

| Method          | Behavior                                                                         |
| :-------------- | :------------------------------------------------------------------------------- |
| `setToken(t)`   | Sets the access token, then fires `onTokenChange` and `onSessionChange`.         |
| `setSession(s)` | Sets access token plus optional refresh token/expiry, then fires both callbacks. |

Both methods do not validate the token format and do not perform network calls.

### `SessionInfo`

```ts
interface SessionInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: YptUser;
}
```

---

## 3. `AuthResource` (`client.auth`)

```ts
class AuthResource {
  signIn(params: SignInParams, options?: SignInOptions): Promise<YptUser>;
  socialSignUp(params: SocialSignUpParams, options?: SignInOptions): Promise<YptUser>;
  splashLogin(params?: SplashLoginParams | Partial<SplashDevice>): Promise<SplashLoginResult>;
  restoreSession(refreshToken: string, device?: Partial<SplashDevice>): Promise<SplashLoginResult>;
  getFirebaseCustomToken(): Promise<string>;
  registerPushToken(token: string): Promise<void>;
  logout(): Promise<void>;
  checkUsername(nickname: string): Promise<boolean>;
  updateNickname(nickname: string): Promise<void>;
  updateStatusMessage(statusMsg: string): Promise<void>;
}
```

### `signIn`

```ts
signIn(
  params: { email: string; password: string },
  options?: { splash?: boolean; strictPasswordValidation?: boolean },
): Promise<YptUser>
```

- **Endpoint:** `POST /user/sign-in-jwt`, `Authorization: JWT` (bare).
- **Defaults:** `splash: true`, `strictPasswordValidation: false`.
- **Validates:** email format; non-empty password; optional password rules.
- **Stores:** access token, refresh token, expiry, mapped user.
- **Throws:** `YptValidationError` (input), `YptAuthError` (codes 112/113/114 or 401),
  `YptApiError` (other envelope errors or a missing token), `YptHttpError`,
  `YptNetworkError`.

```ts
const user = await ypt.auth.signIn(
  { email: "user@example.com", password: "Secret123!" },
  { strictPasswordValidation: true },
);
```

### `socialSignUp`

```ts
socialSignUp(
  params: {
    provider: "KAKAO" | "NAVER" | "GOOGLE" | "APPLE" | "FACEBOOK";
    token: string;
    nickname: string;
    operatingSystem?: "android" | "ios";
    terms?: boolean;
    privacy?: boolean;
    ageOver14?: boolean;
  },
  options?: { splash?: boolean; strictPasswordValidation?: boolean },
): Promise<YptUser>
```

- **Endpoint:** `POST /user/social/sign-up-jwt`, bare auth.
- **Defaults:** `operatingSystem: "android"`, `terms/privacy/ageOver14: true`, `splash: true`.
- **Body keys:** `provider`, `token`, `nickname`, `operatingSystem`, `terms`, `privacy`,
  `age_over_14`.
- Fills `user.socialType` from `provider` when the response omits it.

### `splashLogin`

```ts
splashLogin(
  params?: { refreshToken?: string; device?: Partial<SplashDevice> } | Partial<SplashDevice>,
): Promise<SplashLoginResult>
```

- **Endpoint:** `POST /user/v2/splash-login`.
- **Auth:** `JWT <token>` when a token exists, otherwise bare `JWT`.
- **Body:** device defaults merged with overrides, `language`, and `refreshToken` when
  available.
- **Side effect:** stores a returned `accessToken` and rotates `refreshToken`.
- **Does not throw** when no token is returned.

```ts
interface SplashLoginResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}
```

### `restoreSession`

```ts
restoreSession(refreshToken: string, device?: Partial<SplashDevice>): Promise<SplashLoginResult>
```

- Validates `refreshToken` is a non-empty string (`YptValidationError` otherwise).
- Stores it and calls `splashLogin({ refreshToken, device })`.
- Throws `YptAuthError` if no access token is obtained.

### `getFirebaseCustomToken`

```ts
getFirebaseCustomToken(): Promise<string>
```

- **Endpoint:** `POST /user/firebase/custom-token` (authenticated).
- Returns the first non-empty of `token`, `customToken`, `firebaseCustomToken`.
- Throws `YptApiError` when none is present, or `YptValidationError` for a malformed body.

### `registerPushToken`

```ts
registerPushToken(token: string): Promise<void>
```

- **Endpoint:** `POST /user/push-token`.
- **Body:** `{ token, pushToken }`.
- Rejects empty/non-string input with `YptValidationError`.

### `logout`

```ts
logout(): Promise<void>
```

- Calls `POST /user/logout`, then clears access token, refresh token, expiry, and user in a
  `finally` block.
- Local state is cleared even if the request fails.
- Does **not** fire `onTokenChange` / `onSessionChange`; clear persisted tokens yourself.

### `checkUsername`

```ts
checkUsername(nickname: string): Promise<boolean>
```

- **Endpoint:** `POST /user/exist-username`.
- Returns `Boolean(exist ?? isExist)`.
- Rejects empty input with `YptValidationError`.

### `updateNickname`

```ts
updateNickname(nickname: string): Promise<void>
```

- **Endpoint:** `POST /user/nickname/change`.
- Trims the input; updates `client.user.nickname` on success.

### `updateStatusMessage`

```ts
updateStatusMessage(statusMsg: string): Promise<void>
```

- **Endpoint:** `POST /user/status_msg/change`.
- Sends both `status_msg` and `statusMsg`; updates `client.user.statusMsg` on success.

---

## 4. `GroupsResource` (`client.groups`)

```ts
class GroupsResource {
  search(options: SearchGroupsOptions): Promise<SearchGroupResult[]>;
  listJoined(): Promise<Group[]>;
  get(groupId: number | string): Promise<Group | null>;
  searchJoined(query: string): Promise<Group[]>;
  validateTitle(title: string): Promise<ValidateTitleResult>;
  create(params: CreateGroupParams): Promise<{ id: number; title: string }>;
  join(groupId: number | string, options?: JoinGroupOptions): Promise<void>;
  apply(groupId: number | string, params: ApplyGroupParams): Promise<void>;
  reviewApplicant(groupId: number | string, params: ReviewApplicantParams): Promise<void>;
  leave(groupId: number | string, userId?: number): Promise<void>;
  warnMember(groupId: number | string, userId: number): Promise<void>;
  cancelWarning(groupId: number | string, userId: number): Promise<void>;
  kickMember(groupId: number | string, userId: number): Promise<void>;
  blacklistMember(groupId: number | string, userId: number): Promise<void>;
  removeBlacklist(groupId: number | string, userId: number): Promise<void>;
  listBlacklist(groupId: number | string): Promise<BlacklistUser[]>;
  getMembers(groupId: number | string, options?: GetMembersOptions): Promise<GroupMember[]>;
  getAttendances(
    groupId: number | string,
    startDate: string,
    endDate: string,
  ): Promise<GroupAttendanceResult>;
  getLeaderboard(groupId: number | string, type?: LeaderboardType): Promise<GroupLeaderboardResult>;
  nudge(groupId: number | string, targetUserId: number): Promise<void>;
  nudgeAll(groupId: number | string): Promise<void>;
  sendChatMessage(
    groupId: number | string,
    message: string,
    options?: SendChatOptions,
  ): Promise<void>;
  postNotice(groupId: number | string, content: string, options?: PostNoticeOptions): Promise<void>;
  listAllMembers(options?: ListAllMembersOptions): Promise<UnifiedMembersResult>;
}
```

`groupId` accepts a positive integer or a numeric string. Non-numeric strings throw
`YptValidationError` before any request.

### Method summary

| Method                                        | Endpoint                                        | Returns                  |
| :-------------------------------------------- | :---------------------------------------------- | :----------------------- |
| `search(options)`                             | `GET /group/list/search-2`                      | `SearchGroupResult[]`    |
| `listJoined()`                                | `GET /group/groups/v2`                          | `Group[]`                |
| `get(groupId)`                                | `GET /group/groups/v2`                          | `Group \| null`          |
| `searchJoined(query)`                         | `GET /group/groups/v2`                          | `Group[]`                |
| `validateTitle(title)`                        | `POST /group/make/title/validate`               | `ValidateTitleResult`    |
| `create(params)`                              | `POST /group/make/v2`                           | `{ id, title }`          |
| `join(groupId, options?)`                     | `POST /group/join/v2`                           | `void`                   |
| `apply(groupId, params)`                      | `POST /group/group-user/join-info`              | `void`                   |
| `reviewApplicant(groupId, params)`            | `POST /group/group-user/join/approve-or-reject` | `void`                   |
| `leave(groupId, userId?)`                     | `POST /group/leave`                             | `void`                   |
| `warnMember(groupId, userId)`                 | `POST /group/warn`                              | `void`                   |
| `cancelWarning(groupId, userId)`              | `POST /group/warn/cancel`                       | `void`                   |
| `kickMember(groupId, userId)`                 | `POST /group/kick-out`                          | `void`                   |
| `blacklistMember(groupId, userId)`            | `POST /group/black/add`                         | `void`                   |
| `removeBlacklist(groupId, userId)`            | `POST /group/black/delete`                      | `void`                   |
| `listBlacklist(groupId)`                      | `GET /group/black/all`                          | `BlacklistUser[]`        |
| `getMembers(groupId, options?)`               | `GET /logs/group/members/v2`                    | `GroupMember[]`          |
| `getAttendances(groupId, start, end)`         | `GET /logs/v70701/group/attendances`            | `GroupAttendanceResult`  |
| `getLeaderboard(groupId, type?)`              | `GET /logs/group/member/ranks`                  | `GroupLeaderboardResult` |
| `nudge(groupId, targetUserId)`                | `POST /group/push/shake`                        | `void`                   |
| `nudgeAll(groupId)`                           | `POST /group/push/shake/all`                    | `void`                   |
| `sendChatMessage(groupId, message, options?)` | `POST /group/chat`                              | `void`                   |
| `postNotice(groupId, content, options?)`      | `POST /group/notice`                            | `void`                   |
| `listAllMembers(options?)`                    | `GET /group/groups/v2` + per-group members      | `UnifiedMembersResult`   |

### Parameter details

#### `search(options: SearchGroupsOptions)`

| Field                                  | Required | Constraint           |
| :------------------------------------- | :------- | :------------------- |
| `q`                                    | yes      | Trimmed, min 2 chars |
| `categoryId`                           | no       | Positive integer     |
| `orderType`                            | no       | See `GroupOrderType` |
| `onlyAvailable`, `onlyCam`, `onlyOpen` | no       | Booleans             |
| `countryId`, `lang`                    | no       | Strings              |
| `page`, `limit`                        | no       | Positive integers    |

#### `create(params: CreateGroupParams)`

| Field                  | Default    | Constraint               |
| :--------------------- | :--------- | :----------------------- |
| `title`                | —          | Trimmed, non-empty       |
| `categoryId`           | —          | Positive integer         |
| `description`          | `""`       | String                   |
| `maxPeopleNum`         | `50`       | 2–100                    |
| `joinType`             | `"DIRECT"` | `"DIRECT" \| "APPROVAL"` |
| `password`             | `null`     | String or null           |
| `minDailyStudySeconds` | —          | Non-negative integer     |
| `questions`            | —          | `string[]`               |
| `allowChat`            | `true`     | Boolean                  |

#### `apply(groupId, { answers })`

`answers` must contain at least one string.

#### `reviewApplicant(groupId, params)`

```ts
{
  applicantUserId: number; // positive integer
  approved: boolean;
  rejectReason?: string | null;
}
```

Sends `reject_reason: rejectReason ?? null`.

#### `getMembers(groupId, options?)`

```ts
{ includeAllUsers?: boolean }
```

Maps to `include_all_users`. The query always contains `groupID`; it never contains
`countryID`.

#### `getAttendances(groupId, startDate, endDate)`

Dates are passed through unchanged; `YYYY-MM-DD` is expected.

#### `getLeaderboard(groupId, type = "daily")`

`type` is `"daily" | "weekly" | "monthly"`. If upstream returns a different `type` string,
it is passed through on the result.

#### `sendChatMessage(groupId, message, options?)`

```ts
{ imageUrls?: string[] } // defaults to []
```

Message is trimmed; empty input throws `YptValidationError`.

#### `postNotice(groupId, content, options?)`

```ts
{ sendPush?: boolean } // defaults to true
```

Content is trimmed; empty input throws `YptValidationError`.

#### `listAllMembers(options?)`

```ts
{ concurrency?: number } // positive integer, default 3
```

Fetches every joined group's roster with bounded concurrency and merges duplicates. See
[Groups → Cross-group roster](./groups.md#6-cross-group-unified-roster).

---

## 5. Types

### Auth & user

```ts
type SocialProvider = "KAKAO" | "NAVER" | "GOOGLE" | "APPLE" | "FACEBOOK";

interface SignInParams {
  email: string;
  password: string;
}

interface SignInOptions {
  splash?: boolean;
  strictPasswordValidation?: boolean;
}

interface SocialSignUpParams {
  provider: SocialProvider;
  token: string;
  nickname: string;
  operatingSystem?: "android" | "ios";
  terms?: boolean;
  privacy?: boolean;
  ageOver14?: boolean;
}

interface SplashDevice {
  version: number;
  pushToken: string;
  timezone: string;
  deviceType: string;
  osVersion: number;
  deviceModel: string;
  pv: number;
}

interface SplashLoginParams {
  refreshToken?: string;
  device?: Partial<SplashDevice>;
}

interface SplashLoginResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface SessionState {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: YptUser;
}

interface YptUser {
  id: number;
  nickname: string;
  email: string;
  today: string | null; // server-side "today" (YYYY-MM-DD)
  statusMsg?: string;
  profileImage?: string;
  flames?: number;
  tier?: string;
  createdAt?: string;
  socialType?: SocialProvider;
}
```

> `YptUser.id` is `0` and `email` may be `""` if upstream omits them. Legacy sign-in falls
> back to the submitted email.

### Groups

```ts
type GroupRole = "Owner / Manager" | "Cam Study" | "Member";
type GroupJoinType = "DIRECT" | "APPROVAL";
type GroupMemberRole = "OWNER" | "MANAGER" | "MEMBER";
type GroupOrderType = "time" | "attendance" | "cam" | "mission" | "owner" | "new" | "promotedAt";
type LeaderboardType = "daily" | "weekly" | "monthly";

interface Group {
  id: number;
  name: string;
  category: string | null;
  owner: string | null;
  role: GroupRole;
  memberCount: number;
  maxCapacity: number;
  isPrivate: boolean;
  notice: string | null;
}

interface SearchGroupsOptions {
  q: string;
  categoryId?: number;
  orderType?: GroupOrderType;
  onlyAvailable?: boolean;
  onlyCam?: boolean;
  onlyOpen?: boolean;
  countryId?: string;
  lang?: string;
  page?: number;
  limit?: number;
}

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
  joinType: GroupJoinType;
  averageStudySeconds: number | null;
  attendanceRate: number | null;
}

interface CreateGroupParams {
  title: string;
  categoryId: number;
  description: string;
  maxPeopleNum?: number;
  joinType?: GroupJoinType;
  password?: string | null;
  minDailyStudySeconds?: number;
  questions?: string[];
  allowChat?: boolean;
}

interface ValidateTitleResult {
  valid: boolean;
  message?: string;
}

interface JoinGroupOptions {
  password?: string;
}

interface ApplyGroupParams {
  answers: string[];
}

interface ReviewApplicantParams {
  applicantUserId: number;
  approved: boolean;
  rejectReason?: string | null;
}

interface BlacklistUser {
  userId: number;
  nickname: string;
  createdAt: string | null;
}
```

### Telemetry

```ts
interface CurrentSubject {
  id: number;
  name: string;
  color?: string;
}

interface GroupMember {
  userId: number;
  nickname: string;
  category: string | null;
  isStudying: boolean;
  isPaused: boolean;
  currentSubject: string | null;
  subjectDetails?: CurrentSubject;
  studyDate: string | null;
  lastActiveDate: string | null;
  todayStudyMs: number;
  todayStudyTime: string;
  liveStudyMs: number;
  liveStudyTime: string;
  sessionStartMs: number | null;
  sessionElapsedMs: number;
  studiconId: number | null;
  hasCustomAvatar: boolean;
  avatarUrl: string | null;
  role?: GroupMemberRole;
  stateIcon?: string;
  profileImage?: string;
  hasActiveCam?: boolean;
  camSnapshotUrl?: string | null;
  warningCount?: number;
}

interface GetMembersOptions {
  includeAllUsers?: boolean;
}

interface GroupAttendanceDay {
  date: string;
  studySeconds: number;
  passed: boolean;
}

interface MemberAttendance {
  userId: number;
  nickname: string;
  days: GroupAttendanceDay[];
  streakDays?: number;
  totalSeconds?: number;
}

interface GroupAttendanceResult {
  startDate: string;
  endDate: string;
  attendances: MemberAttendance[];
}

interface GroupRankMember {
  rank: number;
  userId: number;
  nickname: string;
  studySeconds: number;
  studyTime: string;
  profileImage: string | null;
}

interface GroupLeaderboardResult {
  type: LeaderboardType;
  ranks: GroupRankMember[];
}

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

interface SendChatOptions {
  imageUrls?: string[];
}

interface PostNoticeOptions {
  sendPush?: boolean;
}

interface ListAllMembersOptions {
  concurrency?: number;
}
```

### HTTP and raw types

```ts
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface HttpClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  userAgent: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  getToken: () => string | undefined;
  authScheme?: "Bearer" | "JWT";
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  auth?: "token" | "bare" | "none";
}

interface RawEnvelope {
  s: boolean;
  c?: number | string;
  m?: string;
}
```

Raw wire types (`RawUser`, `RawGroup`, `RawMember`, `RawModernGroupMember`, …) are exported
for advanced consumers and mapper authoring. See the
[minified-key glossary](./upstream-api.md#5-minified-key-glossary).

---

## 6. Utilities

### `formatDuration(ms: number): string`

Formats milliseconds as `HH:MM:SS`. Hours may exceed 99. Negative input clamps to
`"00:00:00"`.

```ts
formatDuration(15_300_000); // "04:15:00"
```

### `avatarUrl(member, cdnUrl?): string | null`

```ts
avatarUrl(
  member: { userId: number; studiconId: number | null; hasCustomAvatar: boolean },
  cdnUrl = "https://alicdn.tgclab.com",
): string | null
```

- Custom avatar → `${cdn}/user/profile/${userId}.jpg`
- Otherwise `${cdn}/sc.v2/${studiconId}/normal1.png`
- `null` when neither is available.

### `validatePassword(password: string): PasswordValidationResult`

```ts
interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}
```

Rules: minimum 8 characters and at least 2 of uppercase, lowercase, digits, special.

### `mergeMembers(entries): UnifiedMember[]`

```ts
mergeMembers(
  entries: Array<{ group: Pick<Group, "id" | "name">; members: GroupMember[] }>,
): UnifiedMember[]
```

Deduplicates by `userId`, prefers active/unpaused telemetry, takes the maximum study time,
accumulates group ids/names, and sorts by `liveStudyMs` descending.

### Raw → domain mappers

| Function          | Signature                                                                               | Notes                        |
| :---------------- | :-------------------------------------------------------------------------------------- | :--------------------------- |
| `mapUser`         | `(raw: RawSignInResponse, fallbackEmail = "") => YptUser`                               | Handles legacy + modern      |
| `mapGroups`       | `(raw: RawGroupsResponse) => Group[]`                                                   | Flattens `ms`/`cs`/`gs`/`ps` |
| `mapMember`       | `(raw: RawMember \| RawModernGroupMember, now: number, cdnUrl?) => GroupMember \| null` | Skips records without an id  |
| `mapMembers`      | `(raw: RawMembersResponse, now: number, cdnUrl?) => GroupMember[]`                      | Handles `ms`/`members`       |
| `mapSearchGroups` | `(raw: RawSearchGroupsResponse) => SearchGroupResult[]`                                 | Handles `groups`/`list`      |
| `mapAttendances`  | `(raw: RawAttendanceResponse) => GroupAttendanceResult`                                 |                              |
| `mapLeaderboard`  | `(raw: RawRanksResponse, fallbackType = "daily") => GroupLeaderboardResult`             |                              |

`cdnUrl` defaults to `https://alicdn.tgclab.com`.

---

## 7. Validation schemas

All schemas are exported and can be reused for your own validation.

### Input schemas

| Schema                                          | Key constraints                                          |
| :---------------------------------------------- | :------------------------------------------------------- |
| `SignInParamsSchema`                            | Trimmed email matching `x@y.z`; non-empty password       |
| `SignInOptionsSchema`                           | Optional booleans                                        |
| `SocialProviderSchema`                          | `KAKAO \| NAVER \| GOOGLE \| APPLE \| FACEBOOK`          |
| `SocialSignUpParamsSchema`                      | Non-empty token/nickname; defaults for OS and agreements |
| `SplashLoginParamsSchema`                       | Optional refresh token and device record                 |
| `GroupIdSchema`                                 | Positive integer or numeric string → normalized string   |
| `GroupOrderTypeSchema`                          | Sort-order enum                                          |
| `SearchGroupsOptionsSchema`                     | `q` min 2; positive ids/pages                            |
| `GroupJoinTypeSchema`                           | `DIRECT \| APPROVAL`                                     |
| `CreateGroupParamsSchema`                       | Title, category, capacity 2–100, defaults                |
| `JoinGroupOptionsSchema`                        | Optional password                                        |
| `ApplyGroupParamsSchema`                        | `answers` min 1                                          |
| `ReviewApplicantParamsSchema`                   | Positive applicant id; boolean approval                  |
| `ListAllMembersOptionsSchema`                   | Positive concurrency                                     |
| `YptJsOptionsSchema` / `YptClientOptionsSchema` | Valid URLs, non-negative numbers, known enums            |

### Raw response schemas

`RawEnvelopeSchema`, `RawUserSchema`, `RawModernSignInResponseSchema`,
`RawLegacySignInResponseSchema`, `RawSignInResponseSchema`, `RawSplashLoginResponseSchema`,
`RawFirebaseTokenResponseSchema`, `RawDailyLogSchema`, `RawMemberSchema`,
`RawGroupSchema`, `RawGroupsResponseSchema`, `RawMembersResponseSchema`,
`RawSearchResultGroupSchema`, `RawSearchGroupsResponseSchema`,
`RawModernGroupMemberSchema`, `RawAttendanceDaySchema`, `RawMemberAttendanceSchema`,
`RawAttendanceResponseSchema`, `RawRankMemberSchema`, `RawRanksResponseSchema`,
`RawBlacklistUserSchema`, `RawBlacklistResponseSchema`.

All raw object schemas use `.passthrough()` so unknown upstream fields do not fail
validation. Required fields are intentionally minimal.

### Inferred types

`ValidatedSignInParams`, `ValidatedSignInOptions`, `ValidatedSocialSignUpParams`,
`ValidatedSplashLoginParams`, `ValidatedSearchGroupsOptions`, `ValidatedCreateGroupParams`,
`ValidatedJoinGroupOptions`, `ValidatedApplyGroupParams`, `ValidatedReviewApplicantParams`,
`ValidatedJsOptions`, `ValidatedClientOptions`.

---

## 8. Errors

```text
YptError
├── YptValidationError        input or upstream response failed Zod validation
├── YptNetworkError           no HTTP response (DNS, TLS, timeout, offline)
├── YptHttpError              non-2xx without a YPT error envelope, or non-JSON body
└── YptApiError               YPT envelope error { s: false, c, m }
    └── YptAuthError          auth failure (codes 112/113/114, HTTP 401, no token)
```

| Class                | Fields                                            | Trigger                                  |
| :------------------- | :------------------------------------------------ | :--------------------------------------- |
| `YptError`           | `message`, `cause?`                               | Base class                               |
| `YptValidationError` | `issues`, `target: "input" \| "response"`, `raw?` | Invalid input; schema-invalid response   |
| `YptNetworkError`    | `cause`                                           | Fetch rejection / timeout / DNS          |
| `YptHttpError`       | `status`, `url`, `body`                           | Non-2xx without envelope; non-JSON 2xx   |
| `YptApiError`        | `code?`, `status?`, `body`                        | Envelope `s: false` with a non-auth code |
| `YptAuthError`       | inherits `YptApiError`                            | Auth codes, 401, missing token           |

`AUTH_ERROR_CODES` is a `ReadonlySet<number>` containing `112`, `113`, `114`.

See [Error handling](./error-handling.md) for recovery patterns.

---

## 9. HTTP & retry semantics

### Default headers

| Header          | Value                                                      |
| :-------------- | :--------------------------------------------------------- |
| `Content-Type`  | `application/json`                                         |
| `User-Agent`    | `Dart/3.11 (dart:io)`                                      |
| `Authorization` | `JWT <token>` (or bare `JWT`, or `Bearer` when configured) |

Custom `headers` are merged last and can override any of them.

### Retry matrix

| Condition               | `GET`                                 | `POST`                                |
| :---------------------- | :------------------------------------ | :------------------------------------ |
| Network error / timeout | Retry up to `maxRetries`              | No                                    |
| `429`                   | Retry, honoring `Retry-After` (≤ 30s) | No                                    |
| `5xx`                   | Retry up to `maxRetries`              | No                                    |
| `401`                   | One re-auth + retry (when configured) | One re-auth + retry (when configured) |
| Other `4xx`             | No                                    | No                                    |

Backoff is exponential (`retryDelayMs * 2^(attempt-1)`) with up to 25% jitter. Total
attempts for a `GET` are `maxRetries + 1`.

### Response parsing order

1. Read the body as text; attempt `JSON.parse`.
2. If the body is `{ s: false, … }`, throw `YptAuthError` or `YptApiError` — even on a `2xx`.
3. If the status is `401`, throw `YptAuthError`.
4. If the status is non-2xx, throw `YptHttpError`.
5. If the body is missing/non-object, throw `YptHttpError`.
6. Hand the object to the resource's Zod response schema, then the mapper.

---

## Related

- [Getting started](./getting-started.md)
- [Authentication](./authentication.md)
- [Groups](./groups.md)
- [Error handling](./error-handling.md)
- [Upstream API](./upstream-api.md)
