/** Error codes the sign-in endpoint is known to return for auth problems. */
export const AUTH_ERROR_CODES: ReadonlySet<number> = new Set([112, 113, 114]);

/** Base class for everything this library throws. */
export class YptError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "YptError";
  }
}

/** The request never produced an HTTP response (DNS, TLS, timeout, offline...). */
export class YptNetworkError extends YptError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "YptNetworkError";
  }
}

/** The server answered with a non-2xx status and no recognizable YPT error envelope. */
export class YptHttpError extends YptError {
  readonly status: number;
  readonly url: string;
  readonly body: unknown;

  constructor(message: string, init: { status: number; url: string; body?: unknown }) {
    super(message);
    this.name = "YptHttpError";
    this.status = init.status;
    this.url = init.url;
    this.body = init.body;
  }
}

/** The server returned a YPT error envelope: `{ s: false, c: <code>, m: <message> }`. */
export class YptApiError extends YptError {
  /** Value of the `c` field, if present. */
  readonly code: number | string | undefined;
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(
    message: string,
    init: { code?: number | string; status?: number; body?: unknown } = {},
  ) {
    super(message);
    this.name = "YptApiError";
    this.code = init.code;
    this.status = init.status;
    this.body = init.body;
  }
}

/**
 * Authentication failed or is missing: wrong password (112), unknown email (113),
 * suspended account (114), an HTTP 401, or no token configured.
 */
export class YptAuthError extends YptApiError {
  constructor(
    message: string,
    init: { code?: number | string; status?: number; body?: unknown } = {},
  ) {
    super(message, init);
    this.name = "YptAuthError";
  }
}

import type { ZodError } from "zod";

/**
 * Thrown when caller inputs or upstream API responses fail schema validation.
 */
export class YptValidationError extends YptError {
  readonly issues: ZodError["issues"];
  readonly target: "input" | "response";
  readonly raw?: unknown;

  constructor(target: "input" | "response", error: ZodError, raw?: unknown) {
    const formatted = error.issues
      .map((i) => `[${i.path.join(".") || "root"}]: ${i.message}`)
      .join("; ");
    super(`Validation failed for ${target}: ${formatted}`, { cause: error });
    this.name = "YptValidationError";
    this.issues = error.issues;
    this.target = target;
    this.raw = raw;
  }
}
