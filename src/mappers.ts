import type {
  Group,
  GroupAttendanceResult,
  GroupLeaderboardResult,
  GroupMember,
  GroupMemberRole,
  GroupRole,
  LeaderboardType,
  RawAttendanceResponse,
  RawGroup,
  RawGroupsResponse,
  RawMember,
  RawMembersResponse,
  RawModernGroupMember,
  RawRanksResponse,
  RawSearchGroupsResponse,
  RawSignInResponse,
  SearchGroupResult,
  UnifiedMember,
  YptUser,
} from "./types";

export const DEFAULT_CDN_URL = "https://alicdn.tgclab.com";

// ---------------------------------------------------------------------------
// Small coercion helpers (the API mixes numbers and numeric strings)
// ---------------------------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function parseIso(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

// ---------------------------------------------------------------------------
// Formatting / URLs
// ---------------------------------------------------------------------------

/** Formats milliseconds as `HH:MM:SS` (hours may exceed 99). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * Avatar URL for a member: the custom profile picture when they have one,
 * otherwise their default "Studicon". `null` if neither can be determined.
 */
export function avatarUrl(
  member: { userId: number; studiconId: number | null; hasCustomAvatar: boolean },
  cdnUrl: string = DEFAULT_CDN_URL,
): string | null {
  const base = cdnUrl.replace(/\/+$/, "");
  if (member.hasCustomAvatar) return `${base}/user/profile/${member.userId}.jpg`;
  if (member.studiconId !== null) return `${base}/sc.v2/${member.studiconId}/normal1.png`;
  return null;
}

// ---------------------------------------------------------------------------
// Authentication & User Mappers
// ---------------------------------------------------------------------------

export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a password according to YPT client rules:
 * - Minimum 8 characters
 * - Must include characters from at least 2 categories (uppercase, lowercase, numbers, special symbols)
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (typeof password !== "string" || password.length < 8) {
    return {
      valid: false,
      reason: "Password must be at least 8 characters long.",
    };
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const categories = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
  if (categories < 2) {
    return {
      valid: false,
      reason:
        "Password must contain characters from at least 2 categories: uppercase, lowercase, numbers, or special symbols.",
    };
  }

  return { valid: true };
}

/**
 * Normalizes either legacy or modern YPT sign-in/social response into a typed YptUser.
 */
export function mapUser(raw: RawSignInResponse, fallbackEmail: string = ""): YptUser {
  const rawUser = raw.user;
  const idVal = rawUser?.id ?? raw.id ?? raw.ud;
  const idNum = num(idVal) ?? 0;
  const nickname = str(rawUser?.nickname ?? raw.n) ?? "";
  const email = str(rawUser?.email ?? raw.e) ?? fallbackEmail;
  const today = str(raw.today) ?? null;
  const statusMsg = str(rawUser?.status_msg ?? rawUser?.statusMsg);
  const profileImage = str(rawUser?.profile_image ?? rawUser?.profileImage);
  const flames = typeof rawUser?.flames === "number" ? rawUser.flames : undefined;
  const tier = str(rawUser?.tier);
  const createdAt = str(rawUser?.created_at ?? rawUser?.createdAt);
  const socialType = str(rawUser?.social_type ?? rawUser?.socialType) as YptUser["socialType"];

  const user: YptUser = {
    id: idNum,
    nickname,
    email,
    today,
  };

  if (statusMsg) user.statusMsg = statusMsg;
  if (profileImage) user.profileImage = profileImage;
  if (typeof flames === "number") user.flames = flames;
  if (tier) user.tier = tier;
  if (createdAt) user.createdAt = createdAt;
  if (socialType) user.socialType = socialType;

  return user;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

function mapGroup(raw: RawGroup, role: GroupRole): Group | null {
  if (!isRecord(raw)) return null;
  const id = num(raw.id);
  if (id === null) return null;
  return {
    id,
    name: str(raw.t) ?? str(raw.n) ?? "",
    category: str(raw.c),
    owner: str(raw.on),
    role,
    memberCount: num(raw.jc) ?? 0,
    maxCapacity: num(raw.mc) ?? 0,
    isPrivate: Boolean(raw.ip ?? raw.p),
    notice: str(raw.sn),
  };
}

/**
 * Flattens the four group buckets into one list. If the same group id shows up
 * in more than one bucket, the first one wins (managed > cam study > general > public).
 */
export function mapGroups(raw: RawGroupsResponse): Group[] {
  const buckets: Array<[RawGroup[] | undefined, GroupRole]> = [
    [raw.ms, "Owner / Manager"],
    [raw.cs, "Cam Study"],
    [raw.gs, "Member"],
    [raw.ps, "Member"],
  ];
  const seen = new Set<number>();
  const groups: Group[] = [];
  for (const [list, role] of buckets) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const group = mapGroup(item, role);
      if (group && !seen.has(group.id)) {
        seen.add(group.id);
        groups.push(group);
      }
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export function mapMember(
  raw: RawMember | RawModernGroupMember,
  now: number,
  cdnUrl: string = DEFAULT_CDN_URL,
): GroupMember | null {
  if (!isRecord(raw)) return null;

  const rawModern = raw as RawModernGroupMember;
  const rawLegacy = raw as RawMember;

  const userId = num(rawModern.user_id ?? rawModern.userId ?? rawLegacy.ud ?? rawLegacy.id);
  if (userId === null) return null;

  const dl = isRecord(rawLegacy.dl) ? rawLegacy.dl : {};

  // Study seconds: modern sends today_study_seconds, legacy sends dl.sm in ms
  let todayStudyMs = 0;
  if (rawModern.today_study_seconds !== undefined) {
    todayStudyMs = Math.max(0, (num(rawModern.today_study_seconds) ?? 0) * 1000);
  } else {
    todayStudyMs = Math.max(0, num(dl.sm) ?? 0);
  }

  const isStudying =
    rawModern.is_studying !== undefined ? Boolean(rawModern.is_studying) : Boolean(dl.is);
  const isPaused = Boolean(dl.ia ?? dl.ip);
  const sessionStartMs = num(dl.ss) ?? parseIso(dl.st);

  const sessionElapsedMs =
    isStudying && sessionStartMs !== null && now > sessionStartMs ? now - sessionStartMs : 0;
  const liveStudyMs = todayStudyMs + sessionElapsedMs;

  const studiconId = num(rawLegacy.sd ?? rawLegacy.si);
  const profileImage = str(rawModern.profile_image);
  const hasCustomAvatar = Boolean(rawLegacy.hasCustomAvatar || profileImage);
  const resolvedAvatar = profileImage ?? avatarUrl({ userId, studiconId, hasCustomAvatar }, cdnUrl);

  let currentSubject: string | null = null;
  let subjectDetails: GroupMember["subjectDetails"] = undefined;
  if (isRecord(rawModern.current_subject)) {
    const sId = num(rawModern.current_subject.id) ?? 0;
    const sName = str(rawModern.current_subject.name) ?? "";
    const sColor = str(rawModern.current_subject.color) ?? undefined;
    currentSubject = sName;
    subjectDetails = { id: sId, name: sName, color: sColor };
  } else if (typeof rawModern.current_subject === "string") {
    currentSubject = str(rawModern.current_subject);
  } else {
    currentSubject = str(dl.sn) ?? str(dl.sb) ?? str(dl.tt);
  }

  const member: GroupMember = {
    userId,
    nickname: str(rawModern.nickname ?? rawLegacy.n) ?? "",
    category: str(rawLegacy.ct),
    isStudying,
    isPaused,
    currentSubject,
    studyDate: str(dl.dt),
    lastActiveDate: str(dl.dd),
    todayStudyMs,
    todayStudyTime: formatDuration(todayStudyMs),
    liveStudyMs,
    liveStudyTime: formatDuration(liveStudyMs),
    sessionStartMs,
    sessionElapsedMs,
    studiconId,
    hasCustomAvatar,
    avatarUrl: resolvedAvatar,
  };

  if (subjectDetails) member.subjectDetails = subjectDetails;
  if (rawModern.role) member.role = str(rawModern.role) as GroupMemberRole;
  if (rawModern.state_icon) member.stateIcon = str(rawModern.state_icon) ?? undefined;
  if (profileImage) member.profileImage = profileImage;
  if (typeof rawModern.has_active_cam === "boolean") member.hasActiveCam = rawModern.has_active_cam;
  if (rawModern.cam_snapshot_url !== undefined)
    member.camSnapshotUrl = str(rawModern.cam_snapshot_url);
  if (rawModern.warning_count !== undefined)
    member.warningCount = num(rawModern.warning_count) ?? undefined;

  return member;
}

export function mapMembers(
  raw: RawMembersResponse,
  now: number,
  cdnUrl: string = DEFAULT_CDN_URL,
): GroupMember[] {
  const list = Array.isArray(raw.members) ? raw.members : Array.isArray(raw.ms) ? raw.ms : [];
  const members: GroupMember[] = [];
  for (const item of list) {
    const member = mapMember(item as any, now, cdnUrl);
    if (member) members.push(member);
  }
  return members;
}

export function mapSearchGroups(raw: RawSearchGroupsResponse): SearchGroupResult[] {
  const list = Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.list) ? raw.list : [];
  return list
    .map((g) => {
      const id = num(g.id);
      if (id === null) return null;
      return {
        id,
        name: str(g.title ?? g.name) ?? "",
        description: str(g.description),
        category: str(g.category),
        categoryId: num(g.category_id),
        owner: str(g.owner),
        memberCount: num(g.members_count ?? g.member_count) ?? 0,
        maxCapacity: num(g.max_people_num ?? g.max_capacity) ?? 0,
        isPrivate: Boolean(g.is_private),
        hasCam: Boolean(g.has_cam),
        joinType: (str(g.join_type)?.toUpperCase() === "APPROVAL" ? "APPROVAL" : "DIRECT") as
          "DIRECT" | "APPROVAL",
        averageStudySeconds: num(g.avg_study_seconds),
        attendanceRate: num(g.attendance_rate),
      };
    })
    .filter((g): g is SearchGroupResult => g !== null);
}

export function mapAttendances(raw: RawAttendanceResponse): GroupAttendanceResult {
  const list = Array.isArray(raw.attendances) ? raw.attendances : [];
  return {
    startDate: str(raw.startDate ?? raw.start_date) ?? "",
    endDate: str(raw.endDate ?? raw.end_date) ?? "",
    attendances: list.map((a) => ({
      userId: num(a.userId ?? a.user_id) ?? 0,
      nickname: str(a.nickname) ?? "",
      days: Array.isArray(a.days)
        ? a.days.map((d) => ({
            date: str(d.date) ?? "",
            studySeconds: num(d.study_seconds) ?? 0,
            passed: Boolean(d.passed),
          }))
        : [],
      streakDays: num(a.streak) ?? undefined,
      totalSeconds: num(a.total_seconds) ?? undefined,
    })),
  };
}

export function mapLeaderboard(
  raw: RawRanksResponse,
  fallbackType: LeaderboardType = "daily",
): GroupLeaderboardResult {
  const list = Array.isArray(raw.ranks) ? raw.ranks : [];
  return {
    type: (str(raw.type) as LeaderboardType) ?? fallbackType,
    ranks: list.map((r, i) => {
      const seconds = num(r.study_seconds) ?? 0;
      return {
        rank: num(r.rank) ?? i + 1,
        userId: num(r.userId ?? r.user_id) ?? 0,
        nickname: str(r.nickname) ?? "",
        studySeconds: seconds,
        studyTime: formatDuration(seconds * 1000),
        profileImage: str(r.profile_image),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Cross-group merge
// ---------------------------------------------------------------------------

const isActive = (m: GroupMember) => m.isStudying && !m.isPaused;

/** Active, unpaused sessions win; otherwise the longer live duration wins. */
function incomingWins(existing: GroupMember, incoming: GroupMember): boolean {
  if (isActive(existing) !== isActive(incoming)) return isActive(incoming);
  return incoming.liveStudyMs > existing.liveStudyMs;
}

/**
 * Merges the same person seen in several groups into a single entry.
 *
 * - Session telemetry (status, subject, session start) comes from the active,
 *   unpaused entry if there is one, otherwise from the entry with most study time.
 * - `todayStudyMs` / `liveStudyMs` are the maximum seen across groups, so a
 *   flapping zero from one group can't wipe progress.
 * - Result is sorted by `liveStudyMs`, highest first.
 */
export function mergeMembers(
  entries: Array<{ group: Pick<Group, "id" | "name">; members: GroupMember[] }>,
): UnifiedMember[] {
  const byId = new Map<number, UnifiedMember>();

  for (const { group, members } of entries) {
    for (const member of members) {
      const existing = byId.get(member.userId);
      if (!existing) {
        byId.set(member.userId, { ...member, groupIds: [group.id], groupNames: [group.name] });
        continue;
      }

      const groupIds = existing.groupIds.includes(group.id)
        ? existing.groupIds
        : [...existing.groupIds, group.id];
      const groupNames = existing.groupIds.includes(group.id)
        ? existing.groupNames
        : [...existing.groupNames, group.name];

      const base = incomingWins(existing, member) ? member : existing;
      const todayStudyMs = Math.max(existing.todayStudyMs, member.todayStudyMs);
      const liveStudyMs = Math.max(existing.liveStudyMs, member.liveStudyMs);

      byId.set(member.userId, {
        ...base,
        todayStudyMs,
        todayStudyTime: formatDuration(todayStudyMs),
        liveStudyMs,
        liveStudyTime: formatDuration(liveStudyMs),
        groupIds,
        groupNames,
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.liveStudyMs - a.liveStudyMs);
}
