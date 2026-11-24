/**
 * The shape of every record the REST API returns: domains, keywords, settings, Search Console data, insight and
 * keyword ideas. Each schema lists the fields of the matching global type (types.d.ts), with the same optional and
 * nullable fields, so the browser client checks the inside of a record and not only its outer layer.
 *
 * Each schema is tied to its type at compile time (see the assertions at the end of the file): adding or removing a field
 * on one side without the other fails `tsc`. A test also parses what the server's mappers really produce
 * (__tests__/api/contract-dto.test.ts), so a mapper that returns a field the type does not describe fails there.
 * Client-safe: imports only zod.
 */
import { z } from 'zod';

const num = z.number();
const str = z.string();
const bool = z.boolean();

// Domains

export const DomainScraperSettingsDTO = z.object({
   scraper_type: str.nullish(),
   scraping_api: str.nullish(),
   has_api_key: bool.optional(),
   clear_api_key: bool.optional(),
});

export const DomainDTO = z.object({
   ID: num,
   domain: str,
   slug: str,
   scrapeEnabled: bool.optional(),
   notification_emails: str,
   lastUpdated: str,
   added: str,
   keywordsTracked: num.optional(),
   keywordsUpdated: str.optional(),
   avgPosition: num.optional(),
   mapPackKeywords: num.optional(),
   scVisits: num.optional(),
   scImpressions: num.optional(),
   scPosition: num.optional(),
   creditsRemaining: num.nullish(),
   creditsUnit: z.enum(['credits', 'usd']).optional(),
   prevKeywordsTracked: num.nullish(),
   prevAvgPosition: num.nullish(),
   prevMapPackKeywords: num.nullish(),
   scVisitsPrev: num.optional(),
   scImpressionsPrev: num.optional(),
   scPositionPrev: num.optional(),
   search_console: str.optional(),
   ideas_settings: str.optional(),
   scraper_settings: DomainScraperSettingsDTO.nullish(),
   business_name: str.nullish(),
   scrape_strategy: z.enum(['basic', 'custom', '']).optional(),
   scrape_pagination_limit: num.optional(),
});

// Keywords

const KeywordHistoryDTO = z.record(str, num);

export const KeywordLastResultDTO = z.object({ position: num, url: str, title: str });

const KeywordLocalResultDTO = z.looseObject({ position: num, url: str.optional(), title: str.optional(), isOwn: bool.optional() });

const KeywordSCDataChildDTO = z.object({
   yesterday: num,
   threeDays: num,
   sevenDays: num,
   thirtyDays: num,
   avgSevenDays: num,
   avgThreeDays: num,
   avgThirtyDays: num,
});

const KeywordSCDataDTO = z.object({
   impressions: KeywordSCDataChildDTO,
   visits: KeywordSCDataChildDTO,
   ctr: KeywordSCDataChildDTO,
   position: KeywordSCDataChildDTO,
});

export const KeywordDTO = z.object({
   ID: num,
   keyword: str,
   device: str,
   country: str,
   domain: str,
   lastUpdated: str,
   added: str,
   position: num,
   volume: num,
   sticky: bool,
   history: KeywordHistoryDTO,
   history7d: KeywordHistoryDTO.optional(),
   lastResult: z.array(KeywordLastResultDTO),
   url: str,
   tags: z.array(str),
   updating: bool,
   updatingStartedAt: str.nullish(),
   lastUpdateError: z.union([
      z.literal(false),
      z.object({ date: str.optional(), error: str.optional(), scraper: str.optional(), reason: str.optional(), code: str.optional(), message: str.optional() }),
   ]),
   scData: KeywordSCDataDTO.optional(),
   uid: str.optional(),
   location: str.optional(),
   state: str.optional(),
   city: str.optional(),
   mapPackTop3: bool.optional(),
   localResults: z.array(KeywordLocalResultDTO).optional(),
});

// Settings. The public view is what anyone gets before signing in; the private view needs a session. Secrets are
// never returned in either: a stored secret is the marker "true", an unset one is an empty string.

const BrandingDTO = z.object({
   defaultPlatformName: str,
   whiteLabelEnabled: bool,
   platformName: str,
   hasCustomLogo: bool,
   logoApiPath: str,
});

const AvailableScraperDTO = z.object({
   label: str,
   value: str,
   allowsCity: bool.optional(),
   supportsMapPack: bool.optional(),
   scraperCountries: z.array(str).optional(),
});

/** Every setting the server keeps. Which of them a response carries is described by the two views below. */
export const SettingsDTO = z.object({
   scraper_type: str,
   timezone: str.optional(),
   branding: BrandingDTO.optional(),
   scraping_api: str.optional(),
   notification_interval: str,
   notification_email_from: str,
   notification_email_from_name: str,
   smtp_server: str,
   smtp_port: num.nullable(),
   smtp_tls_servername: str.optional(),
   smtp_username: str.optional(),
   smtp_password: str.optional(),
   available_scapers: z.array(AvailableScraperDTO).optional(),
   scrape_interval: str.optional(),
   scrape_delay: str.optional(),
   scrape_retry: bool.optional(),
   scrape_strategy: z.enum(['basic', 'custom']).optional(),
   scrape_pagination_limit: num.optional(),
   failed_queue: z.array(num).optional(),
   version: str.optional(),
   search_console_client_email: str,
   search_console_private_key: str,
   search_console_integrated: bool.optional(),
   adwords_client_id: str.optional(),
   adwords_client_secret: str.optional(),
   adwords_refresh_token: str.optional(),
   adwords_developer_token: str.optional(),
   adwords_account_id: str.optional(),
   keywordsColumns: z.array(str),
});

/** GET /api/app/settings without includePrivate: the subset the login page needs. */
export const PublicSettingsDTO = z.object({
   scraper_type: str,
   available_scapers: z.array(AvailableScraperDTO),
   search_console_integrated: bool,
   version: str,
   timezone: str,
   branding: BrandingDTO,
});

/** GET /api/app/settings?includePrivate=true: every setting, with secrets masked, plus the read-only version, timezone and branding. */
export const PrivateSettingsDTO = SettingsDTO.extend({ version: str, timezone: str, branding: BrandingDTO });

// Search Console and insight

export const SearchAnalyticsStatDTO = z.object({ date: str, clicks: num, impressions: num, ctr: num, position: num });

const SearchAnalyticsItemDTO = z.object({
   keyword: str,
   uid: str,
   device: str,
   page: str,
   country: str,
   clicks: num,
   impressions: num,
   ctr: num,
   position: num,
   date: str.optional(),
});

export const SCDomainDataDTO = z.object({
   threeDays: z.array(SearchAnalyticsItemDTO),
   sevenDays: z.array(SearchAnalyticsItemDTO),
   thirtyDays: z.array(SearchAnalyticsItemDTO),
   lastFetched: str.optional(),
   lastFetchError: str.optional(),
   stats: z.array(SearchAnalyticsStatDTO).optional(),
});

const SCInsightItemDTO = z.object({
   clicks: num,
   impressions: num,
   ctr: num,
   position: num,
   countries: num.optional(),
   country: str.optional(),
   keyword: str.optional(),
   keywords: num.optional(),
   page: str.optional(),
   date: str.optional(),
});

export const InsightDataDTO = z.object({
   stats: z.array(SearchAnalyticsStatDTO).nullable(),
   keywords: z.array(SCInsightItemDTO),
   countries: z.array(SCInsightItemDTO),
   pages: z.array(SCInsightItemDTO),
});

// Keyword ideas

export const IdeaKeywordDTO = z.object({
   uid: str,
   keyword: str,
   competition: z.enum(['UNSPECIFIED', 'UNKNOWN', 'HIGH', 'LOW', 'MEDIUM']),
   country: str,
   domain: str,
   competitionIndex: num,
   monthlySearchVolumes: z.record(str, str),
   avgMonthlySearches: num,
   added: num,
   updated: num,
   position: num,
});

/** The options a keyword ideas run was made with, as saved next to its results. */
export const IdeaSettingsDTO = z.object({
   country: str.optional(),
   city: str.optional(),
   state: str.optional(),
   language: str.optional(),
   keywords: z.array(str).optional(),
   domain: str.optional(),
   seedType: z.enum(['auto', 'custom', 'tracking', 'searchconsole']),
   seedSCKeywords: bool.optional(),
   seedCurrentKeywords: bool.optional(),
});

/**
 * A keyword idea as the browser sends it to be emailed: the fields the email shows. The rest of an idea may come along
 * and is ignored. Volumes are text in a saved idea and numbers elsewhere, and an idea without a volume or competition has null there, so all are accepted.
 */
export const EmailIdeaKeywordDTO = z.looseObject({
   keyword: str,
   avgMonthlySearches: num.optional(),
   monthlySearchVolumes: z.record(str, z.union([str, num])).nullish(),
   competition: str.nullish(),
   competitionIndex: z.union([num, str]).nullish(),
});

export const IdeasDatabaseDTO = z.object({
   keywords: z.array(IdeaKeywordDTO),
   favorites: z.array(IdeaKeywordDTO).default([]),
   settings: IdeaSettingsDTO.optional(),
   updated: num.optional(),
});

// Compile-time tie to the global types: the schema and the type must describe the same record.

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type MustBeTrue<T extends true> = T;

export type DtoParityChecks = [
   MustBeTrue<Same<z.output<typeof DomainDTO>, DomainType>>,
   MustBeTrue<Same<z.output<typeof KeywordDTO>, KeywordType>>,
   MustBeTrue<Same<z.output<typeof KeywordLastResultDTO>, KeywordLastResult>>,
   MustBeTrue<Same<z.output<typeof SCDomainDataDTO>, SCDomainDataType>>,
   MustBeTrue<Same<z.output<typeof InsightDataDTO>, InsightDataType>>,
   MustBeTrue<Same<z.output<typeof IdeaKeywordDTO>, IdeaKeyword>>,
   MustBeTrue<Same<z.output<typeof SettingsDTO>, SettingsType>>,
];
