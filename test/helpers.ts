import type { FetchLike } from "../src";

export interface Call {
  url: URL;
  method: string;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export interface Reply {
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
}

/** A fake `fetch` that records every call and answers via `handler`. */
export function mockFetch(handler: (call: Call, n: number) => Reply) {
  const calls: Call[] = [];
  const fn: FetchLike = async (input, init) => {
    const call: Call = {
      url: new URL(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers as Record<string, string>),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const reply = handler(call, calls.length);
    return new Response(JSON.stringify(reply.json ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };
  return { fn, calls };
}

// Payloads taken from the endpoint reference.
export const SIGN_IN_OK = {
  s: true,
  jwt: "tok-1",
  id: 16300695,
  ud: 16300695,
  n: "StudentBot",
  e: "user@example.com",
  today: "2026-10-13",
};

export const GROUPS_BODY = {
  s: true,
  ms: [
    {
      id: 6487271,
      t: "Algorithm Masters",
      c: "Computer Science",
      on: "BotAdmin",
      jc: 30,
      mc: 50,
      ip: true,
      sn: "Daily minimum: 4 hours",
    },
  ],
  cs: [],
  gs: [
    {
      id: 6814572,
      t: "Global Study Room",
      c: "General",
      on: "GroupLeader",
      jc: 48,
      mc: 50,
      ip: false,
      sn: "Welcome everyone!",
    },
  ],
  ps: [],
};

export const MEMBERS_BODY = {
  s: true,
  ms: [
    {
      ud: 16300695,
      n: "Afnan",
      ct: "College",
      sd: 105,
      hasCustomAvatar: false,
      dl: {
        sm: 14400000,
        is: true,
        ia: false,
        ss: 1773456000000,
        sn: "Distributed Systems",
        dt: "2026-10-13",
        dd: "2026-10-13",
      },
    },
    {
      ud: 19482103,
      n: "Sarah",
      ct: "High School",
      sd: 204,
      hasCustomAvatar: true,
      dl: { sm: 7200000, is: false, ia: false, sn: null, dt: "2026-10-13", dd: "2026-10-13" },
    },
  ],
};
