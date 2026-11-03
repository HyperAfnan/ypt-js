# Upstream API (Reverse-Engineered)

[← Documentation index](./overview.md)

This document describes the wire protocol the client targets. It is derived from observing
the YPT mobile client and is **not** official documentation. Endpoints, keys, and semantics
can change without notice.

Use it to debug traffic, add endpoints, or understand why a mapper exists.

---

## 1. Basics

| Item           | Value                                                    |
| :------------- | :------------------------------------------------------- |
| Base URL       | `https://pi.tgclab.com` (configurable)                   |
| Protocol       | HTTPS, JSON request/response bodies                      |
| Auth header    | `Authorization: JWT <accessToken>`                       |
| Sign-in header | `Authorization: JWT` (scheme only, no token)             |
| User-Agent     | `Dart/3.11 (dart:io)`                                    |
| Content-Type   | `application/json`                                       |
| Envelope       | `{ "s": boolean, "c"?: number \| string, "m"?: string }` |

`c` is an error code and `m` an error message; both are generally present only when
`s === false`. Some endpoints return `200 OK` with an error envelope, so callers must inspect
the body, not just the status.

### Header construction

```http
POST /user/sign-in-jwt HTTP/1.1
Host: pi.tgclab.com
Authorization: JWT
Content-Type: application/json
User-Agent: Dart/3.11 (dart:io)
```

```http
GET /group/groups/v2 HTTP/1.1
Host: pi.tgclab.com
Authorization: JWT eyJhbGciOi...
Content-Type: application/json
User-Agent: Dart/3.11 (dart:io)
```

The client also supports `Bearer` as an alternative scheme, but `JWT` is the default and
matches the mobile client.

---

## 2. Authentication endpoints

### `POST /user/sign-in-jwt`

Email/password login. Uses bare `Authorization: JWT`.

```json
{
  "email": "user@example.com",
  "password": "Secret123!",
  "loginProvider": "Email",
  "new": true,
  "getx": true,
  "language": "en"
}
```

Legacy response:

```json
{
  "s": true,
  "jwt": "eyJ…",
  "id": 16300695,
  "ud": 16300695,
  "n": "StudentBot",
  "e": "user@example.com",
  "today": "2026-10-13"
}
```

Modern response:

```json
{
  "accessToken": "eyJ…",
  "refreshToken": "eyJ…",
  "expiresAt": 1730000000,
  "user": {
    "id": 1049281,
    "email": "student@example.com",
    "nickname": "HardWorker2026",
    "status_msg": "Studying for exams",
    "profile_image": "https://picf.tgclab.com/users/avatar.jpg",
    "flames": 12,
    "tier": "GOLD",
    "created_at": "2024-03-15T08:30:00Z"
  }
}
```

The client accepts either, preferring `accessToken` over `jwt`.

### `POST /user/social/sign-up-jwt`

Bare auth. Signs up or logs in via a social provider.

```json
{
  "provider": "KAKAO",
  "token": "oauth-token",
  "nickname": "StudyWarrior",
  "operatingSystem": "android",
  "terms": true,
  "privacy": true,
  "age_over_14": true
}
```

`provider` is one of `KAKAO`, `NAVER`, `GOOGLE`, `APPLE`, `FACEBOOK`. The response matches
the sign-in shapes and may include `user.social_type`.

### `POST /user/v2/splash-login`

Device handshake and token rotation. Uses the token when available, otherwise bare auth.

```json
{
  "version": 810046,
  "pushToken": "",
  "timezone": "UTC",
  "deviceType": "WIN",
  "osVersion": 10,
  "deviceModel": "Desktop",
  "pv": 2,
  "language": "en",
  "refreshToken": "eyJ…"
}
```

```json
{
  "s": true,
  "accessToken": "eyJ…",
  "refreshToken": "eyJ…",
  "expiresAt": 1730000000
}
```

`refreshToken` is optional; when present it restores/rotates the session.

### `POST /user/firebase/custom-token`

Authenticated. Exchanges the YPT token for a Firebase custom auth token.

```json
{ "s": true, "token": "firebase-custom-jwt" }
```

The client also accepts `customToken` and `firebaseCustomToken`.

### `POST /user/push-token`

Authenticated. Registers an FCM/APNs device token.

```json
{ "token": "fcm-device-token", "pushToken": "fcm-device-token" }
```

### `POST /user/logout`

Authenticated. Invalidates the session server-side.

```json
{}
```

### `POST /user/exist-username`

Authenticated. Checks nickname availability.

```json
{ "nickname": "ExamMaster" }
```

```json
{ "s": true, "exist": true }
```

`isExist` is also accepted by the client.

### `POST /user/nickname/change`

```json
{ "nickname": "ExamMaster2026" }
```

### `POST /user/status_msg/change`

The client sends both key spellings:

```json
{ "status_msg": "Target: 10 hours daily", "statusMsg": "Target: 10 hours daily" }
```

---

## 3. Group endpoints

### `GET /group/groups/v2`

Returns every joined group, bucketed by relationship.

```json
{
  "s": true,
  "ms": [
    {
      "id": 6487271,
      "t": "Algorithm Masters",
      "c": "Computer Science",
      "on": "BotAdmin",
      "jc": 30,
      "mc": 50,
      "ip": true,
      "sn": "Daily minimum: 4 hours"
    }
  ],
  "cs": [],
  "gs": [
    {
      "id": 6814572,
      "t": "Global Study Room",
      "c": "General",
      "on": "GroupLeader",
      "jc": 48,
      "mc": 50,
      "ip": false,
      "sn": "Welcome everyone!"
    }
  ],
  "ps": []
}
```

| Bucket | Meaning                 | Client role         |
| :----- | :---------------------- | :------------------ |
| `ms`   | Managed (owner/manager) | `"Owner / Manager"` |
| `cs`   | Cam study               | `"Cam Study"`       |
| `gs`   | General                 | `"Member"`          |
| `ps`   | Public                  | `"Member"`          |

### `GET /group/list/search-2`

Public group discovery.

| Query            | Meaning                                                              |
| :--------------- | :------------------------------------------------------------------- |
| `q`              | Keyword                                                              |
| `category_id`    | Category filter                                                      |
| `order_type`     | `time`, `attendance`, `cam`, `mission`, `owner`, `new`, `promotedAt` |
| `only_available` | Exclude full groups                                                  |
| `only_cam`       | Cam rooms only                                                       |
| `only_open`      | No approval/password                                                 |
| `country_id`     | Region filter                                                        |
| `lang`           | Language                                                             |
| `page`, `limit`  | Pagination                                                           |

```json
{
  "s": true,
  "groups": [
    {
      "id": 12345,
      "title": "Study Zone",
      "description": "Daily grind",
      "category": "College",
      "category_id": 1,
      "owner": "LeaderBob",
      "members_count": 25,
      "max_people_num": 50,
      "is_private": false,
      "has_cam": true,
      "join_type": "DIRECT",
      "avg_study_seconds": 14400,
      "attendance_rate": 92
    }
  ]
}
```

The list may arrive under `groups` or `list`. Count fields may use `members_count` /
`member_count` and `max_people_num` / `max_capacity`.

### `POST /group/make/title/validate`

```json
{ "title": "Focus Hall" }
```

```json
{ "s": true, "valid": true }
```

### `POST /group/make/v2`

```json
{
  "title": "Midnight Coders",
  "category_id": 1,
  "description": "Focused study group.",
  "maxPeopleNum": 30,
  "join_type": "DIRECT",
  "password": null,
  "min_daily_study_seconds": 14400,
  "questions": ["What is your goal?"],
  "allow_chat": true
}
```

Note the mixed casing: `maxPeopleNum` and `allow_chat` are camel/snake as shown. Response:

```json
{ "s": true, "id": 98765 }
```

`group_id` is also accepted.

### `POST /group/join/v2`

```json
{ "group_id": 12345, "password": "optional-pin" }
```

### `POST /group/group-user/join-info`

```json
{ "group_id": 12345, "answers": ["Answer 1", "Answer 2"] }
```

### `POST /group/group-user/join/approve-or-reject`

```json
{
  "group_id": 12345,
  "applicant_user_id": 999,
  "approved": false,
  "reject_reason": "Capacity reached"
}
```

### `POST /group/leave`

```json
{ "group_id": 12345 }
```

An optional `userId` is supported by the client.

### `POST /group/warn` and `POST /group/warn/cancel`

```json
{ "group_id": 12345, "userId": 555 }
```

### `POST /group/kick-out`

```json
{ "group_id": 12345, "userId": 555 }
```

### `POST /group/black/add` and `POST /group/black/delete`

```json
{ "group_id": 12345, "userId": 555 }
```

### `GET /group/black/all`

| Query      | Meaning  |
| :--------- | :------- |
| `group_id` | Group id |

```json
{
  "s": true,
  "users": [{ "userId": 555, "nickname": "BannedUser", "created_at": "2026-10-10T12:00:00Z" }]
}
```

The list may also arrive under `list`.

### `GET /logs/group/members/v2`

| Query               | Meaning                          |
| :------------------ | :------------------------------- |
| `groupID`           | Group id                         |
| `include_all_users` | Include inactive/offline members |

> **Do not send `countryID`.** Upstream has been observed to return `HTTP 500` when it is
> present. The client does not expose or send it.

Legacy response (`ms`, times in milliseconds):

```json
{
  "s": true,
  "ms": [
    {
      "ud": 16300695,
      "n": "Afnan",
      "ct": "College",
      "sd": 105,
      "hasCustomAvatar": false,
      "dl": {
        "sm": 14400000,
        "is": true,
        "ia": false,
        "ss": 1773456000000,
        "sn": "Distributed Systems",
        "dt": "2026-10-13",
        "dd": "2026-10-13"
      }
    }
  ]
}
```

Modern response (`members`, times in seconds):

```json
{
  "s": true,
  "members": [
    {
      "user_id": 777,
      "nickname": "ModernStudent",
      "role": "LEADER",
      "is_studying": true,
      "today_study_seconds": 7200,
      "current_subject": { "id": 10, "name": "Quantum Mechanics", "color": "#FF5733" },
      "profile_image": "https://picf.tgclab.com/users/777.jpg",
      "has_active_cam": true,
      "cam_snapshot_url": "https://cam.tgclab.com/snap/777.jpg",
      "warning_count": 1,
      "state_icon": "flame"
    }
  ]
}
```

### `GET /logs/v70701/group/attendances`

| Query       | Meaning                   |
| :---------- | :------------------------ |
| `group_id`  | Group id                  |
| `startDate` | Start date (`YYYY-MM-DD`) |
| `endDate`   | End date (`YYYY-MM-DD`)   |

```json
{
  "s": true,
  "startDate": "2026-10-01",
  "endDate": "2026-10-07",
  "attendances": [
    {
      "userId": 100,
      "nickname": "Alex",
      "streak": 5,
      "total_seconds": 36000,
      "days": [
        { "date": "2026-10-01", "study_seconds": 7200, "passed": true },
        { "date": "2026-10-02", "study_seconds": 0, "passed": false }
      ]
    }
  ]
}
```

Snake-case aliases (`start_date`, `end_date`, `user_id`, `total_seconds`) are also accepted.

### `GET /logs/group/member/ranks`

| Query      | Meaning                      |
| :--------- | :--------------------------- |
| `group_id` | Group id                     |
| `type`     | `daily`, `weekly`, `monthly` |

```json
{
  "s": true,
  "type": "weekly",
  "ranks": [
    {
      "rank": 1,
      "user_id": 100,
      "nickname": "Champion",
      "study_seconds": 72000,
      "profile_image": "https://picf.tgclab.com/users/100.jpg"
    }
  ]
}
```

### `POST /group/push/shake`

```json
{ "group_id": 12345, "target_user_id": 888 }
```

### `POST /group/push/shake/all`

```json
{ "group_id": 12345 }
```

### `POST /group/chat`

```json
{
  "group_id": 12345,
  "message": "Let's study hard today!",
  "image_urls": ["https://example.com/notes.png"]
}
```

### `POST /group/notice`

```json
{ "group_id": 12345, "content": "Meeting at 9 PM", "send_push": true }
```

---

## 4. Endpoint summary

| Method | Path                                       | Auth       | Client method                                            |
| :----- | :----------------------------------------- | :--------- | :------------------------------------------------------- |
| POST   | `/user/sign-in-jwt`                        | bare       | `auth.signIn`                                            |
| POST   | `/user/social/sign-up-jwt`                 | bare       | `auth.socialSignUp`                                      |
| POST   | `/user/v2/splash-login`                    | token/bare | `auth.splashLogin`, `auth.restoreSession`                |
| POST   | `/user/firebase/custom-token`              | token      | `auth.getFirebaseCustomToken`                            |
| POST   | `/user/push-token`                         | token      | `auth.registerPushToken`                                 |
| POST   | `/user/logout`                             | token      | `auth.logout`                                            |
| POST   | `/user/exist-username`                     | token      | `auth.checkUsername`                                     |
| POST   | `/user/nickname/change`                    | token      | `auth.updateNickname`                                    |
| POST   | `/user/status_msg/change`                  | token      | `auth.updateStatusMessage`                               |
| GET    | `/group/groups/v2`                         | token      | `groups.listJoined`, `groups.get`, `groups.searchJoined` |
| GET    | `/group/list/search-2`                     | token      | `groups.search`                                          |
| POST   | `/group/make/title/validate`               | token      | `groups.validateTitle`                                   |
| POST   | `/group/make/v2`                           | token      | `groups.create`                                          |
| POST   | `/group/join/v2`                           | token      | `groups.join`                                            |
| POST   | `/group/group-user/join-info`              | token      | `groups.apply`                                           |
| POST   | `/group/group-user/join/approve-or-reject` | token      | `groups.reviewApplicant`                                 |
| POST   | `/group/leave`                             | token      | `groups.leave`                                           |
| POST   | `/group/warn`                              | token      | `groups.warnMember`                                      |
| POST   | `/group/warn/cancel`                       | token      | `groups.cancelWarning`                                   |
| POST   | `/group/kick-out`                          | token      | `groups.kickMember`                                      |
| POST   | `/group/black/add`                         | token      | `groups.blacklistMember`                                 |
| POST   | `/group/black/delete`                      | token      | `groups.removeBlacklist`                                 |
| GET    | `/group/black/all`                         | token      | `groups.listBlacklist`                                   |
| GET    | `/logs/group/members/v2`                   | token      | `groups.getMembers`                                      |
| GET    | `/logs/v70701/group/attendances`           | token      | `groups.getAttendances`                                  |
| GET    | `/logs/group/member/ranks`                 | token      | `groups.getLeaderboard`                                  |
| POST   | `/group/push/shake`                        | token      | `groups.nudge`                                           |
| POST   | `/group/push/shake/all`                    | token      | `groups.nudgeAll`                                        |
| POST   | `/group/chat`                              | token      | `groups.sendChatMessage`                                 |
| POST   | `/group/notice`                            | token      | `groups.postNotice`                                      |

---

## 5. Minified-key glossary

### Group (`RawGroup`)

| Key       | Meaning              |
| :-------- | :------------------- |
| `id`      | Group id             |
| `t`, `n`  | Title/name           |
| `c`       | Category             |
| `on`      | Owner nickname       |
| `jc`      | Joined member count  |
| `mc`      | Max capacity         |
| `ip`, `p` | Private flag         |
| `sn`      | Notice / description |

### Member (`RawMember`, legacy)

| Key               | Meaning                   |
| :---------------- | :------------------------ |
| `ud`, `id`        | User id                   |
| `n`               | Nickname                  |
| `ct`              | Category                  |
| `sd`, `si`        | Studicon avatar id        |
| `hasCustomAvatar` | Custom profile image flag |
| `dl`              | Daily log object          |

### Daily log (`RawDailyLog`)

| Key              | Meaning                           |
| :--------------- | :-------------------------------- |
| `sm`             | Study milliseconds recorded today |
| `is`             | Is studying                       |
| `ia`, `ip`       | Is paused                         |
| `ss`             | Session start, epoch ms           |
| `st`             | Session start, ISO-8601           |
| `sn`, `sb`, `tt` | Current subject name candidates   |
| `dt`             | Study date (`YYYY-MM-DD`)         |
| `dd`             | Last active date (`YYYY-MM-DD`)   |

### Modern member (`RawModernGroupMember`)

| Key                   | Meaning                                        |
| :-------------------- | :--------------------------------------------- |
| `user_id`, `userId`   | User id                                        |
| `nickname`            | Nickname                                       |
| `role`                | Role string (asserted, not validated)          |
| `is_studying`         | Is studying                                    |
| `current_subject`     | Subject object `{ id, name, color }` or string |
| `today_study_seconds` | Study seconds today                            |
| `state_icon`          | Status icon                                    |
| `profile_image`       | Profile image URL                              |
| `has_active_cam`      | Cam session flag                               |
| `cam_snapshot_url`    | Cam snapshot URL                               |
| `warning_count`       | Warning strikes                                |

### Search result

| Key                              | Meaning               |
| :------------------------------- | :-------------------- |
| `id`, `title`, `name`            | Identity              |
| `description`                    | Description           |
| `category`, `category_id`        | Category              |
| `owner`                          | Owner nickname        |
| `members_count`, `member_count`  | Member count          |
| `max_people_num`, `max_capacity` | Capacity              |
| `is_private`                     | Private flag          |
| `has_cam`                        | Cam room flag         |
| `join_type`                      | `DIRECT` / `APPROVAL` |
| `avg_study_seconds`              | Average study seconds |
| `attendance_rate`                | Attendance percentage |

### Attendance, ranks, blacklist

| Key                                                        | Meaning           |
| :--------------------------------------------------------- | :---------------- |
| `days[].date`                                              | Date              |
| `days[].study_seconds`                                     | Study seconds     |
| `days[].passed`                                            | Attendance passed |
| `streak`, `total_seconds`                                  | Member summary    |
| `ranks[].rank`                                             | Rank              |
| `ranks[].study_seconds`                                    | Study seconds     |
| `ranks[].profile_image`                                    | Avatar            |
| `users[].userId`, `users[].nickname`, `users[].created_at` | Blacklist entry   |

---

## 6. Known quirks

1. **`countryID` breaks member lists.** Sending it to `/logs/group/members/v2` has produced
   `HTTP 500`. Omit it.
2. **Two member payload generations.** `ms` + `dl` (milliseconds) and `members` +
   `today_study_seconds` (seconds) coexist. Normalize both.
3. **Numeric values as strings.** Ids, counts, and durations occasionally arrive as strings.
4. **Unknown fields are normal.** Schemas use `.passthrough()` for this reason.
5. **Envelope errors can arrive with `200`.** Inspect `s`, not just the status.
6. **Transient zero study time.** `sm` can drop to `0` mid-session for one group. Take the
   max across groups when accuracy matters.
7. **Group-local date rollover.** Study days follow the group's timezone, not UTC.
8. **Role strings are not a closed enum.** Values outside `OWNER`/`MANAGER`/`MEMBER` have
   been observed in modern payloads.
9. **Versioned paths change.** `/logs/v70701/...` embeds a client build number; other paths
   use `/v2`. Expect new versions over time.
10. **A Dart-like `User-Agent` is expected.** Requests with generic agents may be rejected or
    behave differently.
11. **Auth codes.** `112` (wrong password), `113` (unknown email), `114` (suspended) are
    surfaced as `YptAuthError`.
12. **No bulk APIs.** Moderation and nudges are one target per request.

---

## 7. Capturing traffic responsibly

If you need to extend the client:

- Use your own account and test data.
- Never commit real tokens, emails, nicknames, or user ids.
- Prefer recording the **shape** of a response over storing the payload.
- Keep request volume low; this is an undocumented private API.
- Do not attempt to access other users' private data or bypass authorization.

---

## Related

- [Architecture](./architecture.md)
- [API reference](./api-reference.md)
- [Contributing](./contributing.md)
