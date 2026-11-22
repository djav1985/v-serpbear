# Frontend and Backend API Communication Plan

## Goal

Give the browser and backend one predictable communication contract across the app's REST API: one request convention, one success/error envelope, shared runtime validation and TypeScript types, and one frontend client. Make the contract change directly on the existing endpoints, with no backwards-compatibility layer.

## What the repository does today

- App Router handlers live under `app/api`. `utils/apiLogging.ts` wraps handlers with database setup, request IDs, logging, session/API-key checks, and a standard failure response.
- `utils/client/apiClient.ts` centralizes some browser requests, but callers still pass string paths and provide unchecked generic response types. One Google Ads browser flow uses `fetch` directly.
- Request validation is implemented separately in each route. Zod is already installed and used by the MCP tool definitions, but there is no shared REST contract.
- Most app successes return route-specific top-level objects; failures generally use `{ error: { code, message, details? }, requestId? }`. The request ID is also returned in `X-Request-Id`.
- `docs/API-and-MCP.md` documents the external REST API and API-key consumers, so changing those response shapes in place would break clients.
- Session cookies, the explicit `APIKEY` method/path allowlist, `MCP_APIKEY` read access, and OAuth `mcp:read`/`mcp:full` are separate authorization modes. The MCP handler currently forwards internal REST calls using `APIKEY`; the allowlist does not include several write methods used by full-scope MCP tools. The migration must fix this without expanding direct `MCP_APIKEY` or external `APIKEY` permissions.

## Contract decisions

1. **Change the existing REST contract in place.** Keep the current `/api/...` paths and update their request and response contract directly. Do not add `/api/v2`, legacy adapters, or dual response formats. This is a coordinated breaking change for external API-key clients.
2. **Use method-appropriate input consistently.** GET reads take filters and identifiers in query parameters. POST, PUT, PATCH, and DELETE take JSON bodies (use `{}` when an action has no fields). Do not send JSON bodies with GET.
3. **Use one JSON response envelope for app REST.** Success is `{ data: <route DTO>, error: null, requestId }`; failure is `{ data: null, error: { code, message, details? }, requestId }`. Keep the existing HTTP status semantics and `X-Request-Id` header. The frontend client unwraps `data` after checking the envelope.
4. **Share Zod contracts.** Define request, query, DTO, and response schemas in a client-safe `utils/api/contracts/` area. Infer TypeScript types from those schemas. Route handlers validate at runtime before business logic; browser calls use an endpoint map so a method, path, request, and response type cannot be mismatched.
5. **Keep protocol and binary routes in their required formats.** MCP remains Streamable HTTP/JSON-RPC. OAuth and the Google OAuth callback keep their protocol form/query parameters, redirects, metadata, and error formats. Logo and favicon routes continue to return image bytes. They are not ordinary app REST responses.
6. **Do not serialize database models directly.** Each response uses an explicit DTO and preserves the existing secret masking for settings, Search Console credentials, and scraper settings.

## Endpoint behavior after the cutover

All listed JSON responses use the envelope above, on the existing paths. “Session” means a valid login cookie. “API key” means only the `APIKEY` method/path allowlist. MCP permissions are specified separately below.

| Endpoint | Request contract | `data` on success | Access |
| --- | --- | --- | --- |
| `GET /api/serp/domains` | Query: optional `withstats` boolean; optional `domains` list, allowed only with `withstats=true` | `{ domains: DomainDTO[] }` | Session or current API-key GET permission |
| `POST /api/serp/domains` | JSON `{ domains: string[] }` | `{ domains: DomainDTO[] }`, HTTP 201 | Session |
| `PUT /api/serp/domains` | JSON `{ domain, ...domainSettingsPatch }` | `{ domain: DomainDTO }` | Session |
| `DELETE /api/serp/domains` | JSON `{ domain }` | `{ domainRemoved, keywordsRemoved, SCDataRemoved, cleanup }` | Session |
| `GET /api/serp/domain` | Query: required `domain` | `{ domain: DomainDTO }`; secrets remain masked | Session only (not in current API-key allowlist) |
| `GET /api/serp/keywords` | Query: required `domain` | `{ keywords: KeywordDTO[] }` | Session or current API-key GET permission |
| `POST /api/serp/keywords` | JSON `{ keywords: KeywordInput[] }` | `{ keywords: KeywordDTO[] }`, HTTP 201 | Session; MCP `mcp:full` only through scoped internal authorization |
| `PUT /api/serp/keywords` | JSON `{ ids, sticky? }`, `{ ids, location, country? }`, or `{ ids, tags }`; exactly one update operation | `{ keywords: KeywordDTO[] }` or the existing typed update summary | Session; MCP `mcp:full` only through scoped internal authorization |
| `DELETE /api/serp/keywords` | JSON `{ ids: number[] }` | `{ keywordsRemoved: number }` | Session; MCP `mcp:full` only through scoped internal authorization |
| `GET /api/serp/keyword` | Query: required positive integer `id` | `{ keyword: KeywordDTO | null }` | Session or current API-key GET permission |
| `GET /api/serp/refresh` | Query: `status=retry` and comma-separated positive `id` values | `{ keywords: { ID, updating }[] }` | Session only (not in current API-key allowlist) |
| `POST /api/serp/refresh` | JSON with exactly one mode: `{ ids }`, `{ scope: "domain", domain }`, `{ scope: "enabled-domains" }`, or `{ keyword, country, device, ...searchOptions }` | Typed refresh/search result, including accepted/skipped IDs and status | Session; MCP `mcp:full` may start refreshes; one-off search remains session-only and same-origin protected |
| `PUT /api/serp/clearfailed` | JSON `{}` | `{ cleared: true }` | Session |
| `GET /api/google/ideas` | Query: optional `domain` | `{ keywords: KeywordIdeaDTO[] }` | Session or current API-key GET permission |
| `POST /api/google/ideas` | JSON seed request: `seedType`, optional `domain`, `keywords`, `country`, `language`, and seed flags | `{ keywords: KeywordIdeaDTO[] }` | Session or current API-key POST permission; MCP read tool behavior remains as documented (may consume Google Ads quota) |
| `PUT /api/google/ideas` | JSON `{ keywordID, domain? }` | `{ keywords: KeywordIdeaDTO[] }` | Session; MCP `mcp:full` only through scoped internal authorization |
| `GET /api/google/searchconsole` | Query: required `domain` | `{ data: SearchConsoleDTO, integrationStatus }` | Session or current API-key GET permission |
| `POST /api/google/searchconsole` | JSON `{}` | `{ updatedCount, failedCount }` | Session or current API-key POST permission |
| `GET /api/google/insight` | Query: required `domain` | `{ data: InsightDTO, integrationStatus }` | Session or current API-key GET permission |
| `POST /api/google/volume` | JSON `{ keywords? , domain? , update? }`; `domain: "all"` retains its stricter rate limit | `{ keywords, volumes, failedCountries? }` | Session; API key only if explicitly authorized |
| `GET /api/app/settings` | Query: optional `includePrivate=true` | `{ settings: PublicSettingsDTO | PrivateSettingsDTO }`; private view is never returned without a session | Public safe subset; session for private settings |
| `PUT /api/app/settings` | JSON `{ settings: SettingsPatch }` | `{ settings: SettingsDTO }` | Session only |
| `POST /api/app/email` | JSON `{ type: "digest", domain? }` or `{ type: "ideas", domain, keywords }` | `{ sent, skipped, message? }` or `{ success: true }` | Digest: session or current API-key permission. Ideas email: session only |
| `POST /api/auth/login` | JSON `{ username, password }` | `{ success: true }`; set the session cookie as today | Public; retain bounded body and throttling |
| `POST /api/auth/logout` | JSON `{}` | `{ success: true }`; clear cookie and revoke sessions | Session only |
| `GET /api/adwords` | No callback code: starts Google authorization and returns `{ authUrl }` in the common envelope | `{ authUrl }` | Session only |
| `POST /api/adwords` | JSON `{ developer_token, account_id }` | `{ valid: true }` | Session only |

### Required protocol and asset endpoints

These keep their standards-required or non-JSON formats and are explicitly outside the common REST envelope:

| Endpoint | Behavior retained |
| --- | --- |
| `GET /api/adwords?code=…&state=…` | Google OAuth callback; validate state, exchange code, persist credentials, then return the existing redirect/HTML response. The callback URL remains stable for Google configuration. |
| `POST /api/mcp` | Streamable HTTP MCP JSON-RPC requests and MCP protocol responses. Direct `MCP_APIKEY` and OAuth tokens remain distinct from `APIKEY`. Other HTTP methods continue to follow the MCP transport's supported-method behavior. |
| `GET /api/oauth/authorize` | OAuth authorization request query parameters and browser redirect/HTML behavior. |
| `POST /api/oauth/authorize` | OAuth approval form submission, single-use consent, and redirect behavior. |
| `POST /api/oauth/register` | OAuth dynamic client registration JSON request and OAuth registration response. |
| `POST /api/oauth/token` | OAuth token form request and OAuth token response. |
| `POST /api/oauth/revoke` | OAuth revocation form request and RFC-compatible empty success response. |
| `GET /.well-known/oauth-authorization-server` and `/api/mcp` variant | OAuth authorization-server metadata JSON. |
| `GET /.well-known/oauth-protected-resource` and `/api/mcp` variant | OAuth protected-resource metadata JSON. |
| `GET /api/oauth/approve` | Server-rendered approval page; query parameters identify the pending request and display an error state. |
| `GET /api/images/logo.png`, `/api/images/favicon.png` | Public image bytes and image content type. |

## MCP communication

MCP has two separate communication hops; update the internal hop to use the app API contract without changing the MCP protocol exposed to clients.

1. **MCP client to `/api/mcp`:** keep Streamable HTTP with JSON-RPC requests and MCP tool results. MCP clients do not receive the app REST envelope directly.
2. **MCP tool to app endpoint:** update `makeApiCall` in `app/api/mcp/route.ts` to call the existing REST paths using the same rules as the browser: query parameters for GET, JSON bodies for writes, and the common success/error envelope. It should unwrap `data` for successful tool results and map `{ code, message, details }` to an MCP tool error result instead of returning the raw REST envelope or legacy response body.
3. **Share tool input definitions:** derive or compose each MCP tool's Zod input schema from the matching shared endpoint contract. Keep MCP tool names, descriptions, and read/full tool availability, while preventing their input validation from drifting from the REST route validation.
4. **Carry MCP authorization internally:** pass a server-only scoped identity from the authenticated MCP request to its internal REST call. `mcp:read` can invoke only read operations; `mcp:full` can invoke its documented write operations. Do not forward the general `APIKEY` as the MCP identity, and do not accept a caller-supplied header as proof of an internal scope.
5. **Preserve MCP semantics:** keep tool outputs as useful resource data, not `{ data, error, requestId }`; keep protocol errors and transport headers in the MCP/JSON-RPC layer. Keep direct `MCP_APIKEY` read-only and OAuth's full/read scopes intact.

## Authorization requirements

- Maintain the current browser session access for app operations and keep login/logout behavior secure.
- Keep the external `APIKEY` permission list explicit by HTTP method and path. Do not silently grant it every write operation.
- Direct `MCP_APIKEY` and OAuth `mcp:read` must expose read tools only. OAuth `mcp:full` may call the documented full tools: favorite idea, add/update/delete keywords, and ranking refresh.
- Replace MCP's use of the general `APIKEY` for internal calls with the internal, scoped authorization path above. The internal context must not be forgeable by public callers and must carry the OAuth scope through to each route. This resolves the current mismatch where full-scope MCP tools call write methods absent from the general API-key allowlist, without broadening direct bearer-key access.
- Check method/path/scope decisions before business logic. Test direct key, session, API key, OAuth read, and OAuth full separately.

## Implementation sequence

1. **Freeze the breaking contract and permission matrix.** Confirm the common envelope, methods, query/body convention, and method/path/actor access matrix. The old request/response contract will not be supported; API-key scripts and other external clients must migrate with the release.
2. **Add shared contracts and typed client mapping.** Add Zod request/query/DTO schemas and an endpoint map for the existing paths. Add the common envelope parser and named client operations. The client must reject invalid response envelopes rather than trust `apiFetch<T>` casts.
3. **Update every existing route in place.** Validate each request with the shared schema, map outputs to DTOs, and return the common envelope for ordinary JSON REST responses. Preserve the protocol and binary exceptions listed above. Do not add duplicate v2 handlers or legacy response adapters.
4. **Migrate all first-party callers and MCP REST calls in the same change.** Replace browser string-path calls (including the direct Google Ads fetch) with typed endpoint methods. Update MCP's internal REST adapter and tool input schemas to the shared contract, while keeping its external protocol unchanged. Update documented external API examples to the new contract; external clients must be updated by their owners.
5. **Prove the cutover and update documentation.** Extend existing API/client/MCP test suites for every endpoint row, malformed inputs, stable response envelopes, and each auth mode. Update `docs/API-and-MCP.md` to describe the new breaking contract and migration examples; remove descriptions of the old contract. Run typecheck, ESLint, CSS lint, the full Jest suite, and production build before considering the migration complete.

## Test coverage to extend

- Route tests: `__tests__/api/serp/{domains-routes,domain-settings,keywords-read,keywords-mutations}.test.ts`, `__tests__/refresh/refresh-route.test.ts`, `__tests__/api/google/{ideas-routes,search-console-routes,volume-route,adwords-routes}.test.ts`, `__tests__/api/settings.test.ts`, `__tests__/api/login.test.ts`, and the email route suites.
- Shared client: `__tests__/utils/client/api-client.test.ts` for query encoding, JSON bodies, envelope decoding, non-JSON/empty responses, request IDs, and typed error propagation.
- MCP/OAuth: `__tests__/api/mcp.test.ts`, `__tests__/api/oauth-routes.test.ts`, and `__tests__/api/oauth-discovery.test.ts` for read-only direct keys, read/full OAuth scopes, forbidden writes, and the full-scope internal route authorization.
- Cross-route contract test: assert every app JSON handler returns the success/failure envelope and that unsupported methods return the standard `405` error with `Allow`.

## Release note

This changes request/response shapes on existing documented REST endpoints. Ship it as an explicitly breaking API change and include migration examples in `docs/API-and-MCP.md`. No compatibility routes, dual-format responses, or automatic request translation are part of this plan.
