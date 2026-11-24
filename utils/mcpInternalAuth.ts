import type { McpOAuthScope } from './mcpOAuth';

// Same values as MCP_SCOPE_READ and MCP_SCOPE_FULL; spelled out so verifyUser does not load the whole OAuth module
const MCP_SCOPE_READ: McpOAuthScope = 'mcp:read';
const MCP_SCOPE_FULL: McpOAuthScope = 'mcp:full';

/**
 * Server-only. The MCP route calls the app's own route handlers in process, with a Request object it builds itself.
 * It registers that object here together with the scope of the authenticated MCP caller, and verifyUser accepts the
 * object for the operations that scope allows. Requests from the network are created by the runtime, never by this
 * code, so they are never in the registry: no header, token or other input can claim a scope.
 */
const registry = new WeakMap<Request, McpOAuthScope>();

type Operation = `${'GET' | 'POST' | 'PUT' | 'DELETE'}:${string}`;

/** Read operations: available to the direct MCP_APIKEY and to the mcp:read and mcp:full scopes. */
const READ_OPERATIONS: readonly Operation[] = [
   'GET:/api/serp/keyword',
   'GET:/api/serp/keywords',
   'GET:/api/serp/domains',
   'GET:/api/google/searchconsole',
   'GET:/api/google/insight',
   'GET:/api/google/ideas',
];

/** Write operations: the documented full tools, available to the mcp:full scope only. */
const FULL_OPERATIONS: readonly Operation[] = [
   'PUT:/api/google/ideas',
   // Saves the fetched ideas over the stored list, so it is a write
   'POST:/api/google/ideas',
   'POST:/api/serp/keywords',
   'PUT:/api/serp/keywords',
   'DELETE:/api/serp/keywords',
   'POST:/api/serp/refresh',
];

/** Marks a Request built by the MCP route as made on behalf of a caller with this scope. */
export const registerInternalRequest = (req: Request, scope: McpOAuthScope): void => {
   registry.set(req, scope);
};

/** The scope a Request was registered with, or null for every request that did not come from the MCP route. */
export const getInternalRequestScope = (req: Request): McpOAuthScope | null => registry.get(req) ?? null;

/** True when the scope may run this method and path. An unknown scope may run nothing. */
export const isOperationAllowedForScope = (scope: McpOAuthScope, method: string, pathname: string): boolean => {
   const operation = `${method}:${pathname}` as Operation;
   if (READ_OPERATIONS.includes(operation)) { return scope === MCP_SCOPE_READ || scope === MCP_SCOPE_FULL; }
   if (FULL_OPERATIONS.includes(operation)) { return scope === MCP_SCOPE_FULL; }
   return false;
};
