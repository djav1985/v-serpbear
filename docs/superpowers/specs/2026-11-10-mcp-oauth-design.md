# SerpBear MCP OAuth Design

## Intent

Let ChatGPT connect to the existing single-account, read-only MCP server using OAuth, while also allowing a direct bearer connection with the new `MCP_API_KEY` environment variable. The OAuth approval page should use SerpBear's existing colors and background in a compact layout similar to the login page.

## Goals

- Put OAuth API endpoints under `/api/oauth` and publish the well-known metadata MCP clients need to discover them.
- Use `MCP_API_KEY` only for direct `/api/mcp` bearer authentication. OAuth approval uses the app's normal login session.
- Keep the current tools, account scope, and read-only behavior unchanged. Internal calls from MCP to SerpBear's existing API routes continue to use the server-side `APIKEY`; it is never exposed to the MCP client.
- Store OAuth client metadata and only hashes of authorization codes and OAuth tokens in `data/mcp_oauth.json`, adjacent to the database.
- Document environment configuration and ChatGPT connection steps.

## Non-goals

- Multiple SerpBear user accounts, per-user data isolation, Google sign-in, OAuth revocation endpoint, or write-capable MCP tools.
- Removing `APIKEY` from SerpBear's existing REST API or internal MCP-to-REST calls.

## Approaches

- **Single static key only:** expose `MCP_API_KEY` as the direct bearer credential. This cannot drive ChatGPT's OAuth connector flow.
- **OAuth in front of the existing account (selected):** keep optional direct key access and add an OAuth authorization server that uses the normal SerpBear login session, then issues per-client access and refresh tokens. This fits the single-account app and supports both client types.
- **External identity provider:** delegate authorization and token issuance to a hosted identity service. This adds deployment and account setup without a need for multiple users.

## Design

OAuth registration, authorization, and token endpoints live under `/api/oauth`. Standard well-known routes publish protected-resource and authorization-server metadata; `/api/mcp` advertises the resource metadata URL in its `401` challenge. Use authorization code with PKCE S256, exact registered redirect URI matching, one-time codes, short-lived access tokens, and rotating refresh tokens. Persist client metadata and hashed credentials in `data/mcp_oauth.json`. The approval screen requires the normal SerpBear login session, names the requesting client, and offers approve/cancel.

Direct MCP requests accept only `MCP_API_KEY` or a valid OAuth access token; they do not fall back to `APIKEY`. MCP's internal calls to the existing REST routes continue to use `APIKEY` server-side.

## Constraints and calls

- Follow existing Next.js App Router, `createRoute`, atomic JSON/file-lock, shared `Brand`, `Card`, `Input`, and `Button` patterns.
- Use the public app URL setting for OAuth issuer and resource URLs; do not trust an incoming `Host` header to construct callbacks.
- Keep secrets out of URLs and logs. OAuth approval uses the existing app login session; no MCP key is entered on the approval page.
- Add `MCP_API_KEY` to `.env.example`, Docker Compose configuration, the changelog, and `docs/API-and-MCP.md`.
