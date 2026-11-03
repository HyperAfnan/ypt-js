# Contributing

[← Documentation index](./overview.md)

Thanks for improving `ypt-js`. This guide covers local setup, the test/validation
conventions, and the release process.

---

## 1. Requirements

- **Bun** is the project's package manager and script runner.
- Node.js 18+ for runtime compatibility checks.
- Git.

```bash
git clone https://github.com/HyperAfnan/ypt-js.git
cd ypt-js
bun install
```

Always use `bun install` and `bun add`, not `npm install`. The lockfile is `bun.lock`.

---

## 2. Scripts

| Command                  | What it does                                            |
| :----------------------- | :------------------------------------------------------ |
| `bun run typecheck`      | `tsc --noEmit` over `src`, `test`, and `tsup.config.ts` |
| `bun run test`           | `vitest run`                                            |
| `bun test`               | Bun's built-in test runner (used by CI)                 |
| `bun run format`         | Prettier write over the repo                            |
| `bun run format:check`   | Prettier check (CI gate)                                |
| `bun run build`          | `tsup` ESM + CJS build, then declarations               |
| `bun run dev`            | `tsup --watch`                                          |
| `bun run prepublishOnly` | typecheck + test + build before publishing              |

CI runs, in order: format check → typecheck → tests → build.

---

## 3. Project layout

```text
src/
├── index.ts               public exports only
├── client.ts              YptJs orchestrator and session state
├── http.ts                transport, retries, envelope decoding
├── errors.ts              error hierarchy
├── types.ts               raw wire types + public domain types
├── schemas.ts             Zod input + raw response schemas
├── mappers.ts             raw → domain transformations
└── resources/
    ├── auth.ts
    └── groups.ts
test/
├── helpers.ts             mockFetch and fixtures
├── auth.test.ts
├── groups.test.ts
└── validation.test.ts
```

---

## 4. Development workflow

1. Create a branch: `feat/…`, `fix/…`, `docs/…`.
2. Write code and tests.
3. Run the local gates:

```bash
bun run format
bun run typecheck
bun run test
bun run build
```

4. Open a pull request describing the behavior change and the upstream endpoint involved.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(groups): add attendance export
fix(auth): fall back to credentials when rotation fails
docs(api): correct leaderboard type union
chore(ci): pin bun version
```

---

## 5. Testing conventions

### Never call the network

Every test uses `mockFetch` from `test/helpers.ts` or an inline `fetch` stub. The suite must
pass offline and in CI.

```ts
import { mockFetch } from "./helpers";

const { fn, calls } = mockFetch((call) => {
  if (call.url.pathname === "/group/groups/v2") {
    return { json: { s: true, ms: [], cs: [], gs: [], ps: [] } };
  }
  return { json: { s: true } };
});

const client = new YptJs({ fetch: fn, token: "test-token" });
```

### Scrub sensitive data

Fixtures must not contain real emails, phone numbers, access tokens, refresh tokens, or
user ids. Use invented values (`user@example.com`, `tok-1`, `16300695`) and keep them
consistent across fixtures.

### Freeze time

Live study time depends on `now`. Inject a fixed clock:

```ts
const NOW = 1_773_456_900_000;
const client = new YptJs({ fetch: fn, token: "t", now: () => NOW });
```

Tests should assert both the numeric milliseconds and the formatted `HH:MM:SS` string.

### Cover the failure path

For each new endpoint, assert:

- Request path, method, query, and body.
- Happy-path mapping.
- Input validation (no request made).
- Response validation (malformed payload → `target: "response"`).
- Auth/API error mapping where relevant.
- Retry behavior only for `GET`.

---

## 6. Validation conventions

### Input schemas

- Live in `src/schemas.ts`.
- Validate before any network call.
- Normalize where safe (`.trim()`, defaults, transforms).
- Reject strings that could alter the query (e.g. `GroupIdSchema` requires digits).

### Raw response schemas

- Use `.passthrough()` so unknown upstream fields never break validation.
- Require only the fields the mapper truly needs.
- Accept both `number` and numeric `string` for numeric fields.
- Accept both legacy and modern key spellings when upstream uses both.
- Never make a response schema stricter than the mapper's needs; drift is expected.

### Input vs response errors

Both produce `YptValidationError`; the difference is `target`. Do not throw the raw
`ZodError` yourself — always wrap it so callers get a consistent type.

---

## 7. Mapper conventions

- Pure functions with explicit return types.
- Coerce with the existing `num`, `str`, and `parseIso` helpers.
- Never let one malformed record fail an entire list; return `null` and filter.
- Prefer conservative fallbacks (`0`, `""`, `null`) over throwing.
- Keep units explicit in names: `Ms`, `Seconds`, `Time` (formatted).
- Reuse `formatDuration` and `avatarUrl`.
- Add a doc comment when the upstream semantics are non-obvious.

---

## 8. Adding an endpoint

Follow the checklist in
[Architecture → Adding an endpoint](./architecture.md#12-adding-an-endpoint):

1. Add raw and public types.
2. Add a lenient raw schema (and an input schema if needed).
3. Add a pure mapper.
4. Add the resource method (validate → request → validate → map).
5. Export public types/schemas from `src/index.ts`.
6. Add tests with `mockFetch`.
7. Update `docs/api-reference.md`, `docs/upstream-api.md`, and the relevant guide.

Pick the correct auth mode:

- `"bare"` for sign-in/social.
- `"token"` (default) for authenticated endpoints.
- `"none"` only if the endpoint must not see the scheme at all.

---

## 9. Documentation

- Every public method change must update `docs/api-reference.md`.
- New wire behavior belongs in `docs/upstream-api.md`.
- User-facing workflows belong in the topical guides.
- Use fenced code blocks with `ts`, `json`, `bash`, or `text`.
- Use relative links between docs.
- State limitations honestly; this is a reverse-engineered client.

---

## 10. Release process

1. Ensure `main` is green (format, typecheck, tests, build).
2. Update the version in `package.json`.
3. Update `CHANGELOG.md` (generated with git-cliff).
4. Publish a GitHub release.
5. The `Publish to npm` workflow runs on `release: published`:
   - installs with Bun,
   - checks formatting,
   - typechecks,
   - runs tests,
   - builds,
   - publishes with `npm publish --provenance --access public`.

Do not publish manually unless the workflow is unavailable. Never commit tokens or npm
credentials.

---

## 11. Documentation site

The Markdown in `docs/` is also published as a VitePress site.

| Command                | Description                            |
| :--------------------- | :------------------------------------- |
| `bun run docs:dev`     | Local dev server with hot reload       |
| `bun run docs:build`   | Static build in `docs/.vitepress/dist` |
| `bun run docs:preview` | Preview the production build locally   |

- Landing page: `docs/index.md`
- Site config: `docs/.vitepress/config.ts` (nav, sidebar, search, base)
- Static assets: `docs/public/`
- The build fails on dead internal links, so run `bun run docs:build` before pushing docs.

For subpath hosting, set `DOCS_BASE` (for example `/ypt-js/`). The
`.github/workflows/docs.yml` workflow builds and deploys to GitHub Pages on pushes to
`main` that touch `docs/`, `package.json`, or the lockfile. Enable
**Settings → Pages → Source: GitHub Actions** once in the repository.

---

## 12. Pull request checklist

- [ ] Input validation added or updated.
- [ ] Raw response schema added or updated (lenient).
- [ ] Mapper handles missing/alternate fields.
- [ ] Tests cover request shape, mapping, and failure paths.
- [ ] No live network calls or real user data in tests/fixtures.
- [ ] `bun run format`, `bun run typecheck`, `bun run test`, `bun run build` pass.
- [ ] `bun run docs:build` passes when docs changed.
- [ ] Public types/schemas exported.
- [ ] Docs updated.

---

## Related

- [Architecture](./architecture.md)
- [Upstream API](./upstream-api.md)
- [API reference](./api-reference.md)
