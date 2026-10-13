import { YptError, YptValidationError } from "./errors";
import { HttpClient, type FetchLike } from "./http";
import { DEFAULT_CDN_URL } from "./mappers";
import {
  AuthResource,
  DEFAULT_DEVICE,
  type SessionState,
  type SetSessionTokens,
  type SignInParams,
} from "./resources/auth";
import { GroupsResource } from "./resources/groups";
import { YptJsOptionsSchema } from "./schemas";
import type { SplashDevice, YptUser } from "./types";

export interface SessionInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: YptUser;
}

export interface YptJsOptions {
  /** Reuse an existing JWT or accessToken (e.g. one you stored yourself). */
  token?: string;
  /** Long-lived refresh token for session restore and transparent token rotation. */
  refreshToken?: string;
  /** Token expiry timestamp. */
  expiresAt?: number;
  /**
   * If provided, the client signs in lazily on the first request and signs in
   * again once after an HTTP 401. Kept in memory only; never written anywhere.
   */
  credentials?: SignInParams;
  /** Called whenever the token changes, passing (token, refreshToken). */
  onTokenChange?: (token: string, refreshToken?: string) => void;
  /** Called whenever full session state changes. */
  onSessionChange?: (session: SessionInfo) => void;

  /** Authorization header scheme: "JWT" or "Bearer". Default: "JWT". */
  authScheme?: "Bearer" | "JWT";

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

export type YptClientOptions = YptJsOptions;

export class YptJs {
  readonly auth: AuthResource;
  readonly groups: GroupsResource;

  private readonly session: SessionState = {};
  private readonly onTokenChange?: (token: string, refreshToken?: string) => void;
  private readonly onSessionChange?: (session: SessionInfo) => void;

  constructor(options: YptJsOptions = {}) {
    const parsed = YptJsOptionsSchema.safeParse(options);
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
    this.session.accessToken = options.token;
    this.session.refreshToken = options.refreshToken;
    this.session.expiresAt = options.expiresAt;
    this.onTokenChange = options.onTokenChange;
    this.onSessionChange = options.onSessionChange;

    const http = new HttpClient({
      baseUrl: options.baseUrl ?? "https://pi.tgclab.com",
      fetch: fetchImpl,
      userAgent: options.userAgent ?? "Dart/3.11 (dart:io)",
      headers: options.headers ?? {},
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 500,
      getToken: () => this.session.token ?? this.session.accessToken,
      authScheme: options.authScheme ?? "JWT",
    });

    const language = options.language ?? "en";
    const cdnUrl = options.cdnUrl ?? DEFAULT_CDN_URL;

    this.auth = new AuthResource(
      http,
      this.session,
      (tokens: SetSessionTokens | string) => {
        if (typeof tokens === "string") {
          this.setToken(tokens);
        } else {
          this.setSession(tokens);
        }
      },
      language,
      {
        ...DEFAULT_DEVICE,
        ...options.device,
      },
    );
    this.groups = new GroupsResource(http, options.now ?? Date.now, cdnUrl);

    const { credentials } = options;
    if (credentials || options.refreshToken) {
      http.reauthenticate = async () => {
        if (this.session.refreshToken) {
          try {
            const res = await this.auth.splashLogin({ refreshToken: this.session.refreshToken });
            if (res.accessToken || this.session.token) {
              return;
            }
          } catch {
            // If refreshToken rotation fails, fallback to credentials if supplied
          }
        }

        if (credentials) {
          await this.auth.signIn(credentials);
        }
      };
    }
  }

  /** The current access token / JWT, if signed in. */
  get token(): string | undefined {
    return this.session.token ?? this.session.accessToken;
  }

  /** Alias for token (matching the modern dual-token nomenclature). */
  get accessToken(): string | undefined {
    return this.session.accessToken ?? this.session.token;
  }

  /** The current refresh token, if present. */
  get refreshToken(): string | undefined {
    return this.session.refreshToken;
  }

  /** The access token expiry timestamp, if known. */
  get expiresAt(): number | undefined {
    return this.session.expiresAt;
  }

  /** Whether the client currently holds an authentication token. */
  get isAuthenticated(): boolean {
    return Boolean(this.session.token || this.session.accessToken);
  }

  /** The signed-in user, available after sign in or session restore. */
  get user(): YptUser | undefined {
    return this.session.user;
  }

  /** Updates the access token and fires callbacks. */
  setToken(token: string): void {
    this.session.token = token;
    this.session.accessToken = token;
    this.onTokenChange?.(token, this.session.refreshToken);
    this.onSessionChange?.({
      accessToken: token,
      refreshToken: this.session.refreshToken,
      expiresAt: this.session.expiresAt,
      user: this.session.user,
    });
  }

  /** Updates session tokens (access, refresh, expiry) and fires callbacks. */
  setSession(tokens: { accessToken: string; refreshToken?: string; expiresAt?: number }): void {
    this.session.token = tokens.accessToken;
    this.session.accessToken = tokens.accessToken;
    if (tokens.refreshToken !== undefined) this.session.refreshToken = tokens.refreshToken;
    if (tokens.expiresAt !== undefined) this.session.expiresAt = tokens.expiresAt;
    this.onTokenChange?.(tokens.accessToken, this.session.refreshToken);
    this.onSessionChange?.({
      accessToken: tokens.accessToken,
      refreshToken: this.session.refreshToken,
      expiresAt: this.session.expiresAt,
      user: this.session.user,
    });
  }
}

export const YptClient = YptJs;
export type YptClient = YptJs;
