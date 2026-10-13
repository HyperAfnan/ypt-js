import {
  AUTH_ERROR_CODES,
  YptApiError,
  YptAuthError,
  YptHttpError,
  YptNetworkError,
} from "./errors";
import { isRecord } from "./mappers";
import type { RawEnvelope } from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  userAgent: string;
  /** Extra headers; these override the defaults. */
  headers: Record<string, string>;
  /** 0 disables the timeout. */
  timeoutMs: number;
  /** Retries for GET requests on network errors, 429 and 5xx. POSTs are never retried. */
  maxRetries: number;
  retryDelayMs: number;
  getToken: () => string | undefined;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /**
   * `token` (default): send `Authorization: JWT <token>`.
   * `bare`: send the literal `Authorization: JWT` (used only for sign-in).
   */
  auth?: "token" | "bare";
}

const MAX_RETRY_AFTER_MS = 30_000;

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

export class HttpClient {
  /**
   * Called to obtain a fresh token: lazily when none is set, and once after an
   * HTTP 401. Wired up by the client when credentials were supplied.
   */
  reauthenticate?: () => Promise<void>;

  private reauthInFlight?: Promise<void>;

  constructor(private readonly opts: HttpClientOptions) {}

  get<T extends RawEnvelope>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  post<T extends RawEnvelope>(
    path: string,
    body?: unknown,
    auth: RequestOptions["auth"] = "token",
  ): Promise<T> {
    return this.request<T>("POST", path, { body, auth });
  }

  async request<T extends RawEnvelope>(
    method: "GET" | "POST",
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const mode = options.auth ?? "token";
    const url = this.buildUrl(path, options.query);
    const retriable = method === "GET";

    if (mode === "token" && !this.opts.getToken()) {
      const ran = await this.runReauth();
      if (!ran || !this.opts.getToken()) {
        throw new YptAuthError(
          "Not signed in. Call client.auth.signIn(), or pass a token or credentials to YptClient.",
        );
      }
    }

    let attempt = 0;
    let reauthed = false;

    for (;;) {
      let res: Response;
      try {
        res = await this.opts.fetch(url, this.buildInit(method, mode, options.body));
      } catch (cause) {
        if (retriable && attempt < this.opts.maxRetries) {
          attempt++;
          await sleep(this.backoff(attempt));
          continue;
        }
        throw new YptNetworkError(`Network error on ${method} ${path}`, { cause });
      }

      if (res.status === 401 && mode === "token" && !reauthed) {
        reauthed = true;
        if (await this.runReauth()) continue;
      }

      if (retriable && isRetryableStatus(res.status) && attempt < this.opts.maxRetries) {
        attempt++;
        await sleep(this.retryDelay(res, attempt));
        continue;
      }

      return this.parse<T>(res, method, path);
    }
  }

  // -------------------------------------------------------------------------

  private async runReauth(): Promise<boolean> {
    const reauth = this.reauthenticate;
    if (!reauth) return false;
    // Share one in-flight login so concurrent requests don't each sign in.
    this.reauthInFlight ??= reauth().finally(() => {
      this.reauthInFlight = undefined;
    });
    await this.reauthInFlight;
    return true;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const base = this.opts.baseUrl.replace(/\/+$/, "");
    const url = new URL(base + (path.startsWith("/") ? path : `/${path}`));
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private buildInit(method: string, mode: "token" | "bare", body: unknown): RequestInit {
    const token = this.opts.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": this.opts.userAgent,
      Authorization: mode === "bare" || !token ? "JWT" : `JWT ${token}`,
      ...this.opts.headers,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (this.opts.timeoutMs > 0) init.signal = AbortSignal.timeout(this.opts.timeoutMs);
    return init;
  }

  private backoff(attempt: number): number {
    const base = this.opts.retryDelayMs;
    return base * 2 ** (attempt - 1) + Math.random() * base * 0.25;
  }

  private retryDelay(res: Response, attempt: number): number {
    const header = res.headers.get("retry-after");
    const seconds = header === null ? NaN : Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
    return this.backoff(attempt);
  }

  private async parse<T extends RawEnvelope>(
    res: Response,
    method: string,
    path: string,
  ): Promise<T> {
    const text = await res.text();
    let body: unknown;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }

    // A YPT error envelope takes priority, whatever the HTTP status was.
    if (isRecord(body) && body.s === false) {
      const code = typeof body.c === "number" || typeof body.c === "string" ? body.c : undefined;
      const message = typeof body.m === "string" && body.m ? body.m : "YPT API error";
      const init = { code, status: res.status, body };
      const isAuth = (typeof code === "number" && AUTH_ERROR_CODES.has(code)) || res.status === 401;
      throw isAuth
        ? new YptAuthError(`${message}${code !== undefined ? ` (code ${code})` : ""}`, init)
        : new YptApiError(`${message}${code !== undefined ? ` (code ${code})` : ""}`, init);
    }

    if (res.status === 401) {
      throw new YptAuthError("Unauthorized (HTTP 401)", { status: 401, body });
    }

    if (!res.ok) {
      throw new YptHttpError(`HTTP ${res.status} on ${method} ${path}`, {
        status: res.status,
        url: res.url || path,
        body,
      });
    }

    if (!isRecord(body)) {
      throw new YptHttpError(`Unexpected non-JSON response on ${method} ${path}`, {
        status: res.status,
        url: res.url || path,
        body: text.slice(0, 200),
      });
    }

    return body as unknown as T;
  }
}
