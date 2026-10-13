import { YptValidationError } from "../errors";
import type { HttpClient } from "../http";
import {
  mapAttendances,
  mapGroups,
  mapLeaderboard,
  mapMembers,
  mapSearchGroups,
  mergeMembers,
} from "../mappers";
import {
  ApplyGroupParamsSchema,
  CreateGroupParamsSchema,
  GroupIdSchema,
  JoinGroupOptionsSchema,
  ListAllMembersOptionsSchema,
  RawAttendanceResponseSchema,
  RawBlacklistResponseSchema,
  RawGroupsResponseSchema,
  RawMembersResponseSchema,
  RawRanksResponseSchema,
  RawSearchGroupsResponseSchema,
  ReviewApplicantParamsSchema,
  SearchGroupsOptionsSchema,
} from "../schemas";
import type {
  ApplyGroupParams,
  BlacklistUser,
  CreateGroupParams,
  GetMembersOptions,
  Group,
  GroupAttendanceResult,
  GroupLeaderboardResult,
  GroupMember,
  JoinGroupOptions,
  LeaderboardType,
  PostNoticeOptions,
  RawAttendanceResponse,
  RawBlacklistResponse,
  RawEnvelope,
  RawGroupsResponse,
  RawMembersResponse,
  RawRanksResponse,
  RawSearchGroupsResponse,
  ReviewApplicantParams,
  SearchGroupResult,
  SearchGroupsOptions,
  SendChatOptions,
  UnifiedMembersResult,
  ValidateTitleResult,
} from "../types";

export interface ListAllMembersOptions {
  /** How many groups to fetch in parallel. Default 3: be gentle with the server. */
  concurrency?: number;
}

/** Runs `fn` over `items` with at most `limit` in flight, collecting settled results in order. */
async function settlePool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export class GroupsResource {
  constructor(
    private readonly http: HttpClient,
    private readonly now: () => number,
    private readonly cdnUrl: string,
  ) {}

  /** `GET /group/groups/v2`: every group the signed-in user has joined. */
  async listJoined(): Promise<Group[]> {
    const raw = await this.http.get<RawGroupsResponse>("/group/groups/v2");
    const parsed = RawGroupsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new YptValidationError("response", parsed.error, raw);
    }
    return mapGroups(raw);
  }

  /** A joined group by id, or `null` if the user hasn't joined it. */
  async get(groupId: number | string): Promise<Group | null> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }
    const id = Number(parsedId.data);
    const groups = await this.listJoined();
    return groups.find((g) => g.id === id) ?? null;
  }

  /**
   * Case-insensitive filter over your *joined* groups (id, name, category, owner).
   * This is client-side only: uses previously fetched joined groups.
   */
  async searchJoined(query: string): Promise<Group[]> {
    const q = query.trim().toLowerCase();
    const groups = await this.listJoined();
    if (!q) return groups;
    return groups.filter((g) =>
      [String(g.id), g.name, g.category, g.owner].some((field) => field?.toLowerCase().includes(q)),
    );
  }

  /**
   * `GET /group/list/search-2`: Discover public groups by keyword and filter criteria.
   */
  async search(options: SearchGroupsOptions): Promise<SearchGroupResult[]> {
    const parsed = SearchGroupsOptionsSchema.safeParse(options);
    if (!parsed.success) {
      throw new YptValidationError("input", parsed.error);
    }

    const query: Record<string, string | number | boolean | undefined> = {
      q: parsed.data.q,
      category_id: parsed.data.categoryId,
      order_type: parsed.data.orderType,
      only_available: parsed.data.onlyAvailable,
      only_cam: parsed.data.onlyCam,
      only_open: parsed.data.onlyOpen,
      country_id: parsed.data.countryId,
      lang: parsed.data.lang,
      page: parsed.data.page,
      limit: parsed.data.limit,
    };

    const raw = await this.http.get<RawSearchGroupsResponse>("/group/list/search-2", query);
    const parsedRaw = RawSearchGroupsResponseSchema.safeParse(raw);
    if (!parsedRaw.success) {
      throw new YptValidationError("response", parsedRaw.error, raw);
    }

    return mapSearchGroups(raw);
  }

  /**
   * `POST /group/make/title/validate`: Validates whether a group title is available and appropriate.
   */
  async validateTitle(title: string): Promise<ValidateTitleResult> {
    if (!title || typeof title !== "string" || title.trim() === "") {
      throw new YptValidationError("input", {
        issues: [{ code: "custom", path: ["title"], message: "Title cannot be empty" }],
      } as any);
    }

    const raw = await this.http.post<RawEnvelope & { valid?: boolean }>(
      "/group/make/title/validate",
      {
        title: title.trim(),
      },
    );
    return {
      valid: Boolean(raw.s ?? raw.valid ?? true),
      message: raw.m,
    };
  }

  /**
   * `POST /group/make/v2`: Creates a new study group.
   */
  async create(params: CreateGroupParams): Promise<{ id: number; title: string }> {
    const parsed = CreateGroupParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new YptValidationError("input", parsed.error);
    }

    const body = {
      title: parsed.data.title,
      category_id: parsed.data.categoryId,
      description: parsed.data.description,
      maxPeopleNum: parsed.data.maxPeopleNum,
      join_type: parsed.data.joinType,
      password: parsed.data.password ?? null,
      min_daily_study_seconds: parsed.data.minDailyStudySeconds,
      questions: parsed.data.questions,
      allow_chat: parsed.data.allowChat,
    };

    const raw = await this.http.post<
      RawEnvelope & { id?: number | string; group_id?: number | string }
    >("/group/make/v2", body);
    const id = Number(raw.id ?? raw.group_id ?? 0);
    return { id, title: parsed.data.title };
  }

  /**
   * `POST /group/join/v2`: Join an open group directly (or submit password for PIN-protected groups).
   */
  async join(groupId: number | string, options: JoinGroupOptions = {}): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }
    const parsedOptions = JoinGroupOptionsSchema.safeParse(options);
    if (!parsedOptions.success) {
      throw new YptValidationError("input", parsedOptions.error);
    }

    await this.http.post<RawEnvelope>("/group/join/v2", {
      group_id: Number(parsedId.data),
      password: parsedOptions.data.password,
    });
  }

  /**
   * `POST /group/group-user/join-info`: Submit an application with screening question answers.
   */
  async apply(groupId: number | string, params: ApplyGroupParams): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }
    const parsedParams = ApplyGroupParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new YptValidationError("input", parsedParams.error);
    }

    await this.http.post<RawEnvelope>("/group/group-user/join-info", {
      group_id: Number(parsedId.data),
      answers: parsedParams.data.answers,
    });
  }

  /**
   * `POST /group/group-user/join/approve-or-reject`: Approve or reject an applicant (Leader/Manager only).
   */
  async reviewApplicant(groupId: number | string, params: ReviewApplicantParams): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }
    const parsedParams = ReviewApplicantParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new YptValidationError("input", parsedParams.error);
    }

    await this.http.post<RawEnvelope>("/group/group-user/join/approve-or-reject", {
      group_id: Number(parsedId.data),
      applicant_user_id: parsedParams.data.applicantUserId,
      approved: parsedParams.data.approved,
      reject_reason: parsedParams.data.rejectReason ?? null,
    });
  }

  /**
   * `POST /group/leave`: Leave a group.
   */
  async leave(groupId: number | string, userId?: number): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    const body: Record<string, unknown> = {
      group_id: Number(parsedId.data),
    };
    if (userId !== undefined) {
      body.userId = userId;
    }

    await this.http.post<RawEnvelope>("/group/leave", body);
  }

  /**
   * `POST /group/warn`: Issue an official warning strike to a group member.
   */
  async warnMember(groupId: number | string, userId: number): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    await this.http.post<RawEnvelope>("/group/warn", {
      group_id: Number(parsedId.data),
      userId,
    });
  }

  /**
   * `POST /group/warn/cancel`: Revoke/cancel a previously issued warning strike.
   */
  async cancelWarning(groupId: number | string, userId: number): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    await this.http.post<RawEnvelope>("/group/warn/cancel", {
      group_id: Number(parsedId.data),
      userId,
    });
  }

  /**
   * `POST /group/kick-out`: Expels/removes a member from the group.
   */
  async kickMember(groupId: number | string, userId: number): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    await this.http.post<RawEnvelope>("/group/kick-out", {
      group_id: Number(parsedId.data),
      userId,
    });
  }

  /**
   * `POST /group/black/add`: Permanently ban and blacklist a member from rejoining.
   */
  async blacklistMember(groupId: number | string, userId: number): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    await this.http.post<RawEnvelope>("/group/black/add", {
      group_id: Number(parsedId.data),
      userId,
    });
  }

  /**
   * `POST /group/black/delete`: Removes a member from the group's blacklist.
   */
  async removeBlacklist(groupId: number | string, userId: number): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    await this.http.post<RawEnvelope>("/group/black/delete", {
      group_id: Number(parsedId.data),
      userId,
    });
  }

  /**
   * `GET /group/black/all`: Returns all blacklisted members for this group.
   */
  async listBlacklist(groupId: number | string): Promise<BlacklistUser[]> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    const raw = await this.http.get<RawBlacklistResponse>("/group/black/all", {
      group_id: Number(parsedId.data),
    });
    const parsed = RawBlacklistResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new YptValidationError("response", parsed.error, raw);
    }

    const list = Array.isArray(raw.users) ? raw.users : Array.isArray(raw.list) ? raw.list : [];
    return list.map((u) => ({
      userId: Number(u.userId ?? u.user_id ?? 0),
      nickname: u.nickname ?? "",
      createdAt: u.created_at ?? null,
    }));
  }

  /**
   * `GET /logs/group/members/v2`: members of one group with real-time live study status.
   */
  async getMembers(
    groupId: number | string,
    options: GetMembersOptions = {},
  ): Promise<GroupMember[]> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }
    const id = parsedId.data;

    const query: Record<string, string | number | boolean | undefined> = {
      groupID: id,
    };
    if (options.includeAllUsers !== undefined) {
      query.include_all_users = options.includeAllUsers;
    }

    const raw = await this.http.get<RawMembersResponse>("/logs/group/members/v2", query);
    const parsedRaw = RawMembersResponseSchema.safeParse(raw);
    if (!parsedRaw.success) {
      throw new YptValidationError("response", parsedRaw.error, raw);
    }
    return mapMembers(raw, this.now(), this.cdnUrl);
  }

  /**
   * `GET /logs/v70701/group/attendances`: Returns attendance and daily study matrix across date range.
   */
  async getAttendances(
    groupId: number | string,
    startDate: string,
    endDate: string,
  ): Promise<GroupAttendanceResult> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    const raw = await this.http.get<RawAttendanceResponse>("/logs/v70701/group/attendances", {
      group_id: Number(parsedId.data),
      startDate,
      endDate,
    });
    const parsed = RawAttendanceResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new YptValidationError("response", parsed.error, raw);
    }

    return mapAttendances(raw);
  }

  /**
   * `GET /logs/group/member/ranks`: Returns group study time leaderboard.
   */
  async getLeaderboard(
    groupId: number | string,
    type: LeaderboardType = "daily",
  ): Promise<GroupLeaderboardResult> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    const raw = await this.http.get<RawRanksResponse>("/logs/group/member/ranks", {
      group_id: Number(parsedId.data),
      type,
    });
    const parsed = RawRanksResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new YptValidationError("response", parsed.error, raw);
    }

    return mapLeaderboard(raw, type);
  }

  /**
   * `POST /group/push/shake`: Poke / nudge an individual inactive member.
   */
  async nudge(groupId: number | string, targetUserId: number): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    await this.http.post<RawEnvelope>("/group/push/shake", {
      group_id: Number(parsedId.data),
      target_user_id: targetUserId,
    });
  }

  /**
   * `POST /group/push/shake/all`: Manager/Owner high-priority vibration nudge to all inactive members.
   */
  async nudgeAll(groupId: number | string): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }

    await this.http.post<RawEnvelope>("/group/push/shake/all", {
      group_id: Number(parsedId.data),
    });
  }

  /**
   * `POST /group/chat`: Sends a message to the group chat room.
   */
  async sendChatMessage(
    groupId: number | string,
    message: string,
    options: SendChatOptions = {},
  ): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }
    if (!message || typeof message !== "string" || message.trim() === "") {
      throw new YptValidationError("input", {
        issues: [{ code: "custom", path: ["message"], message: "Message cannot be empty" }],
      } as any);
    }

    await this.http.post<RawEnvelope>("/group/chat", {
      group_id: Number(parsedId.data),
      message: message.trim(),
      image_urls: options.imageUrls ?? [],
    });
  }

  /**
   * `POST /group/notice`: Pins an official notice/announcement to the group.
   */
  async postNotice(
    groupId: number | string,
    content: string,
    options: PostNoticeOptions = {},
  ): Promise<void> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }
    if (!content || typeof content !== "string" || content.trim() === "") {
      throw new YptValidationError("input", {
        issues: [{ code: "custom", path: ["content"], message: "Notice content cannot be empty" }],
      } as any);
    }

    await this.http.post<RawEnvelope>("/group/notice", {
      group_id: Number(parsedId.data),
      content: content.trim(),
      send_push: options.sendPush ?? true,
    });
  }

  /**
   * Members of all joined groups merged into one leaderboard (sorted by live
   * study time). A group that fails is reported in `failedGroups` instead of
   * aborting the whole call, unless every group fails.
   */
  async listAllMembers(options: ListAllMembersOptions = {}): Promise<UnifiedMembersResult> {
    const parsedOptions = ListAllMembersOptionsSchema.safeParse(options);
    if (!parsedOptions.success) {
      throw new YptValidationError("input", parsedOptions.error);
    }
    const groups = await this.listJoined();
    const settled = await settlePool(groups, options.concurrency ?? 3, (g) =>
      this.getMembers(g.id),
    );

    const ok: Array<{ group: Group; members: GroupMember[] }> = [];
    const failedGroups: UnifiedMembersResult["failedGroups"] = [];
    settled.forEach((result, i) => {
      const group = groups[i];
      if (result.status === "fulfilled") ok.push({ group, members: result.value });
      else failedGroups.push({ groupId: group.id, error: result.reason });
    });

    if (ok.length === 0 && failedGroups.length > 0) throw failedGroups[0].error;

    const totalRawMembers = ok.reduce((sum, e) => sum + e.members.length, 0);
    const members = mergeMembers(ok);
    return {
      members,
      totalGroups: groups.length,
      successfulGroups: ok.length,
      failedGroups,
      totalRawMembers,
      uniqueMemberCount: members.length,
      duplicatesRemoved: totalRawMembers - members.length,
    };
  }
}
