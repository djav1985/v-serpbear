/**
 * The REST contract shared by the browser and the server: one entry per app endpoint with its method, path, query,
 * JSON body and response `data`. Client-safe: it imports only zod and the global types. The typed client
 * (utils/client/apiClient.ts) is built on this map, so a method, path, request and response cannot be mismatched.
 * Protocol and binary routes (OAuth, MCP, the Google Ads callback, images) are outside it.
 */
import { z } from 'zod';

import {
   DomainDTO, EmailIdeaKeywordDTO, KeywordDTO, KeywordLastResultDTO, IdeaKeywordDTO, IdeasDatabaseDTO, InsightDataDTO, PrivateSettingsDTO,
   PublicSettingsDTO, SCDomainDataDTO, SettingsDTO,
} from './dto';

export { IdeasDatabaseDTO };

const IntegrationStatus = z.enum(['integrated', 'not-integrated']);
const positiveInt = z.number().int().positive();
const keywordIds = z.array(positiveInt).min(1);
const country = z.string().regex(/^[A-Z]{2}$/);

const RefreshStartDTO = z.object({
   message: z.string(),
   keywordCount: z.number(),
   skipped: z.object({ domains: z.array(z.string()), keywordIds: z.array(z.number()) }),
   reason: z.literal('no-eligible-keywords').optional(),
});

const EnabledDomainsRefreshDTO = z.object({
   started: z.boolean(),
   skipped: z.object({ domains: z.array(z.string()) }).optional(),
   reason: z.literal('no-enabled-domains').optional(),
});

/** Keyword input of POST /api/serp/keywords. */
export const KeywordInput = z.object({
   keyword: z.string(),
   domain: z.string(),
   device: z.string().optional(),
   country: z.string().optional(),
   location: z.string().optional(),
   city: z.string().optional(),
   state: z.string().optional(),
   tags: z.string().optional(),
});

/** Exactly one of sticky, tags or location, next to the ids. */
const KeywordUpdate = z.union([
   z.object({ ids: keywordIds, sticky: z.boolean() }).strict(),
   z.object({ ids: keywordIds, tags: z.record(z.string(), z.array(z.string())) }).strict(),
   z.object({ ids: keywordIds, location: z.string(), country: country.optional() }).strict(),
]);

const DomainSettingsPatch = z.object({
   domain: z.string(),
   notification_emails: z.string().optional(),
   // Loose: the property type and URL travel with the credentials and must reach the handler
   search_console: z.looseObject({ client_email: z.string().nullish(), private_key: z.string().nullish() }).optional(),
   scrapeEnabled: z.boolean().optional(),
   scraper_settings: z.unknown().optional(),
   business_name: z.string().nullable().optional(),
   scrape_strategy: z.string().optional(),
   scrape_pagination_limit: z.number().optional(),
});

export const IdeasGenerateBody = z.object({
   seedType: z.string(),
   domain: z.string().optional(),
   keywords: z.array(z.string()).max(1000).optional(),
   country: z.string().regex(/^[A-Za-z]{2}$/).optional(),
   language: z.union([z.string().regex(/^\d{1,10}$/), z.number().int().nonnegative()]).optional(),
   seedSCKeywords: z.boolean().optional(),
   seedCurrentKeywords: z.boolean().optional(),
});

/** Request body of POST /api/app/email. */
export const EmailBody = z.discriminatedUnion('type', [
   z.object({ type: z.literal('digest'), domain: z.string().optional() }),
   z.object({ type: z.literal('ideas'), domain: z.string(), keywords: z.array(EmailIdeaKeywordDTO).min(1).max(1000) }),
]);

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type EndpointDef = { method: Method, path: string, query?: z.ZodType, body?: z.ZodType, response: z.ZodType };
const defineEndpoints = <T extends Record<string, EndpointDef>>(endpoints: T): T => endpoints;

export const endpoints = defineEndpoints({
   // Domains
   'domains.list': { method: 'GET', path: '/api/serp/domains', query: z.object({ withstats: z.boolean().optional(), domains: z.array(z.string()).min(1).max(8).optional() }), response: z.object({ domains: z.array(DomainDTO) }) },
   'domains.add': { method: 'POST', path: '/api/serp/domains', body: z.object({ domains: z.array(z.string()).min(1) }), response: z.object({ domains: z.array(DomainDTO) }) },
   'domains.update': { method: 'PUT', path: '/api/serp/domains', body: DomainSettingsPatch, response: z.object({ domain: DomainDTO }) },
   'domains.remove': { method: 'DELETE', path: '/api/serp/domains', body: z.object({ domain: z.string() }), response: z.object({ domainRemoved: z.number(), keywordsRemoved: z.number(), SCDataRemoved: z.boolean(), cleanup: z.object({ complete: z.boolean(), failed: z.array(z.string()), retryPending: z.boolean() }) }) },
   'domains.get': { method: 'GET', path: '/api/serp/domain', query: z.object({ domain: z.string().min(1) }), response: z.object({ domain: DomainDTO }) },
   // Keywords
   'keywords.list': { method: 'GET', path: '/api/serp/keywords', query: z.object({ domain: z.string().min(1) }), response: z.object({ keywords: z.array(KeywordDTO) }) },
   'keywords.add': { method: 'POST', path: '/api/serp/keywords', body: z.object({ keywords: z.array(KeywordInput).min(1).max(100) }), response: z.object({ keywords: z.array(KeywordDTO) }) },
   'keywords.update': { method: 'PUT', path: '/api/serp/keywords', body: KeywordUpdate, response: z.object({ keywords: z.array(KeywordDTO), updatedCount: z.number().optional(), skipped: z.array(z.string()).optional() }) },
   'keywords.remove': { method: 'DELETE', path: '/api/serp/keywords', body: z.object({ ids: keywordIds }), response: z.object({ keywordsRemoved: z.number() }) },
   'keywords.get': { method: 'GET', path: '/api/serp/keyword', query: z.object({ id: positiveInt }), response: z.object({ keyword: KeywordDTO.nullable() }) },
   // Refresh
   'refresh.status': { method: 'GET', path: '/api/serp/refresh', query: z.object({ status: z.literal('retry'), id: z.array(positiveInt).min(1) }), response: z.object({ keywords: z.array(z.object({ ID: z.number(), updating: z.boolean() })) }) },
   'refresh.start': { method: 'POST', path: '/api/serp/refresh', body: z.union([z.object({ ids: keywordIds }).strict(), z.object({ scope: z.literal('domain'), domain: z.string() }).strict()]), response: RefreshStartDTO },
   'refresh.enabledDomains': { method: 'POST', path: '/api/serp/refresh', body: z.object({ scope: z.literal('enabled-domains') }).strict(), response: EnabledDomainsRefreshDTO },
   'refresh.search': { method: 'POST', path: '/api/serp/refresh', body: z.object({ keyword: z.string(), country: z.string(), device: z.string().optional() }).strict(), response: z.object({ searchResult: z.object({ results: z.array(KeywordLastResultDTO), keyword: z.string(), position: z.number(), country: z.string(), device: z.string() }) }) },
   'clearFailed.run': { method: 'PUT', path: '/api/serp/clearfailed', body: z.object({}).strict(), response: z.object({ cleared: z.literal(true) }) },
   // Google
   'ideas.get': { method: 'GET', path: '/api/google/ideas', query: z.object({ domain: z.string().optional() }), response: z.object({ ideas: IdeasDatabaseDTO }) },
   'ideas.generate': { method: 'POST', path: '/api/google/ideas', body: IdeasGenerateBody, response: z.object({ keywords: z.array(IdeaKeywordDTO) }) },
   'ideas.favorite': { method: 'PUT', path: '/api/google/ideas', body: z.object({ keywordID: z.string(), domain: z.string().optional() }), response: z.object({ favorites: z.array(IdeaKeywordDTO) }) },
   'searchConsole.get': { method: 'GET', path: '/api/google/searchconsole', query: z.object({ domain: z.string().min(1) }), response: z.object({ searchConsole: SCDomainDataDTO.nullable(), integrationStatus: IntegrationStatus }) },
   'searchConsole.refresh': { method: 'POST', path: '/api/google/searchconsole', body: z.object({}).strict(), response: z.object({ updatedCount: z.number(), failedCount: z.number() }) },
   'insight.get': { method: 'GET', path: '/api/google/insight', query: z.object({ domain: z.string().min(1) }), response: z.object({ insight: InsightDataDTO.nullable(), integrationStatus: IntegrationStatus }) },
   'volume.update': { method: 'POST', path: '/api/google/volume', body: z.object({ keywords: z.array(positiveInt).optional(), domain: z.string().optional(), update: z.boolean().optional() }), response: z.object({ keywords: z.array(KeywordDTO), volumes: z.record(z.string(), z.number()), failedCountries: z.array(z.string()).optional() }) },
   // App
   // One URL, two views: the login page's public subset, and the full settings (secrets masked) for a signed-in session
   'settings.public': { method: 'GET', path: '/api/app/settings', response: z.object({ settings: PublicSettingsDTO }) },
   'settings.private': { method: 'GET', path: '/api/app/settings', query: z.object({ includePrivate: z.literal(true) }), response: z.object({ settings: PrivateSettingsDTO }) },
   'settings.save': { method: 'PUT', path: '/api/app/settings', body: z.object({ settings: SettingsDTO.partial() }), response: z.object({ settings: PrivateSettingsDTO }) },
   'email.digest': { method: 'POST', path: '/api/app/email', body: z.object({ type: z.literal('digest'), domain: z.string().optional() }), response: z.object({ sent: z.number(), skipped: z.number(), message: z.string().optional() }) },
   'email.ideas': { method: 'POST', path: '/api/app/email', body: z.object({ type: z.literal('ideas'), domain: z.string(), keywords: z.array(EmailIdeaKeywordDTO).min(1).max(1000) }), response: z.object({ success: z.literal(true) }) },
   // Auth and Google Ads
   'auth.login': { method: 'POST', path: '/api/auth/login', body: z.object({ username: z.string().min(1).max(1024), password: z.string().min(1).max(1024) }), response: z.object({ success: z.literal(true) }) },
   'auth.logout': { method: 'POST', path: '/api/auth/logout', body: z.object({}).strict(), response: z.object({ success: z.literal(true) }) },
   'adwords.begin': { method: 'GET', path: '/api/adwords', response: z.object({ authUrl: z.string() }) },
   'adwords.test': { method: 'POST', path: '/api/adwords', body: z.object({ developer_token: z.string(), account_id: z.string() }), response: z.object({ valid: z.literal(true) }) },
});

export type Endpoints = typeof endpoints;
export type EndpointKey = keyof Endpoints;
export type EndpointData<K extends EndpointKey> = z.infer<Endpoints[K]['response']>;

type QueryOf<E> = E extends { query: infer Q extends z.ZodType } ? (Record<string, never> extends z.input<Q> ? { query?: z.input<Q> } : { query: z.input<Q> }) : unknown;
type BodyOf<E> = E extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown;
/** What a call to this endpoint takes: its query and body, each only if the endpoint defines one. */
export type EndpointInput<K extends EndpointKey> = QueryOf<Endpoints[K]> & BodyOf<Endpoints[K]>;
