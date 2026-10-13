export { YptClient } from "./client";
export type { YptClientOptions } from "./client";

export {
  YptError,
  YptApiError,
  YptAuthError,
  YptHttpError,
  YptNetworkError,
  YptValidationError,
  AUTH_ERROR_CODES,
} from "./errors";

export {
  SignInParamsSchema,
  SignInOptionsSchema,
  GroupIdSchema,
  ListAllMembersOptionsSchema,
  YptClientOptionsSchema,
  RawEnvelopeSchema,
  RawSignInResponseSchema,
  RawDailyLogSchema,
  RawMemberSchema,
  RawGroupSchema,
  RawGroupsResponseSchema,
  RawMembersResponseSchema,
} from "./schemas";
export type {
  ValidatedSignInParams,
  ValidatedSignInOptions,
  ValidatedClientOptions,
} from "./schemas";

export { avatarUrl, formatDuration, mergeMembers } from "./mappers";

export type { FetchLike } from "./http";
export type { AuthResource, SignInParams, SignInOptions } from "./resources/auth";
export type { GroupsResource, ListAllMembersOptions } from "./resources/groups";

export type {
  Group,
  GroupMember,
  GroupRole,
  SplashDevice,
  UnifiedMember,
  UnifiedMembersResult,
  YptUser,
} from "./types";
