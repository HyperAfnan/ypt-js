---
layout: home

hero:
  name: ypt-js
  text: Unofficial TypeScript client for YPT
  tagline: Typed sessions, live study telemetry, and group moderation for Yeolpumta — without reverse-engineering the wire format yourself.
  image:
    src: /logo.svg
    alt: ypt-js
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: API reference
      link: /api-reference
    - theme: alt
      text: Documentation map
      link: /overview

features:
  - icon: 🔐
    title: Dual-token auth
    details: Access and refresh tokens, lazy sign-in, shared 401 recovery, and session restore across restarts.
  - icon: 📊
    title: Live telemetry
    details: Real-time member rosters, running-session study time, attendance matrices, and leaderboards.
  - icon: 🧩
    title: Validated types
    details: Zod checks inputs before I/O and leniently validates upstream responses so API drift is visible.
  - icon: 🛡️
    title: Group moderation
    details: Warnings, kicks, blacklists, applicant review, nudges, chat, and notices.
  - icon: 🔁
    title: Cross-group merge
    details: Deduplicate the same person across groups and take the maximum study time when upstream flaps.
  - icon: ⚙️
    title: Runtime ready
    details: Native fetch, Node 18+ and Bun, ESM and CommonJS builds, full TypeScript declarations.
---

## Install

```bash
bun add ypt-js
# or: npm install ypt-js
```

## Quick start

```ts
import { YptJs } from "ypt-js";

const ypt = new YptJs({
  credentials: {
    email: process.env.YPT_EMAIL!,
    password: process.env.YPT_PASSWORD!,
  },
});

const groups = await ypt.groups.listJoined();
const members = await ypt.groups.getMembers(groups[0].id);

for (const member of members) {
  console.log(member.nickname, member.liveStudyTime);
}
```

> **Unofficial.** This project is not affiliated with, endorsed by, or supported by YPT /
> TGCLab. Use it responsibly, keep request volume low, and never handle credentials or data
> you do not own.
