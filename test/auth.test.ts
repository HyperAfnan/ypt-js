import { describe, expect, it } from "vitest";
import { YptApiError, YptAuthError, YptClient, YptHttpError } from "../src";
import { GROUPS_BODY, SIGN_IN_OK, mockFetch } from "./helpers";

describe("auth", () => {
  it("signs in with the bare JWT header, does the splash handshake, then uses the token", async () => {
    const { fn, calls } = mockFetch((c) => {
      if (c.url.pathname === "/user/sign-in-jwt") return { json: SIGN_IN_OK };
      if (c.url.pathname === "/user/v2/splash-login") return { json: { s: true } };
      return { json: GROUPS_BODY };
    });
    const tokens: string[] = [];
    const client = new YptClient({ fetch: fn, onTokenChange: (t) => tokens.push(t) });

    const user = await client.auth.signIn({ email: "user@example.com", password: "pw" });

    expect(user).toEqual({
      id: 16300695,
      nickname: "StudentBot",
      email: "user@example.com",
      today: "2026-10-13",
    });
    expect(client.token).toBe("tok-1");
    expect(client.user).toEqual(user);
    expect(tokens).toEqual(["tok-1"]);

    // Sign-in: literal "JWT", app-like headers and body.
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url.origin).toBe("https://pi.tgclab.com");
    expect(calls[0].headers.get("authorization")).toBe("JWT");
    expect(calls[0].headers.get("user-agent")).toBe("Dart/3.11 (dart:io)");
    expect(calls[0].headers.get("content-type")).toBe("application/json");
    expect(calls[0].body).toEqual({
      email: "user@example.com",
      password: "pw",
      loginProvider: "Email",
      new: true,
      getx: true,
      language: "en",
    });

    // Splash handshake carries the token and device info.
    expect(calls[1].url.pathname).toBe("/user/v2/splash-login");
    expect(calls[1].headers.get("authorization")).toBe("JWT tok-1");
    expect(calls[1].body).toMatchObject({
      version: 810046,
      deviceType: "WIN",
      pv: 2,
      language: "en",
    });

    // Later calls reuse the token.
    await client.groups.listJoined();
    expect(calls[2].headers.get("authorization")).toBe("JWT tok-1");
  });

  it("can skip the splash handshake", async () => {
    const { fn, calls } = mockFetch(() => ({ json: SIGN_IN_OK }));
    const client = new YptClient({ fetch: fn });
    await client.auth.signIn({ email: "a@b.c", password: "pw" }, { splash: false });
    expect(calls).toHaveLength(1);
  });

  it("maps sign-in failure codes to YptAuthError", async () => {
    const { fn } = mockFetch(() => ({ json: { s: false, c: 112, m: "Incorrect password" } }));
    const client = new YptClient({ fetch: fn });

    const err = await client.auth.signIn({ email: "a@b.c", password: "bad" }).catch((e) => e);

    expect(err).toBeInstanceOf(YptAuthError);
    expect(err.code).toBe(112);
    expect(err.message).toContain("Incorrect password");
    expect(client.token).toBeUndefined();
  });

  it("maps other error envelopes to YptApiError (not YptAuthError)", async () => {
    const { fn } = mockFetch(() => ({ json: { s: false, c: 999, m: "Something else" } }));
    const client = new YptClient({ fetch: fn, token: "t" });

    const err = await client.groups.listJoined().catch((e) => e);

    expect(err).toBeInstanceOf(YptApiError);
    expect(err).not.toBeInstanceOf(YptAuthError);
    expect(err.code).toBe(999);
  });

  it("fails fast with YptAuthError when there is no token and no credentials", async () => {
    const { fn, calls } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptClient({ fetch: fn });

    await expect(client.groups.listJoined()).rejects.toBeInstanceOf(YptAuthError);
    expect(calls).toHaveLength(0);
  });

  it("signs in lazily when credentials are supplied", async () => {
    const { fn, calls } = mockFetch((c) => {
      if (c.url.pathname === "/user/sign-in-jwt") return { json: SIGN_IN_OK };
      if (c.url.pathname === "/user/v2/splash-login") return { json: { s: true } };
      return { json: GROUPS_BODY };
    });
    const client = new YptClient({ fetch: fn, credentials: { email: "a@b.c", password: "pw" } });

    const groups = await client.groups.listJoined();

    expect(groups).toHaveLength(2);
    expect(calls.map((c) => c.url.pathname)).toEqual([
      "/user/sign-in-jwt",
      "/user/v2/splash-login",
      "/group/groups/v2",
    ]);
  });

  it("shares one login between concurrent requests", async () => {
    const { fn, calls } = mockFetch((c) => {
      if (c.url.pathname === "/user/sign-in-jwt") return { json: SIGN_IN_OK };
      if (c.url.pathname === "/user/v2/splash-login") return { json: { s: true } };
      return { json: GROUPS_BODY };
    });
    const client = new YptClient({ fetch: fn, credentials: { email: "a@b.c", password: "pw" } });

    await Promise.all([client.groups.listJoined(), client.groups.listJoined()]);

    expect(calls.filter((c) => c.url.pathname === "/user/sign-in-jwt")).toHaveLength(1);
  });

  it("re-authenticates once on HTTP 401 and retries the request", async () => {
    const { fn, calls } = mockFetch((c) => {
      if (c.url.pathname === "/user/sign-in-jwt") return { json: { ...SIGN_IN_OK, jwt: "tok-2" } };
      if (c.url.pathname === "/user/v2/splash-login") return { json: { s: true } };
      if (c.headers.get("authorization") === "JWT old") {
        return { status: 401, json: { s: false, m: "expired" } };
      }
      return { json: GROUPS_BODY };
    });
    const client = new YptClient({
      fetch: fn,
      token: "old",
      credentials: { email: "a@b.c", password: "pw" },
    });

    const groups = await client.groups.listJoined();

    expect(groups).toHaveLength(2);
    expect(client.token).toBe("tok-2");
    expect(calls.map((c) => c.url.pathname)).toEqual([
      "/group/groups/v2",
      "/user/sign-in-jwt",
      "/user/v2/splash-login",
      "/group/groups/v2",
    ]);
  });

  it("throws YptAuthError on 401 when there are no credentials to retry with", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 401, json: { s: false, m: "expired" } }));
    const client = new YptClient({ fetch: fn, token: "old" });

    await expect(client.groups.listJoined()).rejects.toBeInstanceOf(YptAuthError);
    expect(calls).toHaveLength(1);
  });
});

describe("retries", () => {
  it("retries GET on 5xx and succeeds", async () => {
    const { fn, calls } = mockFetch((_c, n) =>
      n === 1 ? { status: 503, json: {} } : { json: GROUPS_BODY },
    );
    const client = new YptClient({ fetch: fn, token: "t", retryDelayMs: 0 });

    const groups = await client.groups.listJoined();

    expect(groups).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("gives up after maxRetries and throws YptHttpError", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 500, json: {} }));
    const client = new YptClient({ fetch: fn, token: "t", retryDelayMs: 0, maxRetries: 2 });

    const err = await client.groups.listJoined().catch((e) => e);

    expect(err).toBeInstanceOf(YptHttpError);
    expect(err.status).toBe(500);
    expect(calls).toHaveLength(3);
  });

  it("never retries POST (sign-in)", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 503, json: {} }));
    const client = new YptClient({ fetch: fn, retryDelayMs: 0 });

    await expect(client.auth.signIn({ email: "a@b.c", password: "pw" })).rejects.toBeInstanceOf(
      YptHttpError,
    );
    expect(calls).toHaveLength(1);
  });
});
