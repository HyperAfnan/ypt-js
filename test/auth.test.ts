import { describe, expect, it } from "vitest";
import {
  YptApiError,
  YptAuthError,
  YptJs,
  YptHttpError,
  YptValidationError,
  validatePassword,
} from "../src";
import {
  GROUPS_BODY,
  SIGN_IN_OK,
  SIGN_IN_MODERN_OK,
  SOCIAL_SIGN_UP_OK,
  mockFetch,
} from "./helpers";

describe("auth", () => {
  it("signs in with the bare JWT header, does the splash handshake, then uses the token", async () => {
    const { fn, calls } = mockFetch((c) => {
      if (c.url.pathname === "/user/sign-in-jwt") return { json: SIGN_IN_OK };
      if (c.url.pathname === "/user/v2/splash-login") return { json: { s: true } };
      return { json: GROUPS_BODY };
    });
    const tokens: string[] = [];
    const client = new YptJs({ fetch: fn, onTokenChange: (t) => tokens.push(t) });

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
    const client = new YptJs({ fetch: fn });
    await client.auth.signIn({ email: "a@b.c", password: "pw" }, { splash: false });
    expect(calls).toHaveLength(1);
  });

  it("maps sign-in failure codes to YptAuthError", async () => {
    const { fn } = mockFetch(() => ({ json: { s: false, c: 112, m: "Incorrect password" } }));
    const client = new YptJs({ fetch: fn });

    const err = await client.auth.signIn({ email: "a@b.c", password: "bad" }).catch((e) => e);

    expect(err).toBeInstanceOf(YptAuthError);
    expect(err.code).toBe(112);
    expect(err.message).toContain("Incorrect password");
    expect(client.token).toBeUndefined();
  });

  it("maps other error envelopes to YptApiError (not YptAuthError)", async () => {
    const { fn } = mockFetch(() => ({ json: { s: false, c: 999, m: "Something else" } }));
    const client = new YptJs({ fetch: fn, token: "t" });

    const err = await client.groups.listJoined().catch((e) => e);

    expect(err).toBeInstanceOf(YptApiError);
    expect(err).not.toBeInstanceOf(YptAuthError);
    expect(err.code).toBe(999);
  });

  it("fails fast with YptAuthError when there is no token and no credentials", async () => {
    const { fn, calls } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptJs({ fetch: fn });

    await expect(client.groups.listJoined()).rejects.toBeInstanceOf(YptAuthError);
    expect(calls).toHaveLength(0);
  });

  it("signs in lazily when credentials are supplied", async () => {
    const { fn, calls } = mockFetch((c) => {
      if (c.url.pathname === "/user/sign-in-jwt") return { json: SIGN_IN_OK };
      if (c.url.pathname === "/user/v2/splash-login") return { json: { s: true } };
      return { json: GROUPS_BODY };
    });
    const client = new YptJs({ fetch: fn, credentials: { email: "a@b.c", password: "pw" } });

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
    const client = new YptJs({ fetch: fn, credentials: { email: "a@b.c", password: "pw" } });

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
    const client = new YptJs({
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
    const client = new YptJs({ fetch: fn, token: "old" });

    await expect(client.groups.listJoined()).rejects.toBeInstanceOf(YptAuthError);
    expect(calls).toHaveLength(1);
  });

  it("signs in with modern dual-token response and maps enriched user profile", async () => {
    const { fn } = mockFetch((c) => {
      if (c.url.pathname === "/user/sign-in-jwt") return { json: SIGN_IN_MODERN_OK };
      if (c.url.pathname === "/user/v2/splash-login") return { json: { s: true } };
      return { json: {} };
    });

    const sessions: any[] = [];
    const client = new YptJs({ fetch: fn, onSessionChange: (s) => sessions.push(s) });
    const user = await client.auth.signIn({ email: "student@example.com", password: "Password1!" });

    expect(client.token).toBe("access-token-123");
    expect(client.accessToken).toBe("access-token-123");
    expect(client.refreshToken).toBe("refresh-token-456");
    expect(client.expiresAt).toBe(1730000000);
    expect(client.isAuthenticated).toBe(true);
    expect(user).toMatchObject({
      id: 1049281,
      email: "student@example.com",
      nickname: "HardWorker2026",
      statusMsg: "Studying for exams",
      profileImage: "https://picf.tgclab.com/users/avatar.jpg",
      flames: 12,
      tier: "GOLD",
      createdAt: "2024-03-15T08:30:00Z",
    });
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0].accessToken).toBe("access-token-123");
  });

  it("handles socialSignUp with Kakao provider and sends correct payload", async () => {
    const { fn, calls } = mockFetch((c) => {
      if (c.url.pathname === "/user/social/sign-up-jwt") return { json: SOCIAL_SIGN_UP_OK };
      if (c.url.pathname === "/user/v2/splash-login") return { json: { s: true } };
      return { json: {} };
    });

    const client = new YptJs({ fetch: fn });
    const user = await client.auth.socialSignUp({
      provider: "KAKAO",
      token: "oauth-kakao-token",
      nickname: "StudyWarrior",
    });

    expect(calls[0].url.pathname).toBe("/user/social/sign-up-jwt");
    expect(calls[0].body).toEqual({
      provider: "KAKAO",
      token: "oauth-kakao-token",
      nickname: "StudyWarrior",
      operatingSystem: "android",
      terms: true,
      privacy: true,
      age_over_14: true,
    });
    expect(client.token).toBe("social-access-tok-789");
    expect(client.refreshToken).toBe("social-refresh-tok-012");
    expect(user.socialType).toBe("KAKAO");
  });

  it("splashLogin transmits refreshToken and updates tokens on rotation", async () => {
    const { fn, calls } = mockFetch(() => ({
      json: {
        s: true,
        accessToken: "rotated-access-token",
        refreshToken: "rotated-refresh-token",
        expiresAt: 1800000000,
      },
    }));

    const client = new YptJs({ fetch: fn, refreshToken: "initial-refresh-token" });
    const res = await client.auth.splashLogin();

    expect(calls[0].body.refreshToken).toBe("initial-refresh-token");
    expect(res.accessToken).toBe("rotated-access-token");
    expect(client.token).toBe("rotated-access-token");
    expect(client.refreshToken).toBe("rotated-refresh-token");
  });

  it("restoreSession restores session from valid refreshToken", async () => {
    const { fn } = mockFetch(() => ({
      json: { s: true, accessToken: "restored-token" },
    }));

    const client = new YptJs({ fetch: fn });
    await client.auth.restoreSession("my-saved-refresh-token");
    expect(client.token).toBe("restored-token");
    expect(client.isAuthenticated).toBe(true);
  });

  it("restoreSession rejects invalid/empty refreshToken", async () => {
    const { fn } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn });
    await expect(client.auth.restoreSession("")).rejects.toBeInstanceOf(YptValidationError);
  });

  it("re-authenticates automatically with refreshToken on 401 before credentials", async () => {
    let getCallCount = 0;
    const { fn } = mockFetch((c) => {
      if (c.url.pathname === "/group/groups/v2") {
        getCallCount++;
        if (getCallCount === 1) return { status: 401, json: { s: false, m: "token expired" } };
        return { json: GROUPS_BODY };
      }
      if (c.url.pathname === "/user/v2/splash-login") {
        return { json: { s: true, accessToken: "new-access-token-from-refresh" } };
      }
      return { json: {} };
    });

    const client = new YptJs({
      fetch: fn,
      token: "old-token",
      refreshToken: "saved-refresh-token",
    });

    const groups = await client.groups.listJoined();
    expect(groups).toHaveLength(2);
    expect(client.token).toBe("new-access-token-from-refresh");
  });

  it("exchanges custom token with Firebase endpoint", async () => {
    const { fn, calls } = mockFetch(() => ({
      json: { s: true, token: "firebase-custom-jwt-token" },
    }));

    const client = new YptJs({ fetch: fn, token: "tok" });
    const fbToken = await client.auth.getFirebaseCustomToken();

    expect(fbToken).toBe("firebase-custom-jwt-token");
    expect(calls[0].url.pathname).toBe("/user/firebase/custom-token");
  });

  it("registers device push token", async () => {
    const { fn, calls } = mockFetch(() => ({ json: { s: true } }));
    const client = new YptJs({ fetch: fn, token: "tok" });
    await client.auth.registerPushToken("fcm-device-push-token-123");

    expect(calls[0].url.pathname).toBe("/user/push-token");
    expect(calls[0].body.token).toBe("fcm-device-push-token-123");
  });

  it("performs account operations (checkUsername, updateNickname, updateStatusMessage, logout)", async () => {
    const { fn } = mockFetch((c) => {
      if (c.url.pathname === "/user/exist-username") return { json: { s: true, exist: true } };
      if (c.url.pathname === "/user/nickname/change") return { json: { s: true } };
      if (c.url.pathname === "/user/status_msg/change") return { json: { s: true } };
      if (c.url.pathname === "/user/logout") return { json: { s: true } };
      return { json: {} };
    });

    const client = new YptJs({ fetch: fn, token: "tok" });
    client.setSession({ accessToken: "tok", refreshToken: "ref" });

    const exists = await client.auth.checkUsername("HardWorker");
    expect(exists).toBe(true);

    await client.auth.updateNickname("NewNick");
    await client.auth.updateStatusMessage("New Status");

    expect(client.isAuthenticated).toBe(true);
    await client.auth.logout();
    expect(client.isAuthenticated).toBe(false);
    expect(client.token).toBeUndefined();
    expect(client.refreshToken).toBeUndefined();
  });

  it("supports authScheme: Bearer", async () => {
    const { fn, calls } = mockFetch(() => ({ json: GROUPS_BODY }));
    const client = new YptJs({ fetch: fn, token: "my-token", authScheme: "Bearer" });

    await client.groups.listJoined();
    expect(calls[0].headers.get("authorization")).toBe("Bearer my-token");
  });

  it("validates password rules with validatePassword and strictPasswordValidation", async () => {
    expect(validatePassword("short").valid).toBe(false);
    expect(validatePassword("alllowercase").valid).toBe(false);
    expect(validatePassword("ALLUPPERCASE").valid).toBe(false);
    expect(validatePassword("12345678").valid).toBe(false);
    expect(validatePassword("ValidPass1!").valid).toBe(true);

    const { fn } = mockFetch(() => ({ json: SIGN_IN_OK }));
    const client = new YptJs({ fetch: fn });

    await expect(
      client.auth.signIn(
        { email: "user@example.com", password: "short" },
        { strictPasswordValidation: true },
      ),
    ).rejects.toBeInstanceOf(YptValidationError);
  });
});

describe("retries", () => {
  it("retries GET on 5xx and succeeds", async () => {
    const { fn, calls } = mockFetch((_c, n) =>
      n === 1 ? { status: 503, json: {} } : { json: GROUPS_BODY },
    );
    const client = new YptJs({ fetch: fn, token: "t", retryDelayMs: 0 });

    const groups = await client.groups.listJoined();

    expect(groups).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("gives up after maxRetries and throws YptHttpError", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 500, json: {} }));
    const client = new YptJs({ fetch: fn, token: "t", retryDelayMs: 0, maxRetries: 2 });

    const err = await client.groups.listJoined().catch((e) => e);

    expect(err).toBeInstanceOf(YptHttpError);
    expect(err.status).toBe(500);
    expect(calls).toHaveLength(3);
  });

  it("never retries POST (sign-in)", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 503, json: {} }));
    const client = new YptJs({ fetch: fn, retryDelayMs: 0 });

    await expect(client.auth.signIn({ email: "a@b.c", password: "pw" })).rejects.toBeInstanceOf(
      YptHttpError,
    );
    expect(calls).toHaveLength(1);
  });
});
