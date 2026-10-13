import { YptError, YptValidationError } from "./errors";
import { HttpClient, type FetchLike } from "./http";
import { DEFAULT_CDN_URL } from "./mappers";
import {
  AuthResource,
  DEFAULT_DEVICE,
  type SessionState,
  type SignInParams,
} from "./resources/auth";
import { GroupsResource } from "./resources/groups";
import { YptClientOptionsSchema } from "./schemas";
import type { SplashDevice, YptUser } from "./types";

export interface YptClientOptions {
  /** Reuse an existing JWT (e.g. one you stored yourself). */
  token?: string;
  /**
   * If provided, the client signs in lazily on the first request and signs in
   * again once after an HTTP 401. Kept in memory only; never written anywhere.
   */
  credentials?: SignInParams;
  /** Called whenever the token changes, so *you* can persist it however you like. */
  onTokenChange?: (token: string) => void;

  baseUrl?: string;
  cdnUrl?: string;
  /** Default: `Dart/3.11 (dart:io)`, which the API expects. */
  userAgent?: string;
  /** Extra headers; these override the defaults. */
  headers?: Record<string, string>;
  /** Default 15000. Use 0 to disable. */
  timeoutMs?: number;
  /** Retries for GET requests on network errors / 429 / 5xx. Default 2. */
  maxRetries?: number;
  /** Base delay for exponential backoff. Default 500. */
  retryDelayMs?: number;
  /** `language` field sent to YPT. Default `en`. */
  language?: string;
  /** Overrides for the splash-login device info. */
  device?: Partial<SplashDevice>;
  /** Custom fetch (proxies, tests, polyfills). Default: global `fetch`. */
  fetch?: FetchLike;
  /** Clock used for live study-time math. Default: `Date.now`. */
  now?: () => number;
}

export class YptClient {
  readonly auth: AuthResource;
  readonly groups: GroupsResource;

  private readonly session: SessionState = {};
  private readonly onTokenChange?: (token: string) => void;

  constructor(options: YptClientOptions = {}) {
    const parsed = YptClientOptionsSchema.safeParse(options);
    if (!parsed.success) {
      throw new YptValidationError("input", parsed.error);
    }

    const fetchImpl: FetchLike | undefined =
      options.fetch ??
      (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    if (!fetchImpl) {
      throw new YptError(
        "No fetch implementation found. Use Node 18+ or pass `fetch` in the client options.",
      );
    }

    this.session.token = options.token;
    this.onTokenChange = options.onTokenChange;

    const http = new HttpClient({
      baseUrl: options.baseUrl ?? "https://pi.tgclab.com",
      fetch: fetchImpl,
      userAgent: options.userAgent ?? "Dart/3.11 (dart:io)",
      headers: options.headers ?? {},
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 500,
      getToken: () => this.session.token,
    });

    const language = options.language ?? "en";
    const cdnUrl = options.cdnUrl ?? DEFAULT_CDN_URL;

    this.auth = new AuthResource(http, this.session, (token) => this.setToken(token), language, {
      ...DEFAULT_DEVICE,
      ...options.device,
    });
    this.groups = new GroupsResource(http, options.now ?? Date.now, cdnUrl);

    const { credentials } = options;
    if (credentials) {
      http.reauthenticate = async () => {
        await this.auth.signIn(credentials);
      };
    }
  }

  /** The current JWT, if signed in. */
  get token(): string | undefined {
    return this.session.token;
  }

  /** The signed-in user, available after `auth.signIn()`. */
  get user(): YptUser | undefined {
    return this.session.user;
  }

  setToken(token: string): void {
    this.session.token = token;
    this.onTokenChange?.(token);
  }
}
