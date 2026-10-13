# Agent Guide for `ypt-js`

This document provides context, architecture guidelines, and operational instructions for AI agents working in this repository.

---

## 1. Project Overview

`ypt-js` is an **unofficial** TypeScript client library for the private mobile API of **Yeolpumta (YPT)**, a popular study tracking application.

### Key Objectives & Principles:

- **Package Manager:** Always use **Bun** (`bun install`, `bun test`, `bun run build`, `bun add`). Do not use `npm`.
- **Runtime Schema Validation:** Uses **Zod** for robust caller input validation and upstream API response drift detection.
- **Native fetch:** Strictly relies on native `fetch` (Node 18+ and Bun).
- **Dual Module Support:** Builds cleanly for both ESM (`.js`) and CommonJS (`.cjs`) with full TypeScript declarations (`.d.ts`, `.d.cts`) via `tsup`.
- **Developer-Friendly Ergonomics:** Abstract YPT's minified/cryptic upstream API response keys (e.g. `dl.sm`, `is_study`, `live_start`) into idiomatic TypeScript camelCase properties (`todayStudyMs`, `isStudying`, `liveStudyMs`).
- **Resilient & Polite:** Built-in concurrency control (`settlePool`), exponential backoff retries on GETs, typed error boundaries, and auto re-authentication.

---

## 2. Codebase Architecture

```
ypt-js/
├── src/
│   ├── index.ts              # Public API entry point and type exports
│   ├── client.ts             # Main YptJs orchestrator class (validates options)
│   ├── http.ts               # HTTP client wrapping native fetch with retries & auth hooks
│   ├── errors.ts             # Typed error hierarchy (YptError, YptAuthError, YptValidationError, etc.)
│   ├── types.ts              # Upstream raw API interfaces & cleaned public types
│   ├── schemas.ts            # Zod schemas for inputs and upstream responses
│   ├── mappers.ts            # Translation layer from upstream keys to typed models & utilities
│   └── resources/            # Domain-specific resource handlers
│       ├── auth.ts           # Sign-in and splash-login handshake (validates inputs & responses)
│       └── groups.ts         # Joined groups, group members, and unified leaderboard
├── test/
│   ├── helpers.ts            # Fake fetch implementation and response mocking helpers
│   ├── auth.test.ts          # Auth test suite
│   ├── groups.test.ts        # Group listing and member calculation test suite
│   └── validation.test.ts    # Zod input & response validation test suite
├── .github/
│   └── workflows/            # GitHub Actions (CI, Auto-Format, Changelog)
├── package.json              # Package metadata and scripts
├── tsconfig.json             # TypeScript configuration (NodeNext, Strict)
└── tsup.config.ts            # Build configuration (ESM + CJS + DTS)
```

---

## 3. Module Breakdown

### `src/client.ts` (`YptJs`)

- Central entry point that coordinates resources (`client.auth`, `client.groups`).
- Validates `YptJsOptions` with Zod schema on instantiation.
- Manages session token state and optional `credentials` for lazy sign-in and transparent 401 retry.
- Emits `onTokenChange` when tokens refresh so callers can persist tokens externally.
- Allows injecting custom `fetch` and custom clock `now` (crucial for deterministic tests).

### `src/schemas.ts`

- Houses all Zod schemas:
  - Input schemas: `SignInParamsSchema`, `SignInOptionsSchema`, `GroupIdSchema`, `ListAllMembersOptionsSchema`, `YptJsOptionsSchema`.
  - Raw upstream response schemas: `RawEnvelopeSchema`, `RawSignInResponseSchema`, `RawGroupsResponseSchema`, `RawMembersResponseSchema`. Uses `.passthrough()` for upstream resilience.

### `src/http.ts` (`HttpClient`)

- Light wrapper over `fetch`. Handles:
  - Default headers and user-agent (`Dart/3.11 (dart:io)`).
  - Timeout enforcement using `AbortController`.
  - Automatic retry with exponential backoff on idempotent GET requests (for network errors, HTTP 429, or 5xx).
  - YPT API envelope decoding (`{ s: boolean, c: number, m: string }`).

### `src/mappers.ts`

- Converts cryptic upstream responses into strongly-typed interfaces.
- Computes **live study time**: YPT's upstream `sm` only counts study duration up to the start of the current running session. The mapper computes `liveStudyMs = todayStudyMs + (now - sessionStartMs)` when a member is actively studying.
- Provides helper utilities: `avatarUrl()`, `formatDuration()`, and `mergeMembers()`.

### `src/errors.ts`

- All errors inherit from `YptError`:
  - `YptValidationError`: Thrown on invalid inputs or corrupted upstream API responses. Contains Zod `issues`, `target` ("input" | "response"), and raw payload.
  - `YptAuthError`: Authentication failures (codes 112, 113, 114, HTTP 401, or missing credentials).
  - `YptApiError`: Logical API errors returned within YPT's JSON envelope (`{ s: false, c: ..., m: ... }`).
  - `YptHttpError`: Unexpected HTTP response status or invalid JSON.
  - `YptNetworkError`: Connection dropped, DNS resolution failed, or request timed out.

---

## 4. Known Upstream API Quirks

When adding or modifying API endpoints, be aware of these reverse-engineered realities:

1. **User-Agent:** Upstream servers require a Flutter/Dart user agent (`Dart/3.11 (dart:io)`). Requests without an app-like User-Agent may be blocked.
2. **`countryID` Bug:** On `GET /logs/group/members/v2`, passing `countryID` causes the upstream server to respond with `HTTP 500`. Never pass `countryID`.
3. **Date Rollover:** Groups roll over their study day based on their regional timezones (`dl.dt`), not UTC midnight.
4. **Transient Zero Values:** YPT's `sm` (today study ms) can intermittently drop to `0` mid-day for active users. The `mergeMembers` utility takes the maximum observed study time across joined groups to mitigate this.

---

## 5. Development Guidelines & Best Practices

1. **Tooling:**
   - **Always use Bun** for dependency management, testing, and script execution.
   - Keep runtime dependencies minimal (`zod`).

2. **Testing Rules:**
   - **Never make live network calls in unit tests.**
   - All tests in `test/` must use mocked `fetch` implementations (`mockFetch` in `test/helpers.ts`).
   - Scrub sensitive information (tokens, emails, phone numbers, user IDs) from any mock test data.

3. **Code Style & Commits:**
   - Run `bun run format` (Prettier) before committing.
   - Use TypeScript strict mode with explicit return types for public functions.
   - Follow **Conventional Commits** format (e.g. `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`).

---

## 6. Common Commands

```bash
# Install dependencies
bun install

# Typecheck
bun run typecheck

# Run test suite
bun test

# Format code with Prettier
bun run format

# Check formatting without writing
bun run format:check

# Build distribution (ESM + CJS + DTS)
bun run build

# Watch mode during development
bun run dev
```
