import { YptApiError, YptAuthError, YptValidationError } from "../errors";
import type { HttpClient } from "../http";
import { mapUser, validatePassword } from "../mappers";
import {
  RawFirebaseTokenResponseSchema,
  RawSignInResponseSchema,
  RawSplashLoginResponseSchema,
  SignInOptionsSchema,
  SignInParamsSchema,
  SocialSignUpParamsSchema,
  SplashLoginParamsSchema,
} from "../schemas";
import type {
  RawEnvelope,
  RawFirebaseCustomTokenResponse,
  RawSignInResponse,
  RawSplashLoginResponse,
  SocialSignUpParams,
  SplashDevice,
  SplashLoginParams,
  SplashLoginResult,
  YptUser,
} from "../types";

export interface SignInParams {
  email: string;
  password: string;
}

export interface SignInOptions {
  /** Run the splash-login handshake right after signing in. Default: true. */
  splash?: boolean;
  /** If true, verifies password meets YPT's 8-character 2-category rule before submitting. */
  strictPasswordValidation?: boolean;
}

/** Mutable session state shared between the client and the auth resource. */
export interface SessionState {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: YptUser;
}

export interface SetSessionTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export type SetSessionCallback = (tokens: SetSessionTokens | string) => void;

export const DEFAULT_DEVICE: SplashDevice = {
  version: 810046,
  pushToken: "",
  timezone: "UTC",
  deviceType: "WIN",
  osVersion: 10,
  deviceModel: "Desktop",
  pv: 2,
};

export class AuthResource {
  constructor(
    private readonly http: HttpClient,
    private readonly session: SessionState,
    private readonly onSetSession: SetSessionCallback,
    private readonly language: string,
    private readonly device: SplashDevice,
  ) {}

  /**
   * `POST /user/sign-in-jwt`. Authenticates using email and password.
   * On success, updates session tokens and fetches user profile.
   * Throws `YptAuthError` for auth errors (e.g. wrong password or suspended account).
   */
  async signIn(params: SignInParams, options: SignInOptions = {}): Promise<YptUser> {
    const parsedParams = SignInParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new YptValidationError("input", parsedParams.error);
    }

    const parsedOptions = SignInOptionsSchema.safeParse(options);
    if (!parsedOptions.success) {
      throw new YptValidationError("input", parsedOptions.error);
    }

    if (options.strictPasswordValidation) {
      const check = validatePassword(params.password);
      if (!check.valid) {
        throw new YptValidationError("input", {
          issues: [
            {
              code: "custom",
              path: ["password"],
              message: check.reason ?? "Invalid password",
            },
          ],
        } as any);
      }
    }

    const raw = await this.http.post<RawSignInResponse>(
      "/user/sign-in-jwt",
      {
        email: parsedParams.data.email,
        password: parsedParams.data.password,
        loginProvider: "Email",
        new: true,
        getx: true,
        language: this.language,
      },
      "bare",
    );

    const parsedRaw = RawSignInResponseSchema.safeParse(raw);
    if (!parsedRaw.success) {
      throw new YptValidationError("response", parsedRaw.error, raw);
    }

    const accessToken = raw.accessToken ?? raw.jwt;
    if (typeof accessToken !== "string" || accessToken === "") {
      throw new YptApiError("Sign-in succeeded but the response contained no token", {
        body: { ...raw, jwt: undefined, accessToken: undefined },
      });
    }

    const user = mapUser(raw, parsedParams.data.email);

    this.updateSessionTokens({
      accessToken,
      refreshToken: raw.refreshToken,
      expiresAt: raw.expiresAt,
    });
    this.session.user = user;

    if (options.splash ?? true) await this.splashLogin();
    return user;
  }

  /**
   * `POST /user/social/sign-up-jwt`. Signs up or logs in using an OAuth social provider
   * (`KAKAO`, `NAVER`, `GOOGLE`, `APPLE`, `FACEBOOK`).
   */
  async socialSignUp(params: SocialSignUpParams, options: SignInOptions = {}): Promise<YptUser> {
    const parsedParams = SocialSignUpParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new YptValidationError("input", parsedParams.error);
    }

    const parsedOptions = SignInOptionsSchema.safeParse(options);
    if (!parsedOptions.success) {
      throw new YptValidationError("input", parsedOptions.error);
    }

    const raw = await this.http.post<RawSignInResponse>(
      "/user/social/sign-up-jwt",
      {
        provider: parsedParams.data.provider,
        token: parsedParams.data.token,
        nickname: parsedParams.data.nickname,
        operatingSystem: parsedParams.data.operatingSystem,
        terms: parsedParams.data.terms,
        privacy: parsedParams.data.privacy,
        age_over_14: parsedParams.data.ageOver14,
      },
      "bare",
    );

    const parsedRaw = RawSignInResponseSchema.safeParse(raw);
    if (!parsedRaw.success) {
      throw new YptValidationError("response", parsedRaw.error, raw);
    }

    const accessToken = raw.accessToken ?? raw.jwt;
    if (typeof accessToken !== "string" || accessToken === "") {
      throw new YptApiError("Social sign-up succeeded but the response contained no token", {
        body: { ...raw, jwt: undefined, accessToken: undefined },
      });
    }

    const user = mapUser(raw);
    if (!user.socialType) {
      user.socialType = parsedParams.data.provider;
    }

    this.updateSessionTokens({
      accessToken,
      refreshToken: raw.refreshToken,
      expiresAt: raw.expiresAt,
    });
    this.session.user = user;

    if (options.splash ?? true) await this.splashLogin();
    return user;
  }

  /**
   * `POST /user/v2/splash-login`: Device handshake and session restore.
   * Can rotate tokens if a refreshToken is supplied or stored.
   */
  async splashLogin(
    params: SplashLoginParams | Partial<SplashDevice> = {},
  ): Promise<SplashLoginResult> {
    let refreshToken: string | undefined;
    let deviceOverride: Partial<SplashDevice> = {};

    if ("refreshToken" in params || "device" in params) {
      const p = params as SplashLoginParams;
      refreshToken = p.refreshToken ?? this.session.refreshToken;
      deviceOverride = p.device ?? {};
    } else {
      deviceOverride = params as Partial<SplashDevice>;
      refreshToken = this.session.refreshToken;
    }

    const body: Record<string, unknown> = {
      ...this.device,
      ...deviceOverride,
      language: this.language,
    };
    if (refreshToken) {
      body.refreshToken = refreshToken;
    }

    const authMode = this.session.token ? "token" : "bare";
    const raw = await this.http.post<RawSplashLoginResponse>(
      "/user/v2/splash-login",
      body,
      authMode,
    );

    const parsed = RawSplashLoginResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new YptValidationError("response", parsed.error, raw);
    }

    if (raw.accessToken) {
      this.updateSessionTokens({
        accessToken: raw.accessToken,
        refreshToken: raw.refreshToken ?? refreshToken,
        expiresAt: raw.expiresAt,
      });
    }

    return {
      success: raw.s ?? true,
      accessToken: raw.accessToken,
      refreshToken: raw.refreshToken ?? refreshToken,
      expiresAt: raw.expiresAt,
    };
  }

  /**
   * Restores an authenticated session using a stored refresh token.
   */
  async restoreSession(
    refreshToken: string,
    device?: Partial<SplashDevice>,
  ): Promise<SplashLoginResult> {
    if (!refreshToken || typeof refreshToken !== "string" || refreshToken.trim() === "") {
      throw new YptValidationError("input", {
        issues: [
          {
            code: "custom",
            path: ["refreshToken"],
            message: "refreshToken must be a non-empty string",
          },
        ],
      } as any);
    }

    this.session.refreshToken = refreshToken;
    const res = await this.splashLogin({ refreshToken, device });
    if (!this.session.token && !res.accessToken) {
      throw new YptAuthError("Failed to restore session. Refresh token invalid or expired.");
    }
    return res;
  }

  /**
   * `POST /user/firebase/custom-token`: Exchanges the authenticated YPT JWT for a Google Firebase Custom Token.
   */
  async getFirebaseCustomToken(): Promise<string> {
    const raw = await this.http.post<RawFirebaseCustomTokenResponse>(
      "/user/firebase/custom-token",
      {},
    );

    const parsed = RawFirebaseTokenResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new YptValidationError("response", parsed.error, raw);
    }

    const token = raw.token ?? raw.customToken ?? raw.firebaseCustomToken;
    if (!token || typeof token !== "string") {
      throw new YptApiError("Firebase token response did not contain a valid token", { body: raw });
    }
    return token;
  }

  /**
   * `POST /user/push-token`: Registers a device FCM / APNs push notification token.
   */
  async registerPushToken(token: string): Promise<void> {
    if (!token || typeof token !== "string" || token.trim() === "") {
      throw new YptValidationError("input", {
        issues: [
          {
            code: "custom",
            path: ["token"],
            message: "Push token must be a non-empty string",
          },
        ],
      } as any);
    }
    await this.http.post<RawEnvelope>("/user/push-token", {
      token,
      pushToken: token,
    });
  }

  /**
   * `POST /user/logout`: Logs out of the current session on the backend and clears in-memory tokens.
   */
  async logout(): Promise<void> {
    try {
      await this.http.post<RawEnvelope>("/user/logout", {});
    } finally {
      this.session.token = undefined;
      this.session.accessToken = undefined;
      this.session.refreshToken = undefined;
      this.session.expiresAt = undefined;
      this.session.user = undefined;
    }
  }

  /**
   * `POST /user/exist-username`: Checks whether a nickname/username is already taken.
   */
  async checkUsername(nickname: string): Promise<boolean> {
    if (!nickname || typeof nickname !== "string" || nickname.trim() === "") {
      throw new YptValidationError("input", {
        issues: [
          {
            code: "custom",
            path: ["nickname"],
            message: "Nickname must be a non-empty string",
          },
        ],
      } as any);
    }

    const raw = await this.http.post<RawEnvelope & { exist?: boolean; isExist?: boolean }>(
      "/user/exist-username",
      { nickname: nickname.trim() },
    );
    return Boolean(raw.exist ?? raw.isExist);
  }

  /**
   * `POST /user/nickname/change`: Changes the user's nickname.
   */
  async updateNickname(nickname: string): Promise<void> {
    if (!nickname || typeof nickname !== "string" || nickname.trim() === "") {
      throw new YptValidationError("input", {
        issues: [
          {
            code: "custom",
            path: ["nickname"],
            message: "Nickname must be a non-empty string",
          },
        ],
      } as any);
    }
    await this.http.post<RawEnvelope>("/user/nickname/change", { nickname: nickname.trim() });
    if (this.session.user) {
      this.session.user.nickname = nickname.trim();
    }
  }

  /**
   * `POST /user/status_msg/change`: Updates the user's status message / study bio.
   */
  async updateStatusMessage(statusMsg: string): Promise<void> {
    await this.http.post<RawEnvelope>("/user/status_msg/change", {
      status_msg: statusMsg,
      statusMsg,
    });
    if (this.session.user) {
      this.session.user.statusMsg = statusMsg;
    }
  }

  private updateSessionTokens(tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }): void {
    this.session.token = tokens.accessToken;
    this.session.accessToken = tokens.accessToken;
    if (tokens.refreshToken !== undefined) this.session.refreshToken = tokens.refreshToken;
    if (tokens.expiresAt !== undefined) this.session.expiresAt = tokens.expiresAt;

    if (typeof this.onSetSession === "function") {
      try {
        (this.onSetSession as any)(tokens);
      } catch {
        (this.onSetSession as any)(tokens.accessToken);
      }
    }
  }
}
