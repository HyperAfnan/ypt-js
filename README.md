# ypt-client

An unofficial Node.js/TypeScript client library for the **Yeolpumta (YPT)** study app.

[![CI](https://github.com/HyperAfnan/ypt-js/actions/workflows/ci.yml/badge.svg)](https://github.com/HyperAfnan/ypt-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> ⚠️ **Disclaimer:** This is an unofficial, reverse-engineered client not affiliated with or endorsed by YPT / TGCLab. Use responsibly, respect their terms of service, keep request volume reasonable, and protect user privacy.

---

## ✨ Features

- **Runtime Schema Validation** – Powered by Zod for robust input validation and API response drift detection.
- **Native fetch** – Built with native `fetch` (Node.js 18+ and Bun).
- **TypeScript ready** – Full type definitions for requests, responses, and errors.
- **Dual module support** – Works out of the box with both ESM and CommonJS.
- **Clean developer ergonomics** – Replaces obfuscated upstream API keys (e.g. `dl.sm` -> `todayStudyMs`).
- **Smart session handling** – Optional automatic login, token storage callbacks, and lazy authentication.
- **Live study calculations** – Real-time study time computation based on ongoing sessions.

---

## 📦 Installation

```bash
bun add ypt-client
# or: npm install ypt-client
```

---

## 🚀 Quick Start

```typescript
import { YptClient } from "ypt-client";

const ypt = new YptClient();

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

## 🔑 Authentication Options

### 1. Auto-login with credentials

You can pass credentials directly to the client. It will authenticate lazily on the first request and handle re-login if the session expires:

```typescript
const ypt = new YptClient({
  credentials: {
    email: process.env.YPT_EMAIL!,
    password: process.env.YPT_PASSWORD!,
  },
});

// Automatically signs in before making the request
const groups = await ypt.groups.listJoined();
```

### 2. Persisted Token

Pass an existing token and persist refreshed tokens:

```typescript
const ypt = new YptClient({
  token: await loadSavedToken(),
  onTokenChange: async (newToken) => {
    await saveToken(newToken);
  },
});
```

---

## 📖 API Overview

### Authentication (`ypt.auth`)

- `signIn({ email, password })`: Authenticates user and returns user info & token.
- `splashLogin()`: Sends device startup ping / session initialization.

### Groups (`ypt.groups`)

- `listJoined()`: Lists all groups the authenticated user belongs to.
- `get(groupId)`: Retrieves a specific joined group by ID.
- `searchJoined(query)`: Searches through joined groups by name.
- `getMembers(groupId)`: Retrieves members of a group with their study times and current status.
- `listAllMembers()`: Aggregates member logs across all joined groups.

### Helpers & Utilities

- `avatarUrl(path)`: Resolves full avatar URL from CDN.
- `formatDuration(ms)`: Formats study duration into human-readable strings (`HH:MM:SS`).
- `mergeMembers(lists)`: Deduplicates and merges member records across groups.

---

## ⚙️ Client Options

```typescript
const ypt = new YptClient({
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

---

## 🛠️ Development

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

## 📄 License

This project is licensed under the [MIT License](LICENSE).
