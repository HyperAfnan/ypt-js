// ---------------------------------------------------------------------------
// Raw wire types: YPT's minified JSON. Loosely typed on purpose, because the
// API is undocumented and individual fields come and go.
// ---------------------------------------------------------------------------

export interface RawEnvelope {
  /** `true` on success, `false` on error. */
  s: boolean;
  /** Error code (only on errors). */
  c?: number | string;
  /** Error message (only on errors). */
  m?: string;
}

export interface RawSignInResponse extends RawEnvelope {
  jwt?: string;
  id?: number | string;
  ud?: number | string;
  n?: string;
  e?: string;
  today?: string;
}

export interface RawGroup {
  id?: number | string;
  /** Group title (some payloads use `n`). */
  t?: string;
  n?: string;
  /** Category. */
  c?: string;
  /** Owner nickname. */
  on?: string;
  /** Joined member count. */
  jc?: number | string;
  /** Max member capacity. */
  mc?: number | string;
  /** Private flag (some payloads use `p`). */
  ip?: unknown;
  p?: unknown;
  /** Notice / description. */
  sn?: string;
}

export interface RawGroupsResponse extends RawEnvelope {
  /** Managed groups. */
  ms?: RawGroup[];
  /** Cam-study groups. */
  cs?: RawGroup[];
  /** General groups. */
  gs?: RawGroup[];
  /** Public groups. */
  ps?: RawGroup[];
}

export interface RawDailyLog {
  /** Accumulated study ms recorded today. */
  sm?: number | string;
  /** Currently studying. */
  is?: unknown;
  /** Paused (`ia` or `ip`). */
  ia?: unknown;
  ip?: unknown;
  /** Session start, epoch ms. */
  ss?: number | string;
  /** Session start, ISO-8601. */
  st?: string;
  /** Current subject (`sn`, `sb` or `tt`). */
  sn?: string | null;
  sb?: string | null;
  tt?: string | null;
  /** Study date (`YYYY-MM-DD`). */
  dt?: string;
  /** Last active date. */
  dd?: string;
}

export interface RawMember {
  ud?: number | string;
  id?: number | string;
  n?: string;
  ct?: string;
  /** Studicon avatar id (`sd` or `si`). */
  sd?: number | string;
  si?: number | string;
  hasCustomAvatar?: boolean;
  dl?: RawDailyLog;
}

export interface RawMembersResponse extends RawEnvelope {
  ms?: RawMember[];
}

// ---------------------------------------------------------------------------
// Public, friendly types
// ---------------------------------------------------------------------------

export interface YptUser {
  id: number;
  nickname: string;
  email: string;
  /** Server-side "today" (`YYYY-MM-DD`). */
  today: string | null;
}

export type GroupRole = "Owner / Manager" | "Cam Study" | "Member";

export interface Group {
  id: number;
  name: string;
  category: string | null;
  owner: string | null;
  role: GroupRole;
  memberCount: number;
  maxCapacity: number;
  isPrivate: boolean;
  notice: string | null;
}

export interface GroupMember {
  userId: number;
  nickname: string;
  category: string | null;
  isStudying: boolean;
  isPaused: boolean;
  currentSubject: string | null;
  studyDate: string | null;
  lastActiveDate: string | null;
  /** Study time recorded by YPT today, in ms (excludes the running session). */
  todayStudyMs: number;
  todayStudyTime: string;
  /** `todayStudyMs` plus the time elapsed in the current session. */
  liveStudyMs: number;
  liveStudyTime: string;
  sessionStartMs: number | null;
  sessionElapsedMs: number;
  studiconId: number | null;
  hasCustomAvatar: boolean;
  avatarUrl: string | null;
}

/** A member merged across every group they share with the signed-in user. */
export interface UnifiedMember extends GroupMember {
  groupIds: number[];
  groupNames: string[];
}

export interface UnifiedMembersResult {
  members: UnifiedMember[];
  totalGroups: number;
  successfulGroups: number;
  failedGroups: Array<{ groupId: number; error: unknown }>;
  totalRawMembers: number;
  uniqueMemberCount: number;
  duplicatesRemoved: number;
}

/** Device info sent in the splash-login handshake. Everything has a default. */
export interface SplashDevice {
  version: number;
  pushToken: string;
  timezone: string;
  deviceType: string;
  osVersion: number;
  deviceModel: string;
  pv: number;
}
