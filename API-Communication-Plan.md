# Frontend and Backend API Communication Plan

## Goal

Give the browser and backend one predictable communication contract across the app's REST API: one request convention, one success/error envelope, shared runtime validation and TypeScript types, and one frontend client. Make the contract change directly on the existing endpoints, with no backwards-compatibility layer.

Before that, fix the security and authorization problems found while auditing the API. They do not depend on the new contract, so they ship first (Phase 1) instead of waiting for the full migration (Phase 2).

## Phases and branches

- **Phase 1: security and authorization fixes.** Ordinary pull requests to `main`, releasable on their own. Covers: MCP scoped authorization (so full-scope write tools work without widening `APIKEY`), fail-closed scope defaults, settings secret masking with the `includePrivate` change, and the docs fix for the `APIKEY` allowlist. Responses keep today's shapes. See [Phase 1](#phase-1-security-and-authorization-fixes).
- **Phase 2: contract migration.** A breaking API change. Work happens on one long-lived integration branch; each route group lands there as its own pull request, and the branch merges to `main` only when every group, caller, test and doc is migrated, so `main` never holds a half-migrated API. See [Phase 2](#phase-2-contract-migration).
- **Release: 6.5.0.** Both phases ship in version `6.5.0`. Phase 1 pull requests may merge to `main` earlier; until `6.5.0` is cut, every change from either phase is recorded in `CHANGELOG.md` under `[Unreleased]`. When the integration branch has merged, bump `package.json` (and `package-lock.json`) to `6.5.0` and move the `[Unreleased]` entries under a `[6.5.0]` heading with the release date.

Before writing route code in either phase, read the relevant guide in `node_modules/next/dist/docs/`, as `AGENTS.md` requires for this Next.js version.

## What the repository does today

- App Router handlers live under `app/api`. `createRoute` in `utils/apiLogging.ts` wraps every route handler with database setup, request IDs, logging, session/API-key checks, the standard failure response and `405` handling.
- App REST routes build responses with `json`/`fail` in `utils/api/http.ts`; `utils/api/response.ts` builds the current failure envelope `{ error: { code, message, details? }, requestId? }`. MCP and the OAuth routes call `Response.json` directly, the Google Ads callback builds an HTML `Response`, and the image routes use `serveBrandImage`. The request ID is also returned in `X-Request-Id`.
- Most app successes return route-specific top-level objects. Several routes return HTTP 200 with an `error` string (Search Console and insight "not integrated", ideas PUT, refresh with no enabled domains), and refresh returns an ambiguous `200 { keywords: [] }` when no keyword is eligible.
- Request validation is implemented separately in each route. Zod is already installed and used by the MCP tool definitions, but there is no shared REST contract.
- `utils/client/apiClient.ts` centralizes most browser requests, but callers pass string paths and unchecked generic response types. Browser call sites are in the `*-queries.ts` files, `login-form.tsx`, `add-domain-dialog.tsx`, `domains-view.tsx`, `top-bar.tsx` and `integrations-tab.tsx` (which calls `fetch('/api/adwords')` directly); count them before sizing the migration. The client imports `NextRouter` from `next/router` (a Pages Router type) for its 401 redirect.
- Server-rendered dashboard pages do not call the REST API for their first load. They read data directly: `app/(dashboard)/layout.tsx` uses `loadDomains` and the domain pages use `loadDomainBySlug` from `utils/domainsList.ts`; `GET /api/serp/keywords` and the tracker page use `loadDomainKeywords` from `utils/keywordsList.ts`; pages read `getAppSettings()` and pass only derived values (such as `searchConsoleConnected` and `adwordsConnected`) to client components. The domain and keyword helpers return "the same shape the `GET` route returns".
- `cron.js` is a first-party, non-browser caller. It sends `APIKEY` POSTs to `/api/serp/refresh`, `/api/app/email` and `/api/google/searchconsole` (the last with no body or `Content-Type`) and logs the parsed response. The Dockerfile healthcheck does an unauthenticated `GET /api/app/settings` and only needs a 200.
- Authorization modes are separate: session cookies, the explicit `APIKEY` method/path allowlist in `utils/verifyUser.ts`, direct `MCP_APIKEY` (read-only MCP tools), and OAuth `mcp:read`/`mcp:full`. The MCP handler forwards its internal REST calls with `APIKEY`, but the allowlist has no `POST`/`PUT`/`DELETE /api/serp/keywords` or `PUT /api/google/ideas`, so the full-scope write tools are rejected with "This Route cannot be accessed with API." (read from `verifyUser.ts`; `auth.test.ts` proves the rejection for another non-allowlisted route, `PUT /api/app/settings`; `mcp.test.ts` mocks both `fetch` and `verifyUser`, so nothing tests it end to end).
- Two scope defaults fail open: an OAuth credential with no recorded scope gets full access in `app/api/mcp/route.ts`, and the refresh-token exchange in `app/api/oauth/token/route.ts` uses `stored.scope ?? MCP_SCOPE_FULL`.
- App settings secrets are not masked: `getAppSettings()` decrypts every secret, a session `GET /api/app/settings` returns them in plaintext (even without `includePrivate`), and `PUT` echoes the submitted (normalized) values back. Domain Search Console credentials and domain scraper settings are masked.
- `docs/API-and-MCP.md` and `README.md` document the external REST API. Both list routes as API-key accessible that the allowlist does not allow (`PUT`/`DELETE` keywords, `PUT`/`DELETE` domains, `PUT` ideas, `PUT` clearfailed, `GET` refresh `status=retry`) and say full-scope MCP tools work through `APIKEY`.

## Settled decisions

These were decided before implementation. The phase sections apply them.

1. **Settings secrets are masked.** `GET` and `PUT /api/app/settings` never return a decrypted secret. Every field in `SECRET_SETTINGS_FIELDS` that has a stored value is returned as the marker `'true'`, and an unset one as `''`. This is the marker the domain Search Console credentials already use (`SC_CREDENTIAL_MARKER = 'true'`, defined locally in `app/api/serp/domains/route.ts`); move it to one shared constant and use it for both (in Phase 1 a shared server/client-safe module; in Phase 2 it lives in `utils/api/contracts/`). On `PUT`, a secret field that is omitted or equal to the marker keeps its stored value, a new value replaces it, and `''` clears it. Server code keeps reading decrypted values through `getAppSettings()`; masking happens only in the settings response. The settings form stops round-tripping secrets and sends only changed ones.
2. **`includePrivate=true` is the only way to get the private view.** Without it, every caller (signed in or not) gets the public subset. With it, a session is required (401 otherwise). First-party callers that call `GET /api/app/settings` without `includePrivate` and read private fields are found and changed to pass it. The unauthenticated public subset keeps returning 200 for the Docker healthcheck and the login page.
3. **The code's `APIKEY` allowlist is the source of truth.** Fix `docs/API-and-MCP.md` and `README.md` to match it: remove the routes listed above and the statement that full-scope MCP tools work through `APIKEY`. The allowlist is not widened.
4. **Refresh "nothing eligible"** (`ids`/`domain` modes) returns the normal start shape with zero keywords: `{ message, keywordCount: 0, skipped, reason: 'no-eligible-keywords' }`, replacing `200 { keywords: [] }`.
5. **Refresh "no domains enabled"** returns `{ started: false, reason: 'no-enabled-domains' }` with HTTP 200 and `error: null`, not a 4xx: it is a normal state for a scheduled run.
6. **MCP "not integrated"** is a normal, non-error tool result: `get_searchconsole` returns `{ integrationStatus: 'not-integrated', searchConsole: null }` and `get_insight` returns `{ integrationStatus: 'not-integrated', insight: null }`.
7. **Ideas `updated` is kept** in the `GET /api/google/ideas` DTO for API consumers.
8. **`cron.js` sends `{}`** to `POST /api/google/searchconsole`, so write routes keep requiring a JSON body.

## Phase 1: security and authorization fixes

Each item keeps today's response shapes and can ship as its own pull request.

1. **MCP scoped authorization.** Replace MCP's use of `APIKEY` for internal calls with a server-only scoped identity passed from the authenticated MCP request to its internal REST call. `mcp:read` and direct `MCP_APIKEY` can invoke only read operations (classify `POST /api/google/ideas`, used by the read tool `generate_keyword_ideas`, as read); `mcp:full` can invoke the documented full tools: favorite idea, add/update/delete keywords, and ranking refresh. The internal identity must not be forgeable by public callers: never accept a caller-supplied header as proof of scope. Check method/path/scope before business logic. The external `APIKEY` allowlist is not widened.
2. **Fail closed on scope.** Change both defaults (`app/api/mcp/route.ts` and `app/api/oauth/token/route.ts`) so a missing or unknown scope means no access, not full.
3. **Settings masking and `includePrivate`** (Settled decisions 1 and 2), including the settings form's save flow and any first-party caller that needs `includePrivate=true`.
4. **Docs fix for the allowlist** (Settled decision 3) in `docs/API-and-MCP.md` and `README.md`, plus `docs/Security.md` for the settings change.

Tests for Phase 1:

- An end-to-end MCP test that runs the real `verifyUser` (not mocked) and shows each full-scope write tool is authorized and each read-scope or direct-key call to a write operation is refused.
- Separate tests for direct key, session, `APIKEY`, OAuth read and OAuth full; a credential with no scope gets no access, including after a refresh-token exchange (`__tests__/api/mcp.test.ts`, `__tests__/api/oauth-routes.test.ts`, `__tests__/utils/auth.test.ts`).
- Settings: no decrypted secret in any `GET`/`PUT` response; marker and omitted secrets keep the stored value; `''` clears; the public view without `includePrivate` even with a session; 401 for `includePrivate=true` without one (`__tests__/api/settings.test.ts`, `__tests__/frontend/settingsQueries.test.tsx`).
- `CHANGELOG.md` entry under `[Unreleased]`.

## Phase 2: contract migration

### Contract decisions

1. **Change the existing REST contract in place.** Keep the current `/api/...` paths and update their request and response contract directly. Do not add `/api/v2`, legacy adapters, or dual response formats. This is a coordinated breaking change for external API-key clients.
2. **Use method-appropriate input consistently.** GET reads take filters and identifiers in query parameters. POST, PUT and DELETE take JSON bodies (use `{}` when an action has no fields). Do not send JSON bodies with GET.
3. **Use one JSON response envelope for app REST.** Success is `{ data: <route DTO>, error: null, requestId }`; failure is `{ data: null, error: { code, message, details? }, requestId }`. Keep the existing HTTP status semantics and `X-Request-Id` header. The frontend client unwraps `data` after checking the envelope.
4. **Share Zod contracts.** Define request, query, DTO and response schemas in a client-safe `utils/api/contracts/` area. Infer TypeScript types from those schemas. Route handlers validate at runtime before business logic; browser calls use an endpoint map so a method, path, request and response type cannot be mismatched.
5. **One DTO mapper per resource, shared by routes and server-rendered pages.** The domain, keyword and settings DTO mappers live next to the contracts and are used both by the REST routes and by `utils/domainsList.ts` and `utils/keywordsList.ts`, so the data a page renders on first load and the data the REST API returns cannot drift apart.
6. **Do not serialize database models directly.** Each response uses an explicit DTO and keeps the masking of domain Search Console credentials, domain scraper settings and (from Phase 1) app settings secrets.
7. **Emit the envelope in one place.** Change `json()` and `fail()` in `utils/api/http.ts` (and `errorResponse` in `utils/api/response.ts`) to produce the envelope, so no route builds one by hand. Protocol and binary routes use a separate raw helper and never the enveloping one.
8. **No 200 with an error string.** A successful status never carries an `error` string. The Search Console and insight GETs, the ideas PUT and the two refresh cases each become a typed `data` state (with `error: null`) or a proper 4xx/5xx, as listed in the endpoint table, and the cross-route test enforces it.
9. **No `PATCH` on app REST routes.** No app REST route defines a `PATCH` handler, so it stays unsupported there (standard `405` with `Allow`) unless a later change adds one. The MCP route and the OAuth routes register `PATCH` handlers today and keep their own method behavior.
10. **Keep protocol and binary routes in their required formats.** See [Protocol and binary routes](#protocol-and-binary-routes).
11. **Keep throttles and limits.** The bad-API-key lockout (`isLoginLocked`/`apiKeyThrottle`), login throttling, the per-domain and stricter `domain: "all"` limits on `/api/google/volume`, the keyword-search rate limit on refresh, and the ideas-email rate limit are unchanged.

### Endpoint contract

All responses below use the envelope, on the existing paths. "Session" means a valid login cookie. "API key" means only the `APIKEY` method/path allowlist. MCP access is described under [MCP communication](#mcp-communication). What changes from today is listed per endpoint under [Migration notes](#migration-notes).

| Endpoint | Request | `data` on success | Access |
| --- | --- | --- | --- |
| `GET /api/serp/domains` | Query: optional `withstats` boolean; optional `domains` list (1–8 valid hostnames, comma-separated or repeated), only with `withstats=true` | `{ domains: DomainDTO[] }` | Session or API key |
| `POST /api/serp/domains` | `{ domains: string[] }` | `{ domains: DomainDTO[] }`, HTTP 201 | Session |
| `PUT /api/serp/domains` | `{ domain, ...domainSettingsPatch }` | `{ domain: DomainDTO }` | Session |
| `DELETE /api/serp/domains` | `{ domain }` | `{ domainRemoved, keywordsRemoved, SCDataRemoved, cleanup: { complete, failed, retryPending } }` | Session |
| `GET /api/serp/domain` | Query: required `domain` | `{ domain: DomainDTO }` (secrets masked) | Session |
| `GET /api/serp/keywords` | Query: required `domain` | `{ keywords: KeywordDTO[] }` | Session or API key |
| `POST /api/serp/keywords` | `{ keywords: KeywordInput[] }` (1–100) | `{ keywords: KeywordDTO[] }`, HTTP 201 | Session; MCP `mcp:full` |
| `PUT /api/serp/keywords` | Exactly one of `{ ids, sticky }`, `{ ids, location, country? }`, `{ ids, tags }` (tag keys must match `ids`) | `{ keywords: KeywordDTO[] }` for sticky and tags; `{ keywords, updatedCount, skipped }` for location | Session; MCP `mcp:full` |
| `DELETE /api/serp/keywords` | `{ ids: number[] }` | `{ keywordsRemoved: number }` | Session; MCP `mcp:full` |
| `GET /api/serp/keyword` | Query: required positive integer `id` | `{ keyword: KeywordDTO \| null }` | Session or API key |
| `GET /api/serp/refresh` | Query: `status=retry` and comma-separated positive `id` values | `{ keywords: { ID, updating }[] }` | Session |
| `POST /api/serp/refresh` | Exactly one of `{ ids }`, `{ scope: "domain", domain }`, `{ scope: "enabled-domains" }`, `{ keyword, country, device }` | Per mode, see below | Session or API key; MCP `mcp:full` (not one-off search); one-off search is session-only |
| `PUT /api/serp/clearfailed` | `{}` | `{ cleared: true }` | Session |
| `GET /api/google/ideas` | Query: optional `domain` | `{ ideas: { keywords: KeywordIdeaDTO[], favorites: KeywordIdeaDTO[], settings: IdeaSettingsDTO, updated: number } }` | Session or API key |
| `POST /api/google/ideas` | `{ seedType, domain?, keywords?, country?, language?, seedSCKeywords?, seedCurrentKeywords? }` | `{ keywords: KeywordIdeaDTO[] }` | Session or API key; MCP read (may consume Google Ads quota) |
| `PUT /api/google/ideas` | `{ keywordID, domain? }` | `{ favorites: KeywordIdeaDTO[] }` (the full list after the toggle) | Session; MCP `mcp:full` |
| `GET /api/google/searchconsole` | Query: required `domain` | `{ searchConsole: SearchConsoleDTO \| null, integrationStatus: "integrated" \| "not-integrated" }` | Session or API key |
| `POST /api/google/searchconsole` | `{}` | `{ updatedCount, failedCount }` | Session or API key |
| `GET /api/google/insight` | Query: required `domain` | `{ insight: InsightDTO \| null, integrationStatus: "integrated" \| "not-integrated" }` | Session or API key |
| `POST /api/google/volume` | `{ keywords?, domain?, update? }` | `{ keywords, volumes, failedCountries? }` | Session |
| `GET /api/app/settings` | Query: optional `includePrivate=true` | `{ settings: PublicSettingsDTO }`, or `{ settings: PrivateSettingsDTO }` (secrets masked) with `includePrivate=true` | Public; session for `includePrivate=true` |
| `PUT /api/app/settings` | `{ settings: SettingsPatch }` | `{ settings: PrivateSettingsDTO }` (secrets masked) | Session |
| `POST /api/app/email` | `{ type: "digest", domain? }` or `{ type: "ideas", domain, keywords }` | Digest: `{ sent, skipped, message? }`; ideas: `{ success: true }` | Digest: session or API key; ideas: session |
| `POST /api/auth/login` | `{ username, password }` | `{ success: true }` and the session cookie | Public, bounded body, throttled |
| `POST /api/auth/logout` | `{}` | `{ success: true }`; clears the cookie and revokes sessions | Session |
| `GET /api/adwords` (no `code`) | None | `{ authUrl }` | Session |
| `POST /api/adwords` | `{ developer_token, account_id }` | `{ valid: true }` | Session |

`POST /api/serp/refresh` results per mode:

| Mode | `data` on success | Failures |
| --- | --- | --- |
| `ids`, `domain` | `{ message: 'Refresh started', keywordCount, skipped: { domains, keywordIds } }`; nothing eligible: same shape with `keywordCount: 0` and `reason: 'no-eligible-keywords'` | 400 no scraper or invalid input; 404 no matching keywords; 409 everything already refreshing or locked |
| `enabled-domains` | `{ started: true }`, `{ started, skipped: { domains } }`, or `{ started: false, reason: 'no-enabled-domains' }` | 400 no scraper or combined with other filters |
| one-off search | `{ searchResult: { results, keyword, position, country, device } }` | 403 without a session; 429 rate limit; 400 no scraper or bad input; 502 scrape failed |

A refresh request without a Bearer key that is not same-origin gets 403.

### Migration notes

What each endpoint changes from today. Endpoints not listed only gain the envelope.

- **`DELETE /api/serp/domains`:** the 404 path builds the failure envelope by hand with `errorResponse` and returns it through `json(body, status)`; change it to `fail()`.
- **`PUT /api/serp/keywords`:** today the route applies the first of `sticky`, `tags`, `location` and silently ignores the others, and for `tags` it uses the object keys as the IDs (`ids` only has to be present). Requiring exactly one operation, and tag keys that match `ids`, are deliberate tightenings. The first-party client already sends `ids` equal to the tag keys.
- **`POST /api/serp/refresh`:** `200 { keywords: [] }` (nothing eligible) and `200 { started: false, error }` (no domains enabled) become the typed results above (Settled decisions 4 and 5).
- **`GET /api/google/ideas`:** today `{ data: KeywordIdeasDatabase }` (`utils/adwords.ts:56`); the wrapper field is renamed to `ideas`. The Ideas page reads `keywords`, `favorites` and `settings`; `updated` is kept for API consumers (Settled decision 7).
- **`PUT /api/google/ideas`:** today `{ keywords, error: '' }`; `keywords` is renamed to `favorites` and `error` is dropped.
- **`GET /api/google/searchconsole` and `GET /api/google/insight`:** today `{ data }`, or `200 { data: null, error: 'Google Search Console is not Integrated.' }`. The inner field is renamed (`searchConsole`, `insight`) to avoid `data.data`, and `integrationStatus` is new. First-party pages never read the `error` string: `sc-queries.ts` and `insight-queries.ts` return only `.data`, the pages run the query only when the server-computed `searchConsoleConnected` is true, and a `null` result shows "Could not fetch keyword data…" (console) or "No data yet." (insight). So `integrationStatus` matters to external API clients and MCP (Settled decision 6).
- **`POST /api/google/searchconsole`:** today `{ status: 'completed' }` with the counts only logged; it returns the counts. Keep the 502 when every domain fails. `cron.js` sends `{}` (Settled decision 8).
- **`GET`/`PUT /api/app/settings`:** masking and `includePrivate` are already done in Phase 1; Phase 2 only applies the envelope and the shared settings DTO.
- **`POST /api/app/email`:** `type` and the digest `domain` are read from the JSON body only. Remove the query-string fallbacks (`email/route.ts` reads `type` from the query, `emailDigest.ts` reads `domain` from the query) and the "infer `ideas` from a `keywords` array" fallback. Drop `success`/`error` from the digest response and `error` from the ideas response (today `{ success: true, error: null }`).

### Protocol and binary routes

These keep their standards-required or non-JSON formats and are outside the envelope:

| Endpoint | Behavior retained |
| --- | --- |
| `GET /api/adwords?code=…&state=…` | Google OAuth callback: validate state, exchange code, persist credentials, return the existing redirect/HTML page. The callback URL stays stable for Google configuration. |
| `POST /api/mcp` | Streamable HTTP MCP JSON-RPC requests and MCP protocol responses. Direct `MCP_APIKEY` and OAuth tokens stay distinct from `APIKEY`. Other HTTP methods keep the transport's supported-method behavior. |
| `GET /api/oauth/authorize` | Authorization request query parameters; `303` redirects, errors sent through the client's redirect URI, an HTML error page for an unknown client or a redirect mismatch, and a JSON `503` when `NEXT_PUBLIC_APP_URL` is unset. |
| `POST /api/oauth/authorize` | Approval form submission, single-use consent, and redirect behavior. |
| `POST /api/oauth/register` | Dynamic client registration JSON request and OAuth registration response. |
| `POST /api/oauth/token` | Token request (form or JSON, read by `readOAuthFormOrJson`) and OAuth token response. |
| `POST /api/oauth/revoke` | Revocation request (form or JSON) and RFC 7009 empty success response. |
| `GET /.well-known/oauth-authorization-server` and its `/api/mcp` variant | Authorization-server metadata JSON. |
| `GET /.well-known/oauth-protected-resource` and its `/api/mcp` variant | Protected-resource metadata JSON. |
| `/api/oauth/approve` (`app/api/oauth/approve/page.tsx`) | A server-rendered page, not a route handler. Query parameters identify the pending request and display an error state. |
| `GET /api/images/logo.png`, `/api/images/favicon.png` | `200 image/png` with cache headers; a plain-text `404` if no file exists, not even the bundled default. Other methods get the standard `405` envelope. |

### MCP communication

MCP has two hops. Phase 2 changes only the internal one; the protocol exposed to MCP clients does not change.

1. **MCP client to `/api/mcp`:** keep Streamable HTTP with JSON-RPC requests and MCP tool results. MCP clients never receive the REST envelope.
2. **MCP tool to app endpoint:** `makeApiCall` in `app/api/mcp/route.ts` calls the existing REST paths with the same rules as the browser (query parameters for GET, JSON bodies for writes) and the scoped identity from Phase 1. It unwraps `data` for successful tool results and maps `{ code, message, details }` to an MCP tool error result instead of returning the raw envelope. "Not integrated" is a normal tool result (Settled decision 6).
3. **Shared tool input definitions:** derive each MCP tool's Zod input schema from the matching shared endpoint contract. Keep tool names, descriptions and read/full availability. Some tool inputs differ from the REST types today (`get_keyword` `id` and `favorite_keyword_idea` `keywordID` are strings), so the shared schemas need an explicit coercion rule for tool input versus REST query/body values.
4. **Keep MCP semantics:** tool outputs are useful resource data, not `{ data, error, requestId }`; protocol errors and transport headers stay in the MCP/JSON-RPC layer. Direct `MCP_APIKEY` stays read-only and the OAuth read/full scopes stay as Phase 1 left them.

### Implementation sequence

1. **Freeze the contract and permission matrix.** Confirm the endpoint table, the refresh results, the protocol exceptions and the method/path/actor access matrix. The old contract will not be supported; API-key scripts and other external clients migrate with the release.
2. **Add the cross-route envelope test, the shared contracts and the typed client.** Write the test first (it will fail on the 200-with-error routes and guide step 3). Add Zod request/query/DTO schemas, the shared DTO mappers and an endpoint map for the existing paths. Make `json()`/`fail()` emit the envelope. Add the envelope parser and named client operations; the client rejects invalid envelopes instead of trusting `apiFetch<T>` casts. Replace the `next/router` 401 redirect with a callback or `next/navigation`.
3. **Migrate one route group at a time** on the integration branch: serp domains, keywords and refresh, google, then app and auth. For each group, in the same pull request: validate requests with the shared schema, map outputs through the shared DTO mappers (including `utils/domainsList.ts` and `utils/keywordsList.ts` where they apply), return the envelope, and move that group's browser callers to the typed endpoint methods (including the direct Google Ads `fetch`). Preserve the protocol and binary exceptions. Do not add v2 handlers or legacy response adapters.
4. **Migrate the other callers:** MCP's internal adapter and tool input schemas, `cron.js` (request bodies and response logging), and re-check the Dockerfile healthcheck.
5. **Prove the cutover and update the documentation.** Extend the test suites listed below. Rewrite `docs/API-and-MCP.md` and the API section of `README.md` for the new contract with migration examples, and remove descriptions of the old contract. Add the `CHANGELOG.md` entry under `[Unreleased]`. Run typecheck, ESLint, CSS lint, the full Jest suite and the production build before merging the integration branch to `main`. Then cut `6.5.0` as described under [Phases and branches](#phases-and-branches).

### Test coverage to extend

- **Route tests:** `__tests__/api/serp/{domains-routes,domain-settings,keywords-read,keywords-mutations}.test.ts`, `__tests__/refresh/refresh-route.test.ts`, `__tests__/api/google/{ideas-routes,search-console-routes,volume-route,adwords-routes}.test.ts`, `__tests__/api/settings.test.ts`, `__tests__/api/login.test.ts`, and the email suites in `__tests__/email/` (`email-routing`, `email-digest`, `email-ideas`). Logout, clearfailed, keyword, insight and domain GET have no dedicated test file; check what the existing suites cover and add tests where the cross-route test is not enough.
- **Test helpers:** `__tests__/__helpers__/apiLoggingMock.ts` reimplements `createRoute` (using the real `fail`/`json`), and `__tests__/__helpers__/routeAdapter.ts` hand-builds its own 405 body. Update both for the envelope, and expect nearly every route test that asserts a response body (`res.json`) to change shape.
- **Frontend component tests** that mock `utils/client/apiClient` by URL string: `domainSettingsDialog.test.tsx` (`apiGet('/api/serp/domain?domain=example.com')`), `addToTracker.test.tsx` (`apiFetch('/api/serp/keywords', { method: 'DELETE', body })` and `apiGet` URLs) and `settingsQueries.test.tsx` (`apiPut('/api/app/settings', { settings })`). Update them with their route group, or keep the old function names as thin wrappers until the group migrates. `oauthApproval.test.tsx` and `ideasTable.test.tsx` are unaffected.
- **Shared client:** `__tests__/utils/client/api-client.test.ts`. Its success mocks return unwrapped bodies such as `{ domains: [] }`, and the test "legacy string error on old-format responses" contradicts the no-legacy rule: remove it, and remove the string-error branch of `extractMessage` in `apiClient.ts`. Cover query encoding, JSON bodies, envelope decoding, non-JSON and empty responses, request IDs and typed error propagation.
- **Server-rendered parity:** a test that the domain and keyword shapes from `utils/domainsList.ts` and `utils/keywordsList.ts` match the REST DTOs.
- **MCP:** `__tests__/api/mcp.test.ts` for envelope unwrapping, error mapping, the not-integrated tool result and schema coercion.
- **`cron.js`:** `__tests__/utils/cron-worker.test.ts` for the `{}` body and envelope-aware logging.
- **Cross-route contract test:** every app JSON handler returns the success/failure envelope, no 2xx carries an `error` string, and unsupported methods return the standard `405` with `Allow`. The test authenticates (protected routes return 401 before 405) and skips the protocol routes, whose 405s are not the standard envelope (MCP and OAuth).

## Release note

Phase 1 fixes security and authorization without changing response shapes, apart from settings secrets now being masked and the private settings view requiring `includePrivate=true`.

Phase 2 changes request and response shapes on existing documented REST endpoints. Ship it in `6.5.0`, marked in `CHANGELOG.md` and `docs/API-and-MCP.md` as a breaking API change for external API-key clients, with migration examples in `docs/API-and-MCP.md`. No compatibility routes, dual-format responses, or automatic request translation are part of this plan.
