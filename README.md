# ypt-js

An unofficial Node.js/TypeScript client library for the **Yeolpumta (YPT)** study app.

[![CI](https://github.com/HyperAfnan/ypt-js/actions/workflows/ci.yml/badge.svg)](https://github.com/HyperAfnan/ypt-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Disclaimer:** This is an unofficial, reverse-engineered client not affiliated with or endorsed by YPT / TGCLab. Use responsibly, respect their terms of service, keep request volume reasonable, and protect user privacy.

---

## Features

- **Dual-Token Authentication** – Modern `accessToken` & `refreshToken` management with automatic 401 token rotation.
- **Social Sign-Up & OAuth** – Supports Kakao, Naver, Google, Apple, and Facebook sign-up flows.
- **Downstream Auth** – Native support for Google Firebase Custom Tokens and device push token registration.
- **Runtime Schema Validation** – Powered by Zod for robust input validation and API response drift detection.
- **Native fetch** – Built with native `fetch` (Node.js 18+ and Bun).
- **TypeScript ready** – Full type definitions for requests, responses, and errors.
- **Dual module support** – Works out of the box with both ESM and CommonJS.
- **Clean developer ergonomics** – Replaces obfuscated upstream API keys (e.g. `dl.sm` -> `todayStudyMs`).
- **Live study calculations** – Real-time study time computation based on ongoing sessions.

---

## Installation

```bash
bun add ypt-js
# or: npm install ypt-js
```

---

## Quick Start

```typescript
import { YptJs } from "ypt-js";

const ypt = new YptJs();

// Sign in with your YPT credentials
await ypt.auth.signIn({
  email: process.env.YPT_EMAIL!,
  password: process.env.YPT_PASSWORD!,
});

// Fetch your joined study groups
const groups = await ypt.groups.listJoined();
console.log(
  "Joined groups:",
  groups.map((g) => g.name),
);

// Get members of a group
const members = await ypt.groups.getMembers(groups[0].id);

for (const member of members) {
  const status = member.isStudying ? `studying ${member.currentSubject ?? ""}` : "offline";
  console.log(`${member.nickname} - ${member.liveStudyTime} (${status})`);
}
```

---

## Authentication Options

### 1. Auto-login with credentials

You can pass credentials directly to the client. It will authenticate lazily on the first request and handle re-login if the session expires:

```typescript
const ypt = new YptJs({
  credentials: {
    email: process.env.YPT_EMAIL!,
    password: process.env.YPT_PASSWORD!,
  },
});

// Automatically signs in before making the request
const groups = await ypt.groups.listJoined();
```

### 2. Dual-Token Session Restoration

Pass a persisted refresh token to restore sessions across restarts:

```typescript
const ypt = new YptJs({
  refreshToken: await loadSavedRefreshToken(),
  onTokenChange: async (token, refreshToken) => {
    await saveTokens({ token, refreshToken });
  },
});

// Restore session from refresh token
await ypt.auth.restoreSession(await loadSavedRefreshToken());
```

---

## Detailed Documentation

Comprehensive guides are available in the [`docs/`](./docs) directory:

- [**Authentication & Session Lifecycle**](./docs/authentication.md): Email sign-in, Social OAuth (`KAKAO`, `NAVER`, `GOOGLE`, `APPLE`, `FACEBOOK`), Firebase Custom Tokens, Push Tokens, and Profile management.
- [**Groups, Discovery & Moderation**](./docs/groups.md): Group search & discovery, title validation & creation, applications & screening questions, live roster telemetry, attendance tracking, leaderboards, member strikes/kicking/blacklisting, and social nudges & chat.
- [**API Reference**](./docs/api-reference.md): Detailed parameter schemas, method signatures, return types, and error handling hierarchy.

---

## API Overview

### Authentication (`ypt.auth`)

- `signIn({ email, password })`: Authenticates user and returns dual tokens & profile.
- `socialSignUp({ provider, token, nickname })`: Registers/authenticates via OAuth provider.
- `splashLogin()`: Sends device startup ping and rotates tokens.
- `restoreSession(refreshToken)`: Restores session from stored refresh token.
- `getFirebaseCustomToken()`: Exchanges YPT token for a Google Firebase Custom Token.
- `registerPushToken(token)`: Registers FCM / APNs device push token.
- `checkUsername(nickname)`: Checks if a nickname is already in use.
- `updateNickname(nickname)`: Changes account display nickname.
- `updateStatusMessage(message)`: Changes account status message / bio.
- `logout()`: Logs out and invalidates session.

### Groups (`ypt.groups`)

- `search(options)`: Discovers public groups with keyword, categories, and filter sorting.
- `listJoined()`: Lists all groups the authenticated user belongs to.
- `get(groupId)`: Retrieves a specific joined group by ID.
- `searchJoined(query)`: Client-side filter through joined groups by name, category, or owner.
- `validateTitle(title)`: Verifies if a group title is valid and available.
- `create(params)`: Creates a new study group with rules, join types, and study requirements.
- `join(groupId, options?)`: Directly joins an open or PIN-protected study group.
- `apply(groupId, params)`: Submits an application with answers to group screening questions.
- `reviewApplicant(groupId, params)`: Approves or rejects incoming membership applications.
- `leave(groupId)`: Leaves a joined group.
- `warnMember(groupId, userId)`: Issues an official warning strike to a member.
- `cancelWarning(groupId, userId)`: Revokes a previously issued warning strike.
- `kickMember(groupId, userId)`: Expels a member from the group.
- `blacklistMember(groupId, userId)`: Permanently bans and blacklists a member.
- `removeBlacklist(groupId, userId)`: Removes a user from the group blacklist.
- `listBlacklist(groupId)`: Lists all blacklisted users for a group.
- `getMembers(groupId, options?)`: Retrieves members of a group with real-time live study calculations and active cams.
- `getAttendances(groupId, startDate, endDate)`: Fetches attendance compliance matrix and daily study records.
- `getLeaderboard(groupId, type)`: Retrieves group study rankings by day, week, month, or total.
- `nudge(groupId, targetUserId)`: Sends an in-app vibration nudge to an individual inactive student.
- `nudgeAll(groupId)`: Sends a vibration nudge to all inactive members in a group.
- `sendChatMessage(groupId, message, options?)`: Sends a message to the group chat room.
- `postNotice(groupId, content, options?)`: Pins an official notice banner to the group home.
- `listAllMembers(options?)`: Aggregates and deduplicates member telemetry across all joined groups.

### Helpers & Utilities

- `avatarUrl(path)`: Resolves full avatar URL from CDN.
- `formatDuration(ms)`: Formats study duration into human-readable strings (`HH:MM:SS`).
- `mergeMembers(lists)`: Deduplicates and merges member records across groups.
- `validatePassword(password)`: Validates password against YPT's 8-character 2-category rule.

---

## Client Options

```typescript
const ypt = new YptJs({
  token?: string,
  credentials?: { email: string; password: string },
  onTokenChange?: (token: string | null) => void,
  baseUrl?: string,          // Default: "https://pi.tgclab.com"
  cdnUrl?: string,          // Default: "https://alicdn.tgclab.com"
  timeoutMs?: number,       // Default: 15000
  maxRetries?: number,      // Default: 2 (for GET requests)
  retryDelayMs?: number,    // Default: 500
});
```

_(Note: `YptClient` is also exported as an alias for `YptJs` for backward compatibility)._

---

## Development

```bash
# Install dependencies
bun install

# Type-check
bun run typecheck

# Run tests
bun test

# Format code
bun run format

# Build package (CJS + ESM + d.ts)
bun run build
```

---

## License

This project is licensed under the [MIT License](LICENSE).
