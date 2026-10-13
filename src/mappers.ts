import type {
  Group,
  GroupMember,
  GroupRole,
  RawGroup,
  RawGroupsResponse,
  RawMember,
  RawMembersResponse,
  UnifiedMember,
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
  raw: RawMember,
  now: number,
  cdnUrl: string = DEFAULT_CDN_URL,
): GroupMember | null {
  if (!isRecord(raw)) return null;
  const userId = num(raw.ud ?? raw.id);
  if (userId === null) return null;

  const dl = isRecord(raw.dl) ? raw.dl : {};
  const todayStudyMs = Math.max(0, num(dl.sm) ?? 0);
  const isStudying = Boolean(dl.is);
  const isPaused = Boolean(dl.ia ?? dl.ip);
  const sessionStartMs = num(dl.ss) ?? parseIso(dl.st);

  // While studying, `sm` only holds the time recorded up to the session start,
  // so the running session has to be added on top.
  const sessionElapsedMs =
    isStudying && sessionStartMs !== null && now > sessionStartMs ? now - sessionStartMs : 0;
  const liveStudyMs = todayStudyMs + sessionElapsedMs;

  const studiconId = num(raw.sd ?? raw.si);
  const hasCustomAvatar = Boolean(raw.hasCustomAvatar);

  return {
    userId,
    nickname: str(raw.n) ?? "",
    category: str(raw.ct),
    isStudying,
    isPaused,
    currentSubject: str(dl.sn) ?? str(dl.sb) ?? str(dl.tt),
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
    avatarUrl: avatarUrl({ userId, studiconId, hasCustomAvatar }, cdnUrl),
  };
}

export function mapMembers(
  raw: RawMembersResponse,
  now: number,
  cdnUrl: string = DEFAULT_CDN_URL,
): GroupMember[] {
  if (!Array.isArray(raw.ms)) return [];
  const members: GroupMember[] = [];
  for (const item of raw.ms) {
    const member = mapMember(item, now, cdnUrl);
    if (member) members.push(member);
  }
  return members;
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
