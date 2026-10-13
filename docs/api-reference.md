# API Reference

Complete API documentation for **`ypt-js`**.

---

## Table of Contents

- [YptJs Client](#yptjs-client)
  - [Constructor Options (`YptJsOptions`)](#constructor-options-yptjsoptions)
  - [Properties & Getters](#properties--getters)
  - [Methods](#methods)
- [AuthResource (`client.auth`)](#authresource)
- [GroupsResource (`client.groups`)](#groupsresource)
- [Types & Data Models](#types--data-models)
- [Error Handling](#error-handling)

---

## YptJs Client

```typescript
import { YptJs, YptClient } from "ypt-js";

// YptClient is an identical alias for YptJs
const client = new YptJs(options);
```

### Constructor Options (`YptJsOptions`)

| Option            | Type                                             | Default                       | Description                                                         |
| :---------------- | :----------------------------------------------- | :---------------------------- | :------------------------------------------------------------------ |
| `token`           | `string`                                         | `undefined`                   | Pre-existing JWT or `accessToken`.                                  |
| `refreshToken`    | `string`                                         | `undefined`                   | Long-lived refresh token for session restoration and auto-rotation. |
| `expiresAt`       | `number`                                         | `undefined`                   | Epoch timestamp of access token expiry.                             |
| `credentials`     | `SignInParams`                                   | `undefined`                   | Email and password for lazy sign-in and 401 re-login.               |
| `onTokenChange`   | `(token: string, refreshToken?: string) => void` | `undefined`                   | Fired whenever tokens change or rotate.                             |
| `onSessionChange` | `(session: SessionInfo) => void`                 | `undefined`                   | Fired with full session object on updates.                          |
| `authScheme`      | `"JWT" \| "Bearer"`                              | `"JWT"`                       | HTTP `Authorization` header prefix.                                 |
| `baseUrl`         | `string`                                         | `"https://pi.tgclab.com"`     | API gateway host.                                                   |
| `cdnUrl`          | `string`                                         | `"https://alicdn.tgclab.com"` | Static asset CDN base.                                              |
| `userAgent`       | `string`                                         | `"Dart/3.11 (dart:io)"`       | User-Agent string sent to upstream API.                             |
| `timeoutMs`       | `number`                                         | `15000`                       | Request timeout in milliseconds (0 to disable).                     |
| `maxRetries`      | `number`                                         | `2`                           | Max automatic retries for idempotent GET requests.                  |
| `retryDelayMs`    | `number`                                         | `500`                         | Base exponential backoff delay in ms.                               |
| `language`        | `string`                                         | `"en"`                        | Language code sent in request payloads.                             |
| `fetch`           | `FetchLike`                                      | `globalThis.fetch`            | Custom fetch implementation for proxies or mocking.                 |
| `now`             | `() => number`                                   | `Date.now`                    | Clock implementation for live study calculations.                   |

### Properties & Getters

- **`client.token`**: `string | undefined` – Current access token / JWT.
- **`client.accessToken`**: `string | undefined` – Alias for `token`.
- **`client.refreshToken`**: `string | undefined` – Current refresh token.
- **`client.expiresAt`**: `number | undefined` – Expiry epoch timestamp.
- **`client.isAuthenticated`**: `boolean` – `true` if client currently holds a token.
- **`client.user`**: `YptUser | undefined` – Current user profile data.
- **`client.auth`**: `AuthResource` – Authentication and account management instance.
- **`client.groups`**: `GroupsResource` – Study groups and leaderboard instance.

### Methods

- **`client.setToken(token: string): void`**: Manually sets the access token and triggers notification callbacks.
- **`client.setSession(tokens: { accessToken: string; refreshToken?: string; expiresAt?: number }): void`**: Sets full token state and notifies callbacks.

---

## AuthResource

Accessible via `client.auth`.

### `signIn(params, options?): Promise<YptUser>`

Authenticates with email and password via `POST /user/sign-in-jwt`.

```typescript
const user = await client.auth.signIn(
  {
    email: "user@example.com",
    password: "password123!",
  },
  {
    splash: true,
    strictPasswordValidation: false,
  },
);
```

### `socialSignUp(params, options?): Promise<YptUser>`

Registers or authenticates using an OAuth social provider via `POST /user/social/sign-up-jwt`.

```typescript
const user = await client.auth.socialSignUp({
  provider: "KAKAO",
  token: "oauth_access_token",
  nickname: "StudyWarrior",
  operatingSystem: "android",
});
```

### `splashLogin(params?): Promise<SplashLoginResult>`

Sends the device startup handshake via `POST /user/v2/splash-login`. Can rotate tokens when a refresh token is supplied.

```typescript
const result = await client.auth.splashLogin({
  refreshToken: "refresh_token",
});
```

### `restoreSession(refreshToken, device?): Promise<SplashLoginResult>`

Restores session and acquires fresh tokens using a persisted refresh token.

```typescript
await client.auth.restoreSession(savedRefreshToken);
```

### `getFirebaseCustomToken(): Promise<string>`

Exchanges the YPT access token for a Google Firebase Custom Auth Token via `POST /user/firebase/custom-token`.

### `registerPushToken(token: string): Promise<void>`

Registers an FCM/APNs push notification device token via `POST /user/push-token`.

### `logout(): Promise<void>`

Calls `POST /user/logout` and clears in-memory session tokens.

### `checkUsername(nickname: string): Promise<boolean>`

Checks if a nickname is already taken via `POST /user/exist-username`.

### `updateNickname(nickname: string): Promise<void>`

Changes display nickname via `POST /user/nickname/change`.

### `updateStatusMessage(statusMsg: string): Promise<void>`

Updates the status message / bio via `POST /user/status_msg/change`.

---

## GroupsResource

Accessible via `client.groups`. See [Groups Guide](./groups.md) for full workflows.

### `search(options: SearchGroupsOptions): Promise<SearchGroupResult[]>`

Searches public groups by keyword and filter criteria (`GET /group/list/search-2`).

### `listJoined(): Promise<Group[]>`

Lists all groups the authenticated user has joined (`GET /group/groups/v2`).

### `get(groupId: number | string): Promise<Group | null>`

Fetches details of a specific joined group.

### `searchJoined(query: string): Promise<Group[]>`

Case-insensitive search across joined groups by name, category, or owner.

### `validateTitle(title: string): Promise<ValidateTitleResult>`

Validates whether a group title is valid and available (`POST /group/make/title/validate`).

### `create(params: CreateGroupParams): Promise<{ id: number; title: string }>`

Creates a new study group (`POST /group/make/v2`).

### `join(groupId: number | string, options?: JoinGroupOptions): Promise<void>`

Joins an open or password-protected group (`POST /group/join/v2`).

### `apply(groupId: number | string, params: ApplyGroupParams): Promise<void>`

Submits an application with answers to group questions (`POST /group/group-user/join-info`).

### `reviewApplicant(groupId: number | string, params: ReviewApplicantParams): Promise<void>`

Approves or rejects a membership applicant (`POST /group/group-user/join/approve-or-reject`).

### `leave(groupId: number | string, userId?: number): Promise<void>`

Leaves a group (`POST /group/leave`).

### `warnMember(groupId: number | string, userId: number): Promise<void>`

Issues an official warning strike to a member (`POST /group/warn`).

### `cancelWarning(groupId: number | string, userId: number): Promise<void>`

Cancels/revokes a previously issued warning strike (`POST /group/warn/cancel`).

### `kickMember(groupId: number | string, userId: number): Promise<void>`

Expels a member from the group (`POST /group/kick-out`).

### `blacklistMember(groupId: number | string, userId: number): Promise<void>`

Bans and blacklists a member permanently (`POST /group/black/add`).

### `removeBlacklist(groupId: number | string, userId: number): Promise<void>`

Removes a member from the group blacklist (`POST /group/black/delete`).

### `listBlacklist(groupId: number | string): Promise<BlacklistUser[]>`

Returns all blacklisted users for the group (`GET /group/black/all`).

### `getMembers(groupId: number | string, options?: GetMembersOptions): Promise<GroupMember[]>`

Fetches all members of a group with real-time live study duration calculations (`GET /logs/group/members/v2`).

### `getAttendances(groupId: number | string, startDate: string, endDate: string): Promise<GroupAttendanceResult>`

Fetches attendance compliance and daily study matrix across a date range (`GET /logs/v70701/group/attendances`).

### `getLeaderboard(groupId: number | string, type?: LeaderboardType): Promise<GroupLeaderboardResult>`

Fetches study time rankings by period: `"daily" | "weekly" | "monthly" | "total"` (`GET /logs/group/member/ranks`).

### `nudge(groupId: number | string, targetUserId: number): Promise<void>`

Sends an in-app vibration nudge to an individual inactive member (`POST /group/push/shake`).

### `nudgeAll(groupId: number | string): Promise<void>`

Sends a vibration nudge to all inactive group members (`POST /group/push/shake/all`).

### `sendChatMessage(groupId: number | string, message: string, options?: SendChatOptions): Promise<void>`

Sends a text or image message to the group chat (`POST /group/chat`).

### `postNotice(groupId: number | string, content: string, options?: PostNoticeOptions): Promise<void>`

Pins an announcement notice banner to the group home (`POST /group/notice`).

### `listAllMembers(options?: ListAllMembersOptions): Promise<UnifiedMembersResult>`

Aggregates and deduplicates members across all joined groups into a unified leaderboard.

---

## Types & Data Models

### `YptUser`

```typescript
export interface YptUser {
  id: number;
  nickname: string;
  email: string;
  today: string | null;
  statusMsg?: string;
  profileImage?: string;
  flames?: number;
  tier?: string;
  createdAt?: string;
  socialType?: SocialProvider;
}
```

### `SocialProvider`

```typescript
export type SocialProvider = "KAKAO" | "NAVER" | "GOOGLE" | "APPLE" | "FACEBOOK";
```

### `SocialSignUpParams`

```typescript
export interface SocialSignUpParams {
  provider: SocialProvider;
  token: string;
  nickname: string;
  operatingSystem?: "android" | "ios";
  terms?: boolean;
  privacy?: boolean;
  ageOver14?: boolean;
}
```

### `SessionInfo`

```typescript
export interface SessionInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: YptUser;
}
```

### `Group`

```typescript
export interface Group {
  id: number;
  name: string;
  category?: string;
  owner?: string;
  role: GroupRole;
  memberCount: number;
  maxCapacity: number;
  isPrivate: boolean;
  notice?: string;
}
```

### `SearchGroupResult`

```typescript
export interface SearchGroupResult {
  id: number;
  name: string;
  description?: string;
  category?: string;
  categoryId?: number;
  owner?: string;
  memberCount: number;
  maxCapacity: number;
  isPrivate: boolean;
  hasCam: boolean;
  joinType: "DIRECT" | "APPROVAL";
  averageStudySeconds?: number;
  attendanceRate?: number;
}
```

### `GroupMember`

```typescript
export interface GroupMember {
  userId: number;
  nickname: string;
  category?: string;
  isStudying: boolean;
  isPaused: boolean;
  currentSubject: string | null;
  subjectDetails?: CurrentSubject;
  studyDate?: string;
  lastActiveDate?: string;
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
  camSnapshotUrl?: string;
  warningCount?: number;
}
```

### `GroupAttendanceResult`

```typescript
export interface GroupAttendanceResult {
  startDate: string;
  endDate: string;
  attendances: MemberAttendance[];
}
```

### `GroupLeaderboardResult`

```typescript
export interface GroupLeaderboardResult {
  type: LeaderboardType;
  ranks: GroupRankMember[];
}
```

---

## Error Handling

All library errors inherit from the root `YptError`:

```
YptError
 ├── YptValidationError     # Thrown when inputs or upstream responses fail Zod schema validation
 ├── YptNetworkError        # Thrown when connection drops, DNS fails, or request times out
 ├── YptHttpError           # Thrown on unexpected HTTP non-2xx status codes
 └── YptApiError            # Thrown on YPT logical error envelopes ({ s: false, c: ..., m: ... })
      └── YptAuthError      # Thrown on authentication/authorization failures (HTTP 401, codes 112-114)
```

### Example

```typescript
import { YptAuthError, YptValidationError } from "ypt-js";

try {
  await client.auth.signIn({ email: "invalid", password: "" });
} catch (err) {
  if (err instanceof YptValidationError) {
    console.error("Validation issue on:", err.target, err.issues);
  } else if (err instanceof YptAuthError) {
    console.error("Auth failed:", err.message, "code:", err.code);
  }
}
```
