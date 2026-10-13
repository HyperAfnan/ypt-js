import { YptApiError, YptValidationError } from "../errors";
import type { HttpClient } from "../http";
import { RawSignInResponseSchema, SignInOptionsSchema, SignInParamsSchema } from "../schemas";
import type { RawEnvelope, RawSignInResponse, SplashDevice, YptUser } from "../types";

export interface SignInParams {
  email: string;
  password: string;
}

export interface SignInOptions {
  /** Run the splash-login handshake right after signing in. Default: true. */
  splash?: boolean;
}

/** Mutable session state shared between the client and the auth resource. */
export interface SessionState {
  token?: string;
  user?: YptUser;
}

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
    private readonly setToken: (token: string) => void,
    private readonly language: string,
    private readonly device: SplashDevice,
  ) {}

  /**
   * `POST /user/sign-in-jwt`. On success the token is stored on the client and
   * used for every later call. Throws `YptAuthError` for codes 112/113/114.
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

    if (typeof raw.jwt !== "string" || raw.jwt === "") {
      throw new YptApiError("Sign-in succeeded but the response contained no token", {
        body: { ...raw, jwt: undefined },
      });
    }

    const id = Number(raw.id ?? raw.ud);
    const user: YptUser = {
      id: Number.isFinite(id) ? id : 0,
      nickname: typeof raw.n === "string" ? raw.n : "",
      email: typeof raw.e === "string" ? raw.e : params.email,
      today: typeof raw.today === "string" ? raw.today : null,
    };

    this.setToken(raw.jwt);
    this.session.user = user;

    if (options.splash ?? true) await this.splashLogin();
    return user;
  }

  /**
   * `POST /user/v2/splash-login`: the device handshake the official app performs
   * after login. Requires a token.
   */
  async splashLogin(device: Partial<SplashDevice> = {}): Promise<void> {
    await this.http.post<RawEnvelope>("/user/v2/splash-login", {
      ...this.device,
      ...device,
      language: this.language,
    });
  }
}
