import { YptValidationError } from "../errors";
import type { HttpClient } from "../http";
import { mapGroups, mapMembers, mergeMembers } from "../mappers";
import {
  GroupIdSchema,
  ListAllMembersOptionsSchema,
  RawGroupsResponseSchema,
  RawMembersResponseSchema,
} from "../schemas";
import type {
  Group,
  GroupMember,
  RawGroupsResponse,
  RawMembersResponse,
  UnifiedMembersResult,
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
   * This is client-side only: no remote group-search endpoint is documented yet.
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
   * `GET /logs/group/members/v2?groupID=...`: members of one group with live study status.
   * (`countryID` is deliberately never sent: it makes the upstream server return HTTP 500.)
   */
  async getMembers(groupId: number | string): Promise<GroupMember[]> {
    const parsedId = GroupIdSchema.safeParse(groupId);
    if (!parsedId.success) {
      throw new YptValidationError("input", parsedId.error);
    }
    const id = parsedId.data;
    const raw = await this.http.get<RawMembersResponse>("/logs/group/members/v2", {
      groupID: id,
    });
    const parsedRaw = RawMembersResponseSchema.safeParse(raw);
    if (!parsedRaw.success) {
      throw new YptValidationError("response", parsedRaw.error, raw);
    }
    return mapMembers(raw, this.now(), this.cdnUrl);
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
