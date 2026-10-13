import { describe, expect, it } from "vitest";
import { YptJs, YptValidationError, avatarUrl, formatDuration } from "../src";
import { GROUPS_BODY, MEMBERS_BODY, mockFetch } from "./helpers";

// 15 minutes after the sample session start in the endpoint reference.
const NOW = 1773456000000 + 900000;

describe("groups", () => {
  it("lists joined groups and assigns roles by bucket", async () => {
    const { fn, calls } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptJs({ fetch: fn, token: "t" });

    const groups = await client.groups.listJoined();

    expect(calls[0].url.pathname).toBe("/group/groups/v2");
    expect(groups).toEqual([
      {
        id: 6487271,
        name: "Algorithm Masters",
        category: "Computer Science",
        owner: "BotAdmin",
        role: "Owner / Manager",
        memberCount: 30,
        maxCapacity: 50,
        isPrivate: true,
        notice: "Daily minimum: 4 hours",
      },
      {
        id: 6814572,
        name: "Global Study Room",
        category: "General",
        owner: "GroupLeader",
        role: "Member",
        memberCount: 48,
        maxCapacity: 50,
        isPrivate: false,
        notice: "Welcome everyone!",
      },
    ]);
  });

  it("maps cam-study groups and ignores duplicate ids across buckets", async () => {
    const { fn } = mockFetch(() => ({
      json: {
        s: true,
        ms: [{ id: 1, t: "A" }],
        cs: [{ id: 2, t: "Cam" }],
        gs: [{ id: 1, t: "A again" }],
        ps: [{ id: 3, t: "Pub" }],
      },
    }));
    const client = new YptJs({ fetch: fn, token: "t" });

    const groups = await client.groups.listJoined();

    expect(groups.map((g) => [g.id, g.name, g.role])).toEqual([
      [1, "A", "Owner / Manager"],
      [2, "Cam", "Cam Study"],
      [3, "Pub", "Member"],
    ]);
  });

  it("gets one joined group, or null", async () => {
    const { fn } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptJs({ fetch: fn, token: "t" });

    expect((await client.groups.get(6814572))?.name).toBe("Global Study Room");
    expect((await client.groups.get("6814572"))?.id).toBe(6814572);
    expect(await client.groups.get(1)).toBeNull();
  });

  it("searches joined groups case-insensitively by id, name, category and owner", async () => {
    const { fn } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptJs({ fetch: fn, token: "t" });

    expect((await client.groups.searchJoined("study")).map((g) => g.id)).toEqual([6814572]);
    expect((await client.groups.searchJoined("ALGO")).map((g) => g.id)).toEqual([6487271]);
    expect((await client.groups.searchJoined("computer")).map((g) => g.id)).toEqual([6487271]);
    expect((await client.groups.searchJoined("groupleader")).map((g) => g.id)).toEqual([6814572]);
    expect((await client.groups.searchJoined("6814572")).map((g) => g.id)).toEqual([6814572]);
    expect(await client.groups.searchJoined("nope")).toEqual([]);
    expect(await client.groups.searchJoined("  ")).toHaveLength(2);
  });
});

describe("group search & creation", () => {
  it("searches groups with filters and maps search results", async () => {
    const { fn, calls } = mockFetch(() => ({
      json: {
        s: true,
        groups: [
          {
            id: 12345,
            title: "Study Zone",
            category: "College",
            category_id: 1,
            owner: "LeaderBob",
            members_count: 25,
            max_people_num: 50,
            is_private: false,
            has_cam: true,
            join_type: "DIRECT",
            avg_study_seconds: 14400,
            attendance_rate: 92,
            description: "Daily grind",
          },
        ],
      },
    }));
    const client = new YptJs({ fetch: fn, token: "t" });

    const results = await client.groups.search({
      q: "Study",
      categoryId: 1,
      orderType: "attendance",
      onlyAvailable: true,
      onlyCam: true,
      onlyOpen: true,
      page: 1,
      limit: 20,
    });

    expect(calls[0].url.pathname).toBe("/group/list/search-2");
    expect(calls[0].url.searchParams.get("q")).toBe("Study");
    expect(calls[0].url.searchParams.get("category_id")).toBe("1");
    expect(calls[0].url.searchParams.get("order_type")).toBe("attendance");
    expect(calls[0].url.searchParams.get("only_available")).toBe("true");
    expect(calls[0].url.searchParams.get("only_cam")).toBe("true");
    expect(calls[0].url.searchParams.get("only_open")).toBe("true");

    expect(results).toEqual([
      {
        id: 12345,
        name: "Study Zone",
        category: "College",
        categoryId: 1,
        owner: "LeaderBob",
        memberCount: 25,
        maxCapacity: 50,
        isPrivate: false,
        hasCam: true,
        joinType: "DIRECT",
        averageStudySeconds: 14400,
        attendanceRate: 92,
        description: "Daily grind",
      },
    ]);
  });

  it("validates group title and rejects empty title", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    const res = await client.groups.validateTitle("Focus Hall");
    expect(calls[0].url.pathname).toBe("/group/make/title/validate");
    expect(calls[0].body).toEqual({ title: "Focus Hall" });
    expect(res).toEqual({ valid: true, message: undefined });

    await expect(client.groups.validateTitle("   ")).rejects.toBeInstanceOf(YptValidationError);
  });

  it("creates a group and returns group id", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true, id: 98765 } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    const created = await client.groups.create({
      title: "Morning Routine",
      categoryId: 2,
      description: "Early birds",
      maxPeopleNum: 30,
      joinType: "DIRECT",
      minDailyStudySeconds: 7200,
      allowChat: true,
    });

    expect(calls[0].url.pathname).toBe("/group/make/v2");
    expect(calls[0].body).toEqual({
      title: "Morning Routine",
      category_id: 2,
      description: "Early birds",
      maxPeopleNum: 30,
      join_type: "DIRECT",
      password: null,
      min_daily_study_seconds: 7200,
      questions: undefined,
      allow_chat: true,
    });
    expect(created).toEqual({ id: 98765, title: "Morning Routine" });
  });
});

describe("group membership & applications", () => {
  it("joins an open or password-protected group", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.join(12345);
    expect(calls[0].url.pathname).toBe("/group/join/v2");
    expect(calls[0].body).toEqual({ group_id: 12345, password: undefined });

    await client.groups.join("12345", { password: "secret-pass" });
    expect(calls[1].body).toEqual({ group_id: 12345, password: "secret-pass" });
  });

  it("applies to an approval-required group with answers", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.apply(12345, { answers: ["Goal: 5 hours", "Focus: CS"] });
    expect(calls[0].url.pathname).toBe("/group/group-user/join-info");
    expect(calls[0].body).toEqual({
      group_id: 12345,
      answers: ["Goal: 5 hours", "Focus: CS"],
    });
  });

  it("reviews group applicant with approval or rejection", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.reviewApplicant(12345, {
      applicantUserId: 999,
      approved: true,
    });
    expect(calls[0].url.pathname).toBe("/group/group-user/join/approve-or-reject");
    expect(calls[0].body).toEqual({
      group_id: 12345,
      applicant_user_id: 999,
      approved: true,
      reject_reason: null,
    });

    await client.groups.reviewApplicant(12345, {
      applicantUserId: 999,
      approved: false,
      rejectReason: "Capacity reached",
    });
    expect(calls[1].body).toEqual({
      group_id: 12345,
      applicant_user_id: 999,
      approved: false,
      reject_reason: "Capacity reached",
    });
  });

  it("leaves a group", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.leave(12345);
    expect(calls[0].url.pathname).toBe("/group/leave");
    expect(calls[0].body).toEqual({ group_id: 12345 });

    await client.groups.leave(12345, 100);
    expect(calls[1].body).toEqual({ group_id: 12345, userId: 100 });
  });
});

describe("group moderation", () => {
  it("warns and cancels warning for a member", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.warnMember(12345, 555);
    expect(calls[0].url.pathname).toBe("/group/warn");
    expect(calls[0].body).toEqual({ group_id: 12345, userId: 555 });

    await client.groups.cancelWarning(12345, 555);
    expect(calls[1].url.pathname).toBe("/group/warn/cancel");
    expect(calls[1].body).toEqual({ group_id: 12345, userId: 555 });
  });

  it("kicks a member from group", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.kickMember(12345, 555);
    expect(calls[0].url.pathname).toBe("/group/kick-out");
    expect(calls[0].body).toEqual({ group_id: 12345, userId: 555 });
  });

  it("manages blacklist (add, delete, list)", async () => {
    const { fn, calls } = mockFetch((call) => {
      if (call.url.pathname === "/group/black/all") {
        return {
          json: {
            s: true,
            users: [{ userId: 555, nickname: "BannedUser", created_at: "2026-10-10T12:00:00Z" }],
          },
        };
      }
      return { json: { s: true } };
    });
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.blacklistMember(12345, 555);
    expect(calls[0].url.pathname).toBe("/group/black/add");
    expect(calls[0].body).toEqual({ group_id: 12345, userId: 555 });

    await client.groups.removeBlacklist(12345, 555);
    expect(calls[1].url.pathname).toBe("/group/black/delete");
    expect(calls[1].body).toEqual({ group_id: 12345, userId: 555 });

    const blacklist = await client.groups.listBlacklist(12345);
    expect(calls[2].url.pathname).toBe("/group/black/all");
    expect(calls[2].url.searchParams.get("group_id")).toBe("12345");
    expect(blacklist).toEqual([
      { userId: 555, nickname: "BannedUser", createdAt: "2026-10-10T12:00:00Z" },
    ]);
  });
});

describe("modern members payload and options", () => {
  it("parses modern members array with roles, subjects, and study seconds", async () => {
    const { fn, calls } = mockFetch(() => ({
      json: {
        s: true,
        members: [
          {
            user_id: 777,
            nickname: "ModernStudent",
            role: "LEADER",
            is_studying: true,
            today_study_seconds: 7200,
            current_subject: {
              id: 10,
              name: "Quantum Mechanics",
              color: "#FF5733",
            },
            profile_image: "https://picf.tgclab.com/users/777.jpg",
            has_active_cam: true,
            cam_snapshot_url: "https://cam.tgclab.com/snap/777.jpg",
            warning_count: 1,
            state_icon: "flame",
          },
        ],
      },
    }));
    const client = new YptJs({ fetch: fn, token: "t", now: () => NOW });

    const members = await client.groups.getMembers(12345, { includeAllUsers: true });

    expect(calls[0].url.pathname).toBe("/logs/group/members/v2");
    expect(calls[0].url.searchParams.get("groupID")).toBe("12345");
    expect(calls[0].url.searchParams.get("include_all_users")).toBe("true");

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      userId: 777,
      nickname: "ModernStudent",
      role: "LEADER",
      isStudying: true,
      todayStudyMs: 7200000,
      todayStudyTime: "02:00:00",
      currentSubject: "Quantum Mechanics",
      subjectDetails: {
        id: 10,
        name: "Quantum Mechanics",
        color: "#FF5733",
      },
      profileImage: "https://picf.tgclab.com/users/777.jpg",
      avatarUrl: "https://picf.tgclab.com/users/777.jpg",
      hasActiveCam: true,
      camSnapshotUrl: "https://cam.tgclab.com/snap/777.jpg",
      warningCount: 1,
      stateIcon: "flame",
    });
  });
});

describe("attendance & leaderboard", () => {
  it("fetches attendance matrix across date range", async () => {
    const { fn, calls } = mockFetch(() => ({
      json: {
        s: true,
        startDate: "2026-10-01",
        endDate: "2026-10-07",
        attendances: [
          {
            userId: 100,
            nickname: "Alex",
            streak: 5,
            total_seconds: 36000,
            days: [
              { date: "2026-10-01", study_seconds: 7200, passed: true },
              { date: "2026-10-02", study_seconds: 0, passed: false },
            ],
          },
        ],
      },
    }));
    const client = new YptJs({ fetch: fn, token: "t" });

    const res = await client.groups.getAttendances(12345, "2026-10-01", "2026-10-07");

    expect(calls[0].url.pathname).toBe("/logs/v70701/group/attendances");
    expect(calls[0].url.searchParams.get("group_id")).toBe("12345");
    expect(calls[0].url.searchParams.get("startDate")).toBe("2026-10-01");
    expect(calls[0].url.searchParams.get("endDate")).toBe("2026-10-07");

    expect(res).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      attendances: [
        {
          userId: 100,
          nickname: "Alex",
          streakDays: 5,
          totalSeconds: 36000,
          days: [
            { date: "2026-10-01", studySeconds: 7200, passed: true },
            { date: "2026-10-02", studySeconds: 0, passed: false },
          ],
        },
      ],
    });
  });

  it("fetches group leaderboard by type", async () => {
    const { fn, calls } = mockFetch(() => ({
      json: {
        s: true,
        type: "weekly",
        ranks: [
          {
            rank: 1,
            user_id: 100,
            nickname: "Champion",
            study_seconds: 72000,
            profile_image: "https://picf.tgclab.com/users/100.jpg",
          },
        ],
      },
    }));
    const client = new YptJs({ fetch: fn, token: "t" });

    const res = await client.groups.getLeaderboard(12345, "weekly");

    expect(calls[0].url.pathname).toBe("/logs/group/member/ranks");
    expect(calls[0].url.searchParams.get("group_id")).toBe("12345");
    expect(calls[0].url.searchParams.get("type")).toBe("weekly");

    expect(res).toEqual({
      type: "weekly",
      ranks: [
        {
          rank: 1,
          userId: 100,
          nickname: "Champion",
          studySeconds: 72000,
          studyTime: "20:00:00",
          profileImage: "https://picf.tgclab.com/users/100.jpg",
        },
      ],
    });
  });
});

describe("social & accountability", () => {
  it("nudges single member and all members", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.nudge(12345, 888);
    expect(calls[0].url.pathname).toBe("/group/push/shake");
    expect(calls[0].body).toEqual({ group_id: 12345, target_user_id: 888 });

    await client.groups.nudgeAll(12345);
    expect(calls[1].url.pathname).toBe("/group/push/shake/all");
    expect(calls[1].body).toEqual({ group_id: 12345 });
  });

  it("sends chat message and validates empty text", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.sendChatMessage(12345, "Let's study hard today!", {
      imageUrls: ["https://example.com/notes.png"],
    });
    expect(calls[0].url.pathname).toBe("/group/chat");
    expect(calls[0].body).toEqual({
      group_id: 12345,
      message: "Let's study hard today!",
      image_urls: ["https://example.com/notes.png"],
    });

    await expect(client.groups.sendChatMessage(12345, "  ")).rejects.toBeInstanceOf(
      YptValidationError,
    );
  });

  it("posts official group notice and validates empty content", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await client.groups.postNotice(12345, "Meeting at 9 PM", { sendPush: false });
    expect(calls[0].url.pathname).toBe("/group/notice");
    expect(calls[0].body).toEqual({
      group_id: 12345,
      content: "Meeting at 9 PM",
      send_push: false,
    });

    await expect(client.groups.postNotice(12345, "")).rejects.toBeInstanceOf(YptValidationError);
  });
});

describe("members", () => {
  it("requests groupID only (never countryID) and computes live study time", async () => {
    const { fn, calls } = mockFetch(() => ({ json: MEMBERS_BODY }));
    const client = new YptJs({ fetch: fn, token: "t", now: () => NOW });

    const members = await client.groups.getMembers(6814572);

    expect(calls[0].url.pathname).toBe("/logs/group/members/v2");
    expect(calls[0].url.searchParams.get("groupID")).toBe("6814572");
    expect(calls[0].url.searchParams.has("countryID")).toBe(false);

    expect(members).toHaveLength(2);
    expect(members[0]).toEqual({
      userId: 16300695,
      nickname: "Afnan",
      category: "College",
      isStudying: true,
      isPaused: false,
      currentSubject: "Distributed Systems",
      studyDate: "2026-10-13",
      lastActiveDate: "2026-10-13",
      todayStudyMs: 14400000,
      todayStudyTime: "04:00:00",
      liveStudyMs: 15300000,
      liveStudyTime: "04:15:00",
      sessionStartMs: 1773456000000,
      sessionElapsedMs: 900000,
      studiconId: 105,
      hasCustomAvatar: false,
      avatarUrl: "https://alicdn.tgclab.com/sc.v2/105/normal1.png",
    });
    expect(members[1]).toMatchObject({
      userId: 19482103,
      nickname: "Sarah",
      isStudying: false,
      currentSubject: null,
      sessionElapsedMs: 0,
      liveStudyMs: 7200000,
      liveStudyTime: "02:00:00",
      avatarUrl: "https://alicdn.tgclab.com/user/profile/19482103.jpg",
    });
  });

  it("adds no elapsed time when the session start is in the future or unknown", async () => {
    const { fn } = mockFetch(() => ({
      json: {
        s: true,
        ms: [
          { ud: 1, n: "future", dl: { sm: 1000, is: true, ss: NOW + 60_000 } },
          { ud: 2, n: "no-start", dl: { sm: 2000, is: true } },
        ],
      },
    }));
    const client = new YptJs({ fetch: fn, token: "t", now: () => NOW });

    const [future, noStart] = await client.groups.getMembers(1);

    expect(future.liveStudyMs).toBe(1000);
    expect(noStart.liveStudyMs).toBe(2000);
  });

  it("understands alternate keys (ip, st, sb, si, id)", async () => {
    const { fn } = mockFetch(() => ({
      json: {
        s: true,
        ms: [
          {
            id: "42",
            n: "Alt",
            si: 7,
            dl: {
              sm: "5000",
              is: true,
              ip: true,
              st: new Date(NOW - 1000).toISOString(),
              sb: "Math",
            },
          },
        ],
      },
    }));
    const client = new YptJs({ fetch: fn, token: "t", now: () => NOW });

    const [m] = await client.groups.getMembers(1);

    expect(m).toMatchObject({
      userId: 42,
      isStudying: true,
      isPaused: true,
      currentSubject: "Math",
      todayStudyMs: 5000,
      sessionElapsedMs: 1000,
      liveStudyMs: 6000,
      studiconId: 7,
    });
  });

  it("skips malformed members and tolerates a missing ms array", async () => {
    const { fn } = mockFetch((_c, n) =>
      n === 1
        ? { json: { s: true, ms: [null, { n: "no id" }, { ud: 5, n: "ok" }] } }
        : { json: { s: true } },
    );
    const client = new YptJs({ fetch: fn, token: "t" });

    expect((await client.groups.getMembers(1)).map((m) => m.userId)).toEqual([5]);
    expect(await client.groups.getMembers(1)).toEqual([]);
  });

  it("rejects non-numeric group ids before making a request", async () => {
    const { fn, calls } = mockFetch(() => ({ json: MEMBERS_BODY }));
    const client = new YptJs({ fetch: fn, token: "t" });

    await expect(client.groups.getMembers("1&countryID=KR")).rejects.toBeInstanceOf(
      YptValidationError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("listAllMembers", () => {
  const NOW2 = 1_000_000;
  const twoGroups = {
    s: true,
    gs: [
      { id: 1, t: "A" },
      { id: 2, t: "B" },
    ],
  };

  it("merges duplicates across groups and sorts by live study time", async () => {
    const { fn } = mockFetch((c) => {
      if (c.url.pathname === "/group/groups/v2") return { json: twoGroups };
      return c.url.searchParams.get("groupID") === "1"
        ? {
            json: {
              s: true,
              ms: [
                { ud: 10, n: "X", dl: { sm: 1000, is: false } },
                { ud: 11, n: "Y", dl: { sm: 5000, is: false } },
              ],
            },
          }
        : {
            json: {
              s: true,
              ms: [
                {
                  ud: 10,
                  n: "X",
                  dl: { sm: 3000, is: true, ia: false, ss: NOW2 - 1000, sn: "Math" },
                },
              ],
            },
          };
    });
    const client = new YptJs({ fetch: fn, token: "t", now: () => NOW2 });

    const result = await client.groups.listAllMembers();

    expect(result).toMatchObject({
      totalGroups: 2,
      successfulGroups: 2,
      failedGroups: [],
      totalRawMembers: 3,
      uniqueMemberCount: 2,
      duplicatesRemoved: 1,
    });
    expect(result.members.map((m) => m.userId)).toEqual([11, 10]); // 5000 > 4000
    expect(result.members[1]).toMatchObject({
      isStudying: true,
      currentSubject: "Math",
      liveStudyMs: 4000,
      groupIds: [1, 2],
      groupNames: ["A", "B"],
    });
  });

  it("keeps the highest duration even when the active entry reports less", async () => {
    const { fn } = mockFetch((c) => {
      if (c.url.pathname === "/group/groups/v2") return { json: twoGroups };
      return c.url.searchParams.get("groupID") === "1"
        ? { json: { s: true, ms: [{ ud: 10, n: "X", dl: { sm: 9000, is: false } }] } }
        : {
            json: {
              s: true,
              ms: [{ ud: 10, n: "X", dl: { sm: 0, is: true, ss: NOW2 - 500, sn: "Bio" } }],
            },
          };
    });
    const client = new YptJs({ fetch: fn, token: "t", now: () => NOW2 });

    const { members } = await client.groups.listAllMembers();

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      currentSubject: "Bio",
      isStudying: true,
      liveStudyMs: 9000,
      todayStudyMs: 9000,
    });
  });

  it("reports failed groups without aborting", async () => {
    const { fn } = mockFetch((c) => {
      if (c.url.pathname === "/group/groups/v2") return { json: twoGroups };
      return c.url.searchParams.get("groupID") === "1"
        ? { json: { s: true, ms: [{ ud: 10, n: "X", dl: { sm: 1000 } }] } }
        : { status: 500, json: {} };
    });
    const client = new YptJs({ fetch: fn, token: "t", maxRetries: 0 });

    const result = await client.groups.listAllMembers();

    expect(result.successfulGroups).toBe(1);
    expect(result.failedGroups).toHaveLength(1);
    expect(result.failedGroups[0].groupId).toBe(2);
    expect(result.uniqueMemberCount).toBe(1);
  });

  it("throws when every group fails", async () => {
    const { fn } = mockFetch((c) =>
      c.url.pathname === "/group/groups/v2" ? { json: twoGroups } : { status: 500, json: {} },
    );
    const client = new YptJs({ fetch: fn, token: "t", maxRetries: 0 });

    await expect(client.groups.listAllMembers()).rejects.toMatchObject({ status: 500 });
  });
});

describe("helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(15_300_000)).toBe("04:15:00");
    expect(formatDuration(360_000_000)).toBe("100:00:00");
    expect(formatDuration(-5)).toBe("00:00:00");
  });

  it("builds avatar URLs", () => {
    expect(avatarUrl({ userId: 1, studiconId: 105, hasCustomAvatar: false })).toBe(
      "https://alicdn.tgclab.com/sc.v2/105/normal1.png",
    );
    expect(avatarUrl({ userId: 1, studiconId: 105, hasCustomAvatar: true })).toBe(
      "https://alicdn.tgclab.com/user/profile/1.jpg",
    );
    expect(avatarUrl({ userId: 1, studiconId: null, hasCustomAvatar: false })).toBeNull();
  });
});
