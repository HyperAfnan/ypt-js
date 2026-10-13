# `ypt-js` Documentation

Welcome to the documentation for **`ypt-js`**, an unofficial TypeScript client library for the private mobile API of YeolPumTa (YPT).

---

## Table of Contents

1. [Authentication & Session Lifecycle](./authentication.md)
   - [Overview of Auth Architecture](./authentication.md#overview-of-auth-architecture)
   - [Email & Password Sign-In (`auth.signIn`)](./authentication.md#1-email--password-sign-in)
   - [Social Sign-Up & OAuth (`auth.socialSignUp`)](./authentication.md#2-social-sign-up--oauth)
   - [Dual-Token Lifecycle & 401 Auto-Recovery](./authentication.md#3-dual-token-jwt-lifecycle)
   - [Session Restoration (`auth.restoreSession` / `auth.splashLogin`)](./authentication.md#4-session-restore--token-rotation)
   - [Downstream Services (Firebase & Push Tokens)](./authentication.md#5-downstream-integrations)
   - [Account & Profile Management](./authentication.md#6-account--profile-management)
2. [Groups, Discovery & Moderation](./groups.md)
   - [Group Discovery & Search (`groups.search`)](./groups.md#1-group-discovery--search)
   - [Title Validation & Group Creation (`groups.create`)](./groups.md#2-title-validation--group-creation)
   - [Joining & Applications (`groups.join`, `groups.apply`, `groups.reviewApplicant`)](./groups.md#3-joining--applications)
   - [Live Roster & Telemetry (`groups.getMembers`, `groups.listAllMembers`)](./groups.md#4-live-roster--real-time-telemetry)
   - [Attendance & Study Tracking (`groups.getAttendances`)](./groups.md#5-attendance--daily-study-tracking)
   - [Group Leaderboards (`groups.getLeaderboard`)](./groups.md#6-group-leaderboards)
   - [Moderation & Blacklist (`groups.warnMember`, `groups.kickMember`, `groups.blacklistMember`)](./groups.md#7-moderation--blacklist)
   - [Social & Accountability (`groups.nudge`, `groups.sendChatMessage`, `groups.postNotice`)](./groups.md#8-social--accountability)
   - [Upstream Quirks & Best Practices](./groups.md#9-upstream-quirks--best-practices)
3. [API Reference](./api-reference.md)
   - [`YptJs` / `YptClient` Configuration](./api-reference.md#yptjs-client)
   - [`AuthResource` Methods](./api-reference.md#authresource)
   - [`GroupsResource` Methods](./api-reference.md#groupsresource)
   - [Data Models & TypeScript Types](./api-reference.md#types--data-models)
   - [Error Hierarchy](./api-reference.md#error-handling)

---

## Architectural Highlights

- **Dual-Token System**: Implements YPT's modern `accessToken` (for API requests) and `refreshToken` (for background session restoration and rotation) dual-token model.
- **Resilient Auto-Reauth**: Transparently handles expired sessions upon `401 Unauthorized` by attempting refresh token rotation first, falling back to credentials if necessary.
- **OAuth Social Provider Support**: First-class support for `KAKAO`, `NAVER`, `GOOGLE`, `APPLE`, and `FACEBOOK` sign-up and authentication flows.
- **Strict Validation & Resilience**: Zod schemas validate both input parameters and upstream response envelopes while gracefully accommodating schema drifts.
