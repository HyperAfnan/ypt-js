import { describe, expect, it } from "vitest";
import { YptClient, YptValidationError } from "../src";
import { mockFetch } from "./helpers";

describe("Zod validation", () => {
  describe("Input validation", () => {
    it("rejects invalid email addresses in signIn", async () => {
      const { fn, calls } = mockFetch(() => ({ json: { s: true, jwt: "fake" } }));
      const client = new YptClient({ fetch: fn });

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
      const client = new YptClient({ fetch: fn });

      const err = await client.auth
        .signIn({ email: "valid@email.com", password: "" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(YptValidationError);
      expect(err.target).toBe("input");
      expect(err.message).toContain("Password cannot be empty");
      expect(calls).toHaveLength(0);
    });

    it("rejects invalid options in YptClient constructor", () => {
      expect(() => {
        new YptClient({ baseUrl: "not-a-url" });
      }).toThrow(YptValidationError);

      expect(() => {
        new YptClient({ timeoutMs: -100 });
      }).toThrow(YptValidationError);

      expect(() => {
        new YptClient({ maxRetries: -1 });
      }).toThrow(YptValidationError);

      expect(() => {
        new YptClient({ credentials: { email: "invalid", password: "pw" } });
      }).toThrow(YptValidationError);
    });

    it("rejects non-numeric group IDs in get", async () => {
      const { fn, calls } = mockFetch(() => ({ json: { s: true, gs: [] } }));
      const client = new YptClient({ fetch: fn, token: "tok" });

      await expect(client.groups.get("invalid_id")).rejects.toBeInstanceOf(YptValidationError);
      expect(calls).toHaveLength(0);
    });

    it("rejects invalid concurrency in listAllMembers", async () => {
      const { fn, calls } = mockFetch(() => ({ json: { s: true, gs: [] } }));
      const client = new YptClient({ fetch: fn, token: "tok" });

      await expect(client.groups.listAllMembers({ concurrency: -1 })).rejects.toBeInstanceOf(
        YptValidationError,
      );
      expect(calls).toHaveLength(0);
    });
  });

  describe("Upstream response validation", () => {
    it("rejects malformed API responses missing boolean success field", async () => {
      const { fn } = mockFetch(() => ({ json: { invalid: "payload without s" } }));
      const client = new YptClient({ fetch: fn, token: "tok" });

      const err = await client.groups.listJoined().catch((e) => e);

      expect(err).toBeInstanceOf(YptValidationError);
      expect(err.target).toBe("response");
      expect(err.raw).toEqual({ invalid: "payload without s" });
    });

    it("rejects malformed sign-in responses", async () => {
      const { fn } = mockFetch(() => ({ json: { notAnEnvelope: true } }));
      const client = new YptClient({ fetch: fn });

      const err = await client.auth
        .signIn({ email: "user@example.com", password: "pw" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(YptValidationError);
      expect(err.target).toBe("response");
    });
  });
});
