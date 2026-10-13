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
});

export const GroupIdSchema = z
  .union([
    z.number().int().positive("groupId must be a positive integer"),
    z.string().trim().regex(/^\d+$/, 'groupId must be numeric (e.g. "12345")'),
  ])
  .transform((val) => String(val).trim());

export const ListAllMembersOptionsSchema = z.object({
  concurrency: z.number().int().positive("concurrency must be a positive integer").optional(),
});

export const YptClientOptionsSchema = z.object({
  token: z.string().min(1, "Token cannot be empty").optional(),
  credentials: SignInParamsSchema.optional(),
  onTokenChange: z.function().optional(),
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

export const RawSignInResponseSchema = RawEnvelopeSchema.extend({
  jwt: z.string().optional(),
  id: z.union([z.number(), z.string()]).optional(),
  ud: z.union([z.number(), z.string()]).optional(),
  n: z.string().optional(),
  e: z.string().optional(),
  today: z.string().optional(),
});

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

export const RawMembersResponseSchema = RawEnvelopeSchema.extend({
  ms: z.array(z.unknown()).optional(),
});

// Inferred Types
export type ValidatedSignInParams = z.infer<typeof SignInParamsSchema>;
export type ValidatedSignInOptions = z.infer<typeof SignInOptionsSchema>;
export type ValidatedClientOptions = z.infer<typeof YptClientOptionsSchema>;
