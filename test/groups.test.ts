import { describe, expect, it } from "vitest";
import { YptClient, YptValidationError, avatarUrl, formatDuration } from "../src";
import { GROUPS_BODY, MEMBERS_BODY, mockFetch } from "./helpers";

// 15 minutes after the sample session start in the endpoint reference.
const NOW = 1773456000000 + 900000;

describe("groups", () => {
  it("lists joined groups and assigns roles by bucket", async () => {
    const { fn, calls } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptClient({ fetch: fn, token: "t" });

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
    const client = new YptClient({ fetch: fn, token: "t" });

    const groups = await client.groups.listJoined();

    expect(groups.map((g) => [g.id, g.name, g.role])).toEqual([
      [1, "A", "Owner / Manager"],
      [2, "Cam", "Cam Study"],
      [3, "Pub", "Member"],
    ]);
  });

  it("gets one joined group, or null", async () => {
    const { fn } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptClient({ fetch: fn, token: "t" });

    expect((await client.groups.get(6814572))?.name).toBe("Global Study Room");
    expect((await client.groups.get("6814572"))?.id).toBe(6814572);
    expect(await client.groups.get(1)).toBeNull();
  });

  it("searches joined groups case-insensitively by id, name, category and owner", async () => {
    const { fn } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptClient({ fetch: fn, token: "t" });

    expect((await client.groups.searchJoined("study")).map((g) => g.id)).toEqual([6814572]);
    expect((await client.groups.searchJoined("ALGO")).map((g) => g.id)).toEqual([6487271]);
    expect((await client.groups.searchJoined("computer")).map((g) => g.id)).toEqual([6487271]);
    expect((await client.groups.searchJoined("groupleader")).map((g) => g.id)).toEqual([6814572]);
    expect((await client.groups.searchJoined("6814572")).map((g) => g.id)).toEqual([6814572]);
    expect(await client.groups.searchJoined("nope")).toEqual([]);
    expect(await client.groups.searchJoined("  ")).toHaveLength(2);
  });
});

describe("members", () => {
  it("requests groupID only (never countryID) and computes live study time", async () => {
    const { fn, calls } = mockFetch(() => ({ json: MEMBERS_BODY }));
    const client = new YptClient({ fetch: fn, token: "t", now: () => NOW });

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
    const client = new YptClient({ fetch: fn, token: "t", now: () => NOW });

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
    const client = new YptClient({ fetch: fn, token: "t", now: () => NOW });

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
    const client = new YptClient({ fetch: fn, token: "t" });

    expect((await client.groups.getMembers(1)).map((m) => m.userId)).toEqual([5]);
    expect(await client.groups.getMembers(1)).toEqual([]);
  });

  it("rejects non-numeric group ids before making a request", async () => {
    const { fn, calls } = mockFetch(() => ({ json: MEMBERS_BODY }));
    const client = new YptClient({ fetch: fn, token: "t" });

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
    const client = new YptClient({ fetch: fn, token: "t", now: () => NOW2 });

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
    const client = new YptClient({ fetch: fn, token: "t", now: () => NOW2 });

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
    const client = new YptClient({ fetch: fn, token: "t", maxRetries: 0 });

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
    const client = new YptClient({ fetch: fn, token: "t", maxRetries: 0 });

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
