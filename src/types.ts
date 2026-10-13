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

export interface RawUser {
  id?: number | string;
  email?: string;
  nickname?: string;
  status_msg?: string;
  statusMsg?: string;
  profile_image?: string;
  profileImage?: string;
  flames?: number;
  tier?: string;
  created_at?: string;
  createdAt?: string;
  social_type?: string;
  socialType?: string;
}

export interface RawSignInResponse extends RawEnvelope {
  jwt?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: RawUser;
  id?: number | string;
  ud?: number | string;
  n?: string;
  e?: string;
  today?: string;
}

export interface RawSplashLoginResponse extends RawEnvelope {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface RawFirebaseCustomTokenResponse extends RawEnvelope {
  token?: string;
  customToken?: string;
  firebaseCustomToken?: string;
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

export interface RawCurrentSubject {
  id?: number | string;
  name?: string;
  color?: string;
}

export interface RawModernGroupMember {
  user_id?: number | string;
  userId?: number | string;
  nickname?: string;
  role?: string;
  is_studying?: boolean;
  current_subject?: RawCurrentSubject | string | null;
  today_study_seconds?: number | string;
  state_icon?: string;
  profile_image?: string;
  has_active_cam?: boolean;
  cam_snapshot_url?: string;
  warning_count?: number | string;
}

export interface RawMembersResponse extends RawEnvelope {
  ms?: RawMember[];
  members?: RawModernGroupMember[];
}

export interface RawSearchResultGroup {
  id?: number | string;
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  category_id?: number | string;
  owner?: string;
  member_count?: number | string;
  members_count?: number | string;
  max_people_num?: number | string;
  max_capacity?: number | string;
  is_private?: boolean;
  has_cam?: boolean;
  join_type?: string;
  avg_study_seconds?: number | string;
  attendance_rate?: number | string;
}

export interface RawSearchGroupsResponse extends RawEnvelope {
  groups?: RawSearchResultGroup[];
  list?: RawSearchResultGroup[];
  page?: number | string;
  total?: number | string;
}

export interface RawAttendanceDay {
  date?: string;
  study_seconds?: number | string;
  passed?: boolean;
}

export interface RawMemberAttendance {
  user_id?: number | string;
  userId?: number | string;
  nickname?: string;
  days?: RawAttendanceDay[];
  streak?: number | string;
  total_seconds?: number | string;
}

export interface RawAttendanceResponse extends RawEnvelope {
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  attendances?: RawMemberAttendance[];
}

export interface RawRankMember {
  rank?: number | string;
  user_id?: number | string;
  userId?: number | string;
  nickname?: string;
  study_seconds?: number | string;
  profile_image?: string;
}

export interface RawRanksResponse extends RawEnvelope {
  type?: string;
  ranks?: RawRankMember[];
}

export interface RawBlacklistUser {
  user_id?: number | string;
  userId?: number | string;
  nickname?: string;
  created_at?: string;
}

export interface RawBlacklistResponse extends RawEnvelope {
  users?: RawBlacklistUser[];
  list?: RawBlacklistUser[];
}

// ---------------------------------------------------------------------------
// Public, friendly types
// ---------------------------------------------------------------------------

export type SocialProvider = "KAKAO" | "NAVER" | "GOOGLE" | "APPLE" | "FACEBOOK";

export interface SocialSignUpParams {
  provider: SocialProvider;
  /** OAuth access token, ID token, or Apple identityToken JWT. */
  token: string;
  /** Desired user display name. */
  nickname: string;
  /** Client operating system. Default: "android". */
  operatingSystem?: "android" | "ios";
  /** Terms of Service agreement. Default: true. */
  terms?: boolean;
  /** Privacy policy agreement. Default: true. */
  privacy?: boolean;
  /** Confirmation that user is 14 years or older. Default: true. */
  ageOver14?: boolean;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface SplashLoginParams {
  refreshToken?: string;
  device?: Partial<SplashDevice>;
}

export interface SplashLoginResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface YptUser {
  id: number;
  nickname: string;
  email: string;
  /** Server-side "today" (`YYYY-MM-DD`). */
  today: string | null;
  /** In-app user status message / bio. */
  statusMsg?: string;
  /** User profile picture URL. */
  profileImage?: string;
  /** Flame streak count. */
  flames?: number;
  /** Tier rank (e.g. BRONZE, SILVER, GOLD, PLATINUM). */
  tier?: string;
  /** ISO-8601 creation timestamp. */
  createdAt?: string;
  /** Social provider if registered through OAuth. */
  socialType?: SocialProvider;
}

export type GroupMemberRole = "OWNER" | "MANAGER" | "MEMBER";

export type GroupOrderType =
  "time" | "attendance" | "cam" | "mission" | "owner" | "new" | "promotedAt";

export interface SearchGroupsOptions {
  /** Search keyword (minimum 2 characters). */
  q: string;
  /** Filter by category ID. */
  categoryId?: number;
  /** Sorting order. Default: "time". */
  orderType?: GroupOrderType;
  /** When true, excludes groups that are already full. */
  onlyAvailable?: boolean;
  /** When true, returns only groups with active Study Cam rooms. */
  onlyCam?: boolean;
  /** When true, returns only open groups that do not require approval. */
  onlyOpen?: boolean;
  /** Regional country code filter (e.g. "KR", "US", "JP"). */
  countryId?: string;
  /** User language code (e.g. "en", "ko"). */
  lang?: string;
  page?: number;
  limit?: number;
}

export interface SearchGroupResult {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  categoryId: number | null;
  owner: string | null;
  memberCount: number;
  maxCapacity: number;
  isPrivate: boolean;
  hasCam: boolean;
  joinType: "DIRECT" | "APPROVAL";
  averageStudySeconds: number | null;
  attendanceRate: number | null;
}

export type GroupJoinType = "DIRECT" | "APPROVAL";

export interface CreateGroupParams {
  title: string;
  categoryId: number;
  description: string;
  maxPeopleNum?: number;
  joinType?: GroupJoinType;
  password?: string | null;
  minDailyStudySeconds?: number;
  questions?: string[];
  allowChat?: boolean;
}

export interface ValidateTitleResult {
  valid: boolean;
  message?: string;
}

export interface JoinGroupOptions {
  password?: string;
}

export interface ApplyGroupParams {
  answers: string[];
}

export interface ReviewApplicantParams {
  applicantUserId: number;
  approved: boolean;
  rejectReason?: string | null;
}

export interface BlacklistUser {
  userId: number;
  nickname: string;
  createdAt: string | null;
}

export interface CurrentSubject {
  id: number;
  name: string;
  color?: string;
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
  subjectDetails?: CurrentSubject;
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
  // Modern metadata from official specs:
  role?: GroupMemberRole;
  stateIcon?: string;
  profileImage?: string;
  hasActiveCam?: boolean;
  camSnapshotUrl?: string | null;
  warningCount?: number;
}

export interface GroupAttendanceDay {
  date: string;
  studySeconds: number;
  passed: boolean;
}

export interface MemberAttendance {
  userId: number;
  nickname: string;
  days: GroupAttendanceDay[];
  streakDays?: number;
  totalSeconds?: number;
}

export interface GroupAttendanceResult {
  startDate: string;
  endDate: string;
  attendances: MemberAttendance[];
}

export type LeaderboardType = "daily" | "weekly" | "monthly";

export interface GroupRankMember {
  rank: number;
  userId: number;
  nickname: string;
  studySeconds: number;
  studyTime: string;
  profileImage: string | null;
}

export interface GroupLeaderboardResult {
  type: LeaderboardType;
  ranks: GroupRankMember[];
}

export interface SendChatOptions {
  imageUrls?: string[];
}

export interface PostNoticeOptions {
  sendPush?: boolean;
}

export interface GetMembersOptions {
  includeAllUsers?: boolean;
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
