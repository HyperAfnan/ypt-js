import { z } from "zod";

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

export const SignInParamsSchema = z.object({
  email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"),
  password: z.string().min(1, "Password cannot be empty"),
});

export const SignInOptionsSchema = z.object({
  splash: z.boolean().optional(),
  strictPasswordValidation: z.boolean().optional(),
});

export const SocialProviderSchema = z.enum(["KAKAO", "NAVER", "GOOGLE", "APPLE", "FACEBOOK"]);

export const SocialSignUpParamsSchema = z.object({
  provider: SocialProviderSchema,
  token: z.string().min(1, "OAuth token cannot be empty"),
  nickname: z.string().trim().min(1, "Nickname cannot be empty"),
  operatingSystem: z.enum(["android", "ios"]).default("android"),
  terms: z.boolean().default(true),
  privacy: z.boolean().default(true),
  ageOver14: z.boolean().default(true),
});

export const SplashLoginParamsSchema = z.object({
  refreshToken: z.string().optional(),
  device: z.record(z.string(), z.unknown()).optional(),
});

export const GroupIdSchema = z
  .union([
    z.number().int().positive("groupId must be a positive integer"),
    z.string().trim().regex(/^\d+$/, 'groupId must be numeric (e.g. "12345")'),
  ])
  .transform((val) => String(val).trim());

export const GroupOrderTypeSchema = z.enum([
  "time",
  "attendance",
  "cam",
  "mission",
  "owner",
  "new",
  "promotedAt",
]);

export const SearchGroupsOptionsSchema = z.object({
  q: z.string().trim().min(2, "Search query must be at least 2 characters"),
  categoryId: z.number().int().positive().optional(),
  orderType: GroupOrderTypeSchema.optional(),
  onlyAvailable: z.boolean().optional(),
  onlyCam: z.boolean().optional(),
  onlyOpen: z.boolean().optional(),
  countryId: z.string().optional(),
  lang: z.string().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
});

export const GroupJoinTypeSchema = z.enum(["DIRECT", "APPROVAL"]);

export const CreateGroupParamsSchema = z.object({
  title: z.string().trim().min(1, "Group title cannot be empty"),
  categoryId: z.number().int().positive("categoryId must be a positive integer"),
  description: z.string().default(""),
  maxPeopleNum: z.number().int().min(2).max(100).default(50),
  joinType: GroupJoinTypeSchema.default("DIRECT"),
  password: z.string().nullable().optional(),
  minDailyStudySeconds: z.number().int().nonnegative().optional(),
  questions: z.array(z.string()).optional(),
  allowChat: z.boolean().default(true),
});

export const JoinGroupOptionsSchema = z.object({
  password: z.string().optional(),
});

export const ApplyGroupParamsSchema = z.object({
  answers: z.array(z.string()).min(1, "At least one screening answer is required"),
});

export const ReviewApplicantParamsSchema = z.object({
  applicantUserId: z.number().int().positive("applicantUserId must be positive"),
  approved: z.boolean(),
  rejectReason: z.string().nullable().optional(),
});

export const ListAllMembersOptionsSchema = z.object({
  concurrency: z.number().int().positive("concurrency must be a positive integer").optional(),
});

export const YptJsOptionsSchema = z.object({
  token: z.string().min(1, "Token cannot be empty").optional(),
  refreshToken: z.string().min(1, "RefreshToken cannot be empty").optional(),
  expiresAt: z.number().optional(),
  credentials: SignInParamsSchema.optional(),
  onTokenChange: z.function().optional(),
  onSessionChange: z.function().optional(),
  authScheme: z.enum(["Bearer", "JWT"]).optional(),
  baseUrl: z.string().url("baseUrl must be a valid URL").optional(),
  cdnUrl: z.string().url("cdnUrl must be a valid URL").optional(),
  userAgent: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().nonnegative("timeoutMs must be non-negative").optional(),
  maxRetries: z.number().int().nonnegative("maxRetries must be a non-negative integer").optional(),
  retryDelayMs: z.number().nonnegative("retryDelayMs must be non-negative").optional(),
  language: z.string().optional(),
  device: z.record(z.string(), z.unknown()).optional(),
  fetch: z.function().optional(),
  now: z.function().optional(),
});

export const YptClientOptionsSchema = YptJsOptionsSchema;

// ---------------------------------------------------------------------------
// Raw Upstream Response Schemas (Lenient & Safe)
// ---------------------------------------------------------------------------

export const RawEnvelopeSchema = z
  .object({
    s: z.boolean(),
    c: z.union([z.number(), z.string()]).optional(),
    m: z.string().optional(),
  })
  .passthrough();

export const RawUserSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    email: z.string().optional(),
    nickname: z.string().optional(),
    status_msg: z.string().optional(),
    statusMsg: z.string().optional(),
    profile_image: z.string().optional(),
    profileImage: z.string().optional(),
    flames: z.number().optional(),
    tier: z.string().optional(),
    created_at: z.string().optional(),
    createdAt: z.string().optional(),
    social_type: z.string().optional(),
    socialType: z.string().optional(),
  })
  .passthrough();

export const RawModernSignInResponseSchema = z
  .object({
    s: z.boolean().optional(),
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.number().optional(),
    user: RawUserSchema.optional(),
  })
  .passthrough();

export const RawLegacySignInResponseSchema = RawEnvelopeSchema.extend({
  jwt: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  user: RawUserSchema.optional(),
  id: z.union([z.number(), z.string()]).optional(),
  ud: z.union([z.number(), z.string()]).optional(),
  n: z.string().optional(),
  e: z.string().optional(),
  today: z.string().optional(),
});

export const RawSignInResponseSchema = z.union([
  RawLegacySignInResponseSchema,
  RawModernSignInResponseSchema,
]);

export const RawSplashLoginResponseSchema = z
  .object({
    s: z.boolean().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    expiresAt: z.number().optional(),
  })
  .passthrough();

export const RawFirebaseTokenResponseSchema = z
  .object({
    s: z.boolean().optional(),
    token: z.string().optional(),
    customToken: z.string().optional(),
    firebaseCustomToken: z.string().optional(),
  })
  .passthrough();

export const RawDailyLogSchema = z
  .object({
    sm: z.union([z.number(), z.string()]).optional(),
    is: z.unknown().optional(),
    ia: z.unknown().optional(),
    ip: z.unknown().optional(),
    ss: z.union([z.number(), z.string()]).optional(),
    st: z.string().optional(),
    sn: z.string().nullable().optional(),
    sb: z.string().nullable().optional(),
    tt: z.string().nullable().optional(),
    dt: z.string().optional(),
    dd: z.string().optional(),
  })
  .passthrough();

export const RawMemberSchema = z
  .object({
    ud: z.union([z.number(), z.string()]).optional(),
    id: z.union([z.number(), z.string()]).optional(),
    n: z.string().optional(),
    ct: z.string().optional(),
    sd: z.union([z.number(), z.string()]).optional(),
    si: z.union([z.number(), z.string()]).optional(),
    hasCustomAvatar: z.boolean().optional(),
    dl: RawDailyLogSchema.optional(),
  })
  .passthrough();

export const RawGroupSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    t: z.string().optional(),
    n: z.string().optional(),
    c: z.string().optional(),
    on: z.string().optional(),
    jc: z.union([z.number(), z.string()]).optional(),
    mc: z.union([z.number(), z.string()]).optional(),
    ip: z.unknown().optional(),
    p: z.unknown().optional(),
    sn: z.string().optional(),
  })
  .passthrough();

export const RawGroupsResponseSchema = RawEnvelopeSchema.extend({
  ms: z.array(z.unknown()).optional(),
  cs: z.array(z.unknown()).optional(),
  gs: z.array(z.unknown()).optional(),
  ps: z.array(z.unknown()).optional(),
});

export const RawSearchResultGroupSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    category_id: z.union([z.number(), z.string()]).optional(),
    owner: z.string().nullable().optional(),
    member_count: z.union([z.number(), z.string()]).optional(),
    members_count: z.union([z.number(), z.string()]).optional(),
    max_people_num: z.union([z.number(), z.string()]).optional(),
    max_capacity: z.union([z.number(), z.string()]).optional(),
    is_private: z.unknown().optional(),
    has_cam: z.unknown().optional(),
    join_type: z.string().optional(),
    avg_study_seconds: z.union([z.number(), z.string()]).optional(),
    attendance_rate: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export const RawSearchGroupsResponseSchema = RawEnvelopeSchema.extend({
  groups: z.array(RawSearchResultGroupSchema).optional(),
  list: z.array(RawSearchResultGroupSchema).optional(),
  page: z.union([z.number(), z.string()]).optional(),
  total: z.union([z.number(), z.string()]).optional(),
});

export const RawModernGroupMemberSchema = z
  .object({
    user_id: z.union([z.number(), z.string()]).optional(),
    userId: z.union([z.number(), z.string()]).optional(),
    nickname: z.string().optional(),
    role: z.string().optional(),
    is_studying: z.boolean().optional(),
    current_subject: z.unknown().optional(),
    today_study_seconds: z.union([z.number(), z.string()]).optional(),
    state_icon: z.string().optional(),
    profile_image: z.string().optional(),
    has_active_cam: z.boolean().optional(),
    cam_snapshot_url: z.string().nullable().optional(),
    warning_count: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export const RawMembersResponseSchema = RawEnvelopeSchema.extend({
  ms: z.array(z.unknown()).optional(),
  members: z.array(RawModernGroupMemberSchema).optional(),
});

export const RawAttendanceDaySchema = z
  .object({
    date: z.string().optional(),
    study_seconds: z.union([z.number(), z.string()]).optional(),
    passed: z.boolean().optional(),
  })
  .passthrough();

export const RawMemberAttendanceSchema = z
  .object({
    user_id: z.union([z.number(), z.string()]).optional(),
    userId: z.union([z.number(), z.string()]).optional(),
    nickname: z.string().optional(),
    days: z.array(RawAttendanceDaySchema).optional(),
    streak: z.union([z.number(), z.string()]).optional(),
    total_seconds: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export const RawAttendanceResponseSchema = RawEnvelopeSchema.extend({
  start_date: z.string().optional(),
  startDate: z.string().optional(),
  end_date: z.string().optional(),
  endDate: z.string().optional(),
  attendances: z.array(RawMemberAttendanceSchema).optional(),
});

export const RawRankMemberSchema = z
  .object({
    rank: z.union([z.number(), z.string()]).optional(),
    user_id: z.union([z.number(), z.string()]).optional(),
    userId: z.union([z.number(), z.string()]).optional(),
    nickname: z.string().optional(),
    study_seconds: z.union([z.number(), z.string()]).optional(),
    profile_image: z.string().nullable().optional(),
  })
  .passthrough();

export const RawRanksResponseSchema = RawEnvelopeSchema.extend({
  type: z.string().optional(),
  ranks: z.array(RawRankMemberSchema).optional(),
});

export const RawBlacklistUserSchema = z
  .object({
    user_id: z.union([z.number(), z.string()]).optional(),
    userId: z.union([z.number(), z.string()]).optional(),
    nickname: z.string().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();

export const RawBlacklistResponseSchema = RawEnvelopeSchema.extend({
  users: z.array(RawBlacklistUserSchema).optional(),
  list: z.array(RawBlacklistUserSchema).optional(),
});

// Inferred Types
export type ValidatedSignInParams = z.infer<typeof SignInParamsSchema>;
export type ValidatedSignInOptions = z.infer<typeof SignInOptionsSchema>;
export type ValidatedSocialSignUpParams = z.infer<typeof SocialSignUpParamsSchema>;
export type ValidatedSplashLoginParams = z.infer<typeof SplashLoginParamsSchema>;
export type ValidatedSearchGroupsOptions = z.infer<typeof SearchGroupsOptionsSchema>;
export type ValidatedCreateGroupParams = z.infer<typeof CreateGroupParamsSchema>;
export type ValidatedJoinGroupOptions = z.infer<typeof JoinGroupOptionsSchema>;
export type ValidatedApplyGroupParams = z.infer<typeof ApplyGroupParamsSchema>;
export type ValidatedReviewApplicantParams = z.infer<typeof ReviewApplicantParamsSchema>;
export type ValidatedJsOptions = z.infer<typeof YptJsOptionsSchema>;
export type ValidatedClientOptions = ValidatedJsOptions;
