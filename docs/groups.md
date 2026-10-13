# Groups, Discovery & Moderation

`ypt-js` provides comprehensive support for the YeolPumTa (YPT) study groups API, including discovery and searching, creation, membership applications, live telemetry, attendance tracking, leaderboards, moderation, and social interactions.

---

## Table of Contents

- [1. Group Discovery & Search](#1-group-discovery--search)
- [2. Title Validation & Group Creation](#2-title-validation--group-creation)
- [3. Joining & Applications](#3-joining--applications)
- [4. Live Roster & Real-Time Telemetry](#4-live-roster--real-time-telemetry)
- [5. Attendance & Daily Study Tracking](#5-attendance--daily-study-tracking)
- [6. Group Leaderboards](#6-group-leaderboards)
- [7. Moderation & Blacklist](#7-moderation--blacklist)
- [8. Social & Accountability (Nudges, Chat, Notices)](#8-social--accountability)
- [9. Upstream Quirks & Best Practices](#9-upstream-quirks--best-practices)

---

## 1. Group Discovery & Search

### Searching Public Groups

Use `client.groups.search()` to discover public groups based on keyword queries, category filters, and sorting criteria.

```typescript
import { YptJs } from "ypt-js";

const client = new YptJs({ token: "YOUR_ACCESS_TOKEN" });

const results = await client.groups.search({
  q: "Computer Science",
  categoryId: 1, // e.g. College / University
  orderType: "time", // "time" | "attendance" | "cam" | "mission" | "owner" | "new" | "promotedAt"
  onlyAvailable: true, // Only show groups with open capacity
  onlyCam: false, // Filter cam-study groups
  onlyOpen: true, // Filter open groups (non-password/direct)
  page: 1,
  limit: 20,
});

for (const group of results) {
  console.log(`[${group.id}] ${group.name} (${group.memberCount}/${group.maxCapacity})`);
  console.log(
    `  Owner: ${group.owner}, Avg Study: ${group.averageStudySeconds}s, Join Type: ${group.joinType}`,
  );
}
```

### Searching Joined Groups

To filter groups the signed-in user is already part of without extra network calls:

```typescript
// Client-side search matching ID, name, category, or owner
const myPythonGroups = await client.groups.searchJoined("python");
```

---

## 2. Title Validation & Group Creation

### Validating Title Availability

Before creating a group, verify that the title satisfies YPT guidelines and is not already taken:

```typescript
const validation = await client.groups.validateTitle("Midnight Coders");

if (!validation.valid) {
  console.error("Title cannot be used:", validation.message);
}
```

### Creating a New Group

Create a group with customizable rules, daily study minimums, chat permissions, and joining policies:

```typescript
const newGroup = await client.groups.create({
  title: "Midnight Coders",
  categoryId: 1,
  description: "Focused study group for nocturnal programmers.",
  maxPeopleNum: 30, // Maximum capacity
  joinType: "DIRECT", // "DIRECT" (open/password) or "APPROVAL" (application questions)
  minDailyStudySeconds: 14400, // 4 hours daily minimum requirement
  allowChat: true,
});

console.log(`Created group: ID ${newGroup.id}, Title: ${newGroup.title}`);
```

For PIN-protected groups:

```typescript
const pinGroup = await client.groups.create({
  title: "Private Study Room",
  categoryId: 1,
  maxPeopleNum: 10,
  joinType: "DIRECT",
  password: "secretpassword123",
});
```

For screening application groups:

```typescript
const screeningGroup = await client.groups.create({
  title: "Med School Prep",
  categoryId: 5,
  maxPeopleNum: 25,
  joinType: "APPROVAL",
  questions: ["What is your target exam date?", "How many hours do you commit to daily?"],
});
```

---

## 3. Joining & Applications

### Joining an Open or PIN-Protected Group

```typescript
// Open group
await client.groups.join(6814572);

// PIN-protected group
await client.groups.join(6814572, { password: "secretpassword123" });
```

### Applying with Screening Question Answers

When a group has `joinType: "APPROVAL"`, submit answers to the group's screening questions:

```typescript
await client.groups.apply(6814572, {
  answers: ["December 2026", "Minimum 6 hours daily, focusing on Pathology and Anatomy"],
});
```

### Reviewing Applicants (Leaders / Managers)

Leaders and Managers can approve or reject incoming membership applications:

```typescript
// Approve applicant
await client.groups.reviewApplicant(6814572, {
  applicantUserId: 16300695,
  approved: true,
});

// Reject applicant with an optional reason
await client.groups.reviewApplicant(6814572, {
  applicantUserId: 19482103,
  approved: false,
  rejectReason: "Study group has reached maximum subject diversity limit.",
});
```

### Leaving a Group

```typescript
await client.groups.leave(6814572);
```

---

## 4. Live Roster & Real-Time Telemetry

### Fetching Group Members

`client.groups.getMembers(groupId, options?)` queries `GET /logs/group/members/v2` and computes active study progress in real time.

```typescript
const members = await client.groups.getMembers(6814572, {
  includeAllUsers: true, // Include inactive/offline members
});

for (const member of members) {
  console.log(`Member: ${member.nickname} (ID: ${member.userId})`);
  console.log(`  Role: ${member.role ?? "Member"}`);
  console.log(`  Currently Studying: ${member.isStudying ? "YES" : "NO"}`);
  console.log(`  Current Subject: ${member.currentSubject ?? "None"}`);
  console.log(`  Today's Study Time: ${member.todayStudyTime}`);
  console.log(`  Live Elapsed Time: ${member.liveStudyTime}`);

  if (member.hasActiveCam) {
    console.log(`  Active Cam Snapshot: ${member.camSnapshotUrl}`);
  }
}
```

### Cross-Group Merged Roster

`client.groups.listAllMembers()` aggregates members across **all** groups you belong to, deduplicating users and tracking live study time across groups.

```typescript
const result = await client.groups.listAllMembers({ concurrency: 3 });

console.log(`Total unique members across all groups: ${result.uniqueMemberCount}`);
console.log(
  `Top student right now: ${result.members[0].nickname} (${result.members[0].liveStudyTime})`,
);
```

---

## 5. Attendance & Daily Study Tracking

Query daily study times and streak compliance across a custom date range using `client.groups.getAttendances()`:

```typescript
const attendance = await client.groups.getAttendances(6814572, "2026-10-01", "2026-10-07");

console.log(`Attendance matrix from ${attendance.startDate} to ${attendance.endDate}:`);

for (const user of attendance.attendances) {
  console.log(
    `${user.nickname} (Streak: ${user.streakDays ?? 0} days, Total: ${user.totalSeconds ?? 0}s)`,
  );
  for (const day of user.days) {
    console.log(`  - ${day.date}: ${day.studySeconds}s (${day.passed ? "PASSED" : "FAILED"})`);
  }
}
```

---

## 6. Group Leaderboards

Retrieve study time rankings for any group across daily, weekly, monthly, or total horizons:

```typescript
// Horizons: "daily" | "weekly" | "monthly" | "total"
const leaderboard = await client.groups.getLeaderboard(6814572, "weekly");

console.log(`=== Weekly Leaderboard ===`);
for (const entry of leaderboard.ranks) {
  console.log(`#${entry.rank} ${entry.nickname} - ${entry.studyTime}`);
}
```

---

## 7. Moderation & Blacklist

Group leaders and managers can moderate their group members using strikes, kicking, and permanent blacklists.

### Warnings & Strikes

Issue or cancel official warning strikes for members violating group study rules:

```typescript
// Issue warning strike
await client.groups.warnMember(6814572, 19482103);

// Revoke/cancel previous warning strike
await client.groups.cancelWarning(6814572, 19482103);
```

### Kicking Members

Expel a member from the group (they can still reapply or rejoin unless blacklisted):

```typescript
await client.groups.kickMember(6814572, 19482103);
```

### Blacklist Management

Permanently ban members from ever rejoining the group:

```typescript
// Add user to blacklist
await client.groups.blacklistMember(6814572, 19482103);

// Fetch all currently blacklisted users
const blacklisted = await client.groups.listBlacklist(6814572);
for (const u of blacklisted) {
  console.log(`Banned User: ${u.nickname} (ID: ${u.userId}) at ${u.createdAt}`);
}

// Remove user from blacklist (unban)
await client.groups.removeBlacklist(6814572, 19482103);
```

---

## 8. Social & Accountability

Keep group members motivated with real-time vibration nudges, in-group chat, and announcements.

### Nudging Inactive Members (Shake)

Send an in-app vibration nudge to an individual student or all inactive members:

```typescript
// Nudge a specific inactive student
await client.groups.nudge(6814572, 19482103);

// (Manager/Owner only) High-priority vibration push to all inactive members
await client.groups.nudgeAll(6814572);
```

### Group Chat

Send text and image messages to the group's chat room:

```typescript
await client.groups.sendChatMessage(6814572, "Let's crush today's study goals!", {
  imageUrls: ["https://example.com/notes.png"],
});
```

### Group Announcements / Notices

Pin an official announcement banner to the group home with optional push notification delivery:

```typescript
await client.groups.postNotice(
  6814572,
  "Group study sprint starts this Saturday at 10:00 AM UTC.",
  {
    sendPush: true, // Send push notifications to all group members
  },
);
```

---

## 9. Upstream Quirks & Best Practices

1. **Never send `countryID` to `/logs/group/members/v2`**:
   The upstream YPT server crashes with HTTP 500 when `countryID` is included on member list requests. `ypt-js` intentionally strips this parameter to protect against upstream crashes.
2. **Dual payload handling for member rosters**:
   YPT uses both legacy (`ms: [...]` with `dl.sm` in milliseconds) and modern (`members: [...]` with `today_study_seconds` in seconds) formats. `ypt-js` seamlessly parses both formats into unified `GroupMember` instances.
3. **Respect concurrency limits**:
   When invoking `client.groups.listAllMembers()`, leave the default concurrency at `3` (or lower) to prevent triggering upstream API rate limits.
