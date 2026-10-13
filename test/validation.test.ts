import { describe, expect, it } from "vitest";
import { YptClient, YptJs, YptValidationError } from "../src";
import { mockFetch } from "./helpers";

describe("Zod validation", () => {
  it("exports YptClient as an alias for YptJs", () => {
    expect(YptClient).toBe(YptJs);
  });

  describe("Input validation", () => {
    it("rejects invalid email addresses in signIn", async () => {
      const { fn, calls } = mockFetch(() => ({ json: { s: true, jwt: "fake" } }));
      const client = new YptJs({ fetch: fn });

      const err = await client.auth
        .signIn({ email: "invalid-email", password: "pw" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(YptValidationError);
      expect(err.target).toBe("input");
      expect(err.message).toContain("Invalid email address");
      expect(calls).toHaveLength(0);
    });

    it("rejects empty passwords in signIn", async () => {
      const { fn, calls } = mockFetch(() => ({ json: { s: true, jwt: "fake" } }));
      const client = new YptJs({ fetch: fn });

      const err = await client.auth
        .signIn({ email: "valid@email.com", password: "" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(YptValidationError);
      expect(err.target).toBe("input");
      expect(err.message).toContain("Password cannot be empty");
      expect(calls).toHaveLength(0);
    });

    it("rejects invalid options in YptJs constructor", () => {
      expect(() => {
        new YptJs({ baseUrl: "not-a-url" });
      }).toThrow(YptValidationError);

      expect(() => {
        new YptJs({ timeoutMs: -100 });
      }).toThrow(YptValidationError);

      expect(() => {
        new YptJs({ maxRetries: -1 });
      }).toThrow(YptValidationError);

      expect(() => {
        new YptJs({ credentials: { email: "invalid", password: "pw" } });
      }).toThrow(YptValidationError);

      expect(() => {
        new YptJs({ authScheme: "INVALID" as any });
      }).toThrow(YptValidationError);
    });

    it("accepts valid new options in YptJs constructor", () => {
      const client = new YptJs({
        token: "access-token",
        refreshToken: "refresh-token",
        expiresAt: 1730000000,
        authScheme: "Bearer",
        onSessionChange: () => {},
      });
      expect(client.token).toBe("access-token");
      expect(client.refreshToken).toBe("refresh-token");
      expect(client.expiresAt).toBe(1730000000);
    });

    it("rejects invalid inputs in socialSignUp", async () => {
      const { fn } = mockFetch(() => ({ json: { s: true } }));
      const client = new YptJs({ fetch: fn });

      await expect(
        client.auth.socialSignUp({
          provider: "UNKNOWN_PROVIDER" as any,
          token: "token",
          nickname: "nick",
        }),
      ).rejects.toBeInstanceOf(YptValidationError);

      await expect(
        client.auth.socialSignUp({
          provider: "KAKAO",
          token: "",
          nickname: "nick",
        }),
      ).rejects.toBeInstanceOf(YptValidationError);

      await expect(
        client.auth.socialSignUp({
          provider: "GOOGLE",
          token: "tok",
          nickname: "",
        }),
      ).rejects.toBeInstanceOf(YptValidationError);
    });

    it("rejects non-numeric group IDs in get", async () => {
      const { fn, calls } = mockFetch(() => ({ json: { s: true, gs: [] } }));
      const client = new YptJs({ fetch: fn, token: "tok" });

      await expect(client.groups.get("invalid_id")).rejects.toBeInstanceOf(YptValidationError);
      expect(calls).toHaveLength(0);
    });

    it("rejects invalid concurrency in listAllMembers", async () => {
      const { fn, calls } = mockFetch(() => ({ json: { s: true, gs: [] } }));
      const client = new YptJs({ fetch: fn, token: "tok" });

      await expect(client.groups.listAllMembers({ concurrency: -1 })).rejects.toBeInstanceOf(
        YptValidationError,
      );
      expect(calls).toHaveLength(0);
    });
  });

  describe("Upstream response validation", () => {
    it("rejects malformed API responses missing boolean success field", async () => {
      const { fn } = mockFetch(() => ({ json: { invalid: "payload without s" } }));
      const client = new YptJs({ fetch: fn, token: "tok" });

      const err = await client.groups.listJoined().catch((e) => e);

      expect(err).toBeInstanceOf(YptValidationError);
      expect(err.target).toBe("response");
      expect(err.raw).toEqual({ invalid: "payload without s" });
    });

    it("rejects malformed sign-in responses", async () => {
      const { fn } = mockFetch(() => ({ json: { notAnEnvelope: true } }));
      const client = new YptJs({ fetch: fn });

      const err = await client.auth
        .signIn({ email: "user@example.com", password: "pw" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(YptValidationError);
      expect(err.target).toBe("response");
    });
  });
});
