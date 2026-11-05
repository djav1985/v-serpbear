import countries from './countries';
import { serializeError } from './errorSerialization';
import allScrapers from '../scrapers/index';
import { GOOGLE_BASE_URL, DEVICE_MOBILE } from './constants';
import { logger } from './logger';
import { retryQueueManager } from './retryQueueManager';
import { markOwnLocalResults } from './mapPack';
import { resolveGoogleRedirects } from './resolveGoogleLinks';

type SearchResult = {
   title: string,
   url: string,
   position: number,
}

type SERPObject = {
   position:number,
   url:string
}

export type RefreshResult = false | {
   ID: number,
   keyword: string,
   position:number,
   url: string,
   result: KeywordLastResult[],
   mapPackTop3: boolean,
   localResults?: any[],
   error?: boolean | string
};

const TOTAL_PAGES = 10;
const PAGE_SIZE = 10;

/**
 * Implements exponential backoff with jitter for retry attempts
 */
const getRetryDelay = (attempt: number, baseDelay: number = 1000): number => {
   const exponentialDelay = baseDelay * Math.pow(2, attempt);
   const jitter = Math.random() * 0.1 * exponentialDelay;
   return Math.min(exponentialDelay + jitter, 30000);
};

// The AbortController of each in-flight scraper request, looked up by its response. The request timer stops once
// the headers arrive, so reading a stalled body needs the controller to cancel the connection instead of leaving it open.
const requestControllers = new WeakMap<Response, AbortController>();

// Hides API keys and tokens in debug logs: query-string values, JSON body values and auth headers.
const SECRET_PARAM = /([?&](?:apiKey|api_key|key|token)=)[^&#]*/gi;
const SECRET_JSON_FIELD = /("(?:apiKey|api_key|key|token|password)"\s*:\s*")[^"]*(")/gi;
const maskSecrets = (value: string): string => value.replace(SECRET_PARAM, '$1***').replace(SECRET_JSON_FIELD, '$1***$2');
const maskHeaders = (headers: Record<string, string>): Record<string, string> => Object.fromEntries(
   Object.entries(headers).map(([name, value]) => [name, /authorization|api-?key|token/i.test(name) ? '***' : value]),
);

/**
 * Creates a SERP Scraper client promise with enhanced error handling and retries
 */
export const getScraperClient = (
   keyword:KeywordType,
   settings:SettingsType,
   scraper?: ScraperSettings,
   retryAttempt: number = 0,
   pagination?: ScraperPagination,
): Promise<Response> | false => {
   let apiURL = '';
   let client: Promise<Response> | false = false;
   const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246',
      Accept: 'application/json; charset=utf8;',
   };

   const mobileAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G996U Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Mobile Safari/537.36';
   if (keyword && keyword.device === DEVICE_MOBILE) {
      headers['User-Agent'] = mobileAgent;
   }

   let requestBody: string | undefined;
   if (scraper) {
      const scrapeHeaders = scraper.headers ? scraper.headers(keyword, settings) : null;
      const scraperAPIURL = scraper.scrapeURL ? scraper.scrapeURL(keyword, settings, countries, pagination) : null;
      if (scraper.method === 'POST' && scraper.body) {
         requestBody = JSON.stringify(scraper.body(keyword, settings, countries, pagination));
      }
      if (scrapeHeaders && Object.keys(scrapeHeaders).length > 0) {
         Object.keys(scrapeHeaders).forEach((headerItemKey:string) => {
            headers[headerItemKey] = scrapeHeaders[headerItemKey as keyof object];
         });
      }
      if (scraperAPIURL) {
         apiURL = scraperAPIURL;
      } else {
         return false;
      }
   }

   logger.debug('[SCRAPE] Request sent', {
      keywordId: keyword?.ID,
      keyword: keyword?.keyword,
      device: keyword?.device,
      page: pagination?.page,
      attempt: retryAttempt,
      method: scraper?.method ?? 'GET',
      url: maskSecrets(apiURL),
      headers: maskHeaders(headers),
      body: requestBody ? maskSecrets(requestBody) : undefined,
   });

   const controller = new AbortController();
   const defaultTimeout = Math.min(30000, 15000 + retryAttempt * 5000);
   const timeoutMs = scraper?.timeoutMs || defaultTimeout;
   const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

   client = fetch(apiURL, {
      method: scraper?.method ?? 'GET',
      headers,
      body: requestBody,
      signal: controller.signal,
   }).then((response) => {
      requestControllers.set(response, controller);
      return response;
   }).finally(() => clearTimeout(timeoutId));

   return client;
};

const hasScraperError = (res: any): boolean => res && (
      (res.status && (res.status < 200 || res.status >= 300))
      || (res.ok === false)
      || (res.request_info?.success === false)
   );

const buildScraperError = (res: any) => {
   const statusCode = res.status || res.request_info?.status_code || 'Unknown Status';
   const errorInfo = res.request_info?.error
      || res.error_message
      || res.detail
      || res.error
      || res.request_info?.message
      || '';
   const errorBody = res.body || res.message || '';

   return {
      status: statusCode,
      error: errorInfo,
      body: errorBody,
      request_info: res.request_info || null,
   };
};

// A response body that stalls after the headers arrive must not hang the refresh, so reading it has its own limit.
const SCRAPER_BODY_TIMEOUT_MS = 30000;
// Kept short enough for log lines and error messages, long enough to show what an error page said.
const SCRAPER_ERROR_BODY_MAX_LENGTH = 500;

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> => new Promise<T>((resolve, reject) => {
   const timer = setTimeout(() => {
      // Cancel the underlying request too, so a stalled connection is closed and not just ignored
      try { onTimeout?.(); } catch (_error) { /* aborting must never hide the timeout error */ }
      reject(new Error(`Scraper response body timed out after ${timeoutMs}ms`));
   }, timeoutMs);
   promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
   );
});

/**
 * Reads the response body once and parses it as JSON. A body that is not JSON (an HTML error page, for example)
 * is returned as { status, ok, body } so the error message can show what the server said.
 */
export const parseScraperResponse = async (response: Response): Promise<any> => {
   // The body can only be read once, so read the text first and parse it, instead of trying json() and then text().
   const text = await withTimeout(response.text(), SCRAPER_BODY_TIMEOUT_MS, () => requestControllers.get(response)?.abort());
   // Providers can echo the API key back in their response (e.g. ValueSERP's json_url), so mask it here too
   logger.debug('[SCRAPE] Raw response', { status: response.status, ok: response.ok, body: maskSecrets(text) });
   try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
         if (!Object.prototype.hasOwnProperty.call(parsed, 'status')) {
            parsed.status = response.status;
         }
         if (!Object.prototype.hasOwnProperty.call(parsed, 'ok')) {
            parsed.ok = response.ok;
         }
      }
      return parsed;
   } catch (_error) {
      return {
         status: response.status,
         ok: response.ok,
         body: text.slice(0, SCRAPER_ERROR_BODY_MAX_LENGTH),
      };
   }
};

type PageScrapeResult = {
   results: SearchResult[];
   mapPackTop3: boolean;
   localResults: any[];
   // true when the request itself failed, as opposed to a page that simply has no results
   failed: boolean;
   error?: string;
};

const describeScraperFailure = (res: any): string => {
   const scraperError = buildScraperError(res);
   const detail = scraperError.error || scraperError.body || 'Request failed';
   return `[${scraperError.status}] ${typeof detail === 'string' ? detail : serializeError(detail)}`;
};

/**
 * Scrape a single page of Google Search results.
 */
const scrapeSinglePage = async (
   keyword: KeywordType,
   settings: SettingsType,
   scraperObj: ScraperSettings | undefined,
   pagination: ScraperPagination,
   maxRetries: number = 1,
): Promise<PageScrapeResult> => {
   const failure = (error: string): PageScrapeResult => (
      { results: [], mapPackTop3: false, localResults: [], failed: true, error }
   );
   if (!scraperObj) { return failure('Scraper type not found'); }

   let lastError = 'No valid scrape result returned';
   for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const scraperClient = getScraperClient(keyword, settings, scraperObj, attempt, pagination);
      if (!scraperClient) { return failure('Failed to create scraper client'); }
      try {
         const response = await scraperClient;
         const res = await parseScraperResponse(response);
         if (hasScraperError(res)) {
            lastError = describeScraperFailure(res);
            if (attempt < maxRetries) {
               await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
               continue;
            }
            break;
         }
         const scraperResult = scraperObj.resultObjectKey && res[scraperObj.resultObjectKey] ? res[scraperObj.resultObjectKey] : '';
         const scrapeResult = res.data || res.results || scraperResult || null;
         if (res && scrapeResult) {
            const extraction = scraperObj.serpExtractor({ keyword, response: res, result: scrapeResult, settings, pagination });
            // Links PrismCrawl could not resolve (no domain) stay as google.com/goto links; look up where they lead
            const organic = await resolveGoogleRedirects(extraction.organic);
            const mapPackTop3 = extraction.mapPackTop3 ?? false;
            const localResults = markOwnLocalResults(extraction.localResults ?? [], (settings as ExtendedSettings)?.business_name);
            return {
               results: organic.map((item, i) => ({ ...item, position: i + 1 })),
               mapPackTop3,
               localResults,
               failed: false,
            };
         }
         lastError = 'No valid scrape result returned';
         if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
            continue;
         }
      } catch (error:any) {
         lastError = serializeError(error);
         logger.debug('[SCRAPE] Scraping page failed', { page: pagination.page, keyword: keyword.keyword, error: error?.message || '' });
         if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
            continue;
         }
      }
   }
   return failure(lastError);
};

const buildFullResults = (scrapedResults: SearchResult[]): KeywordLastResult[] => {
   if (scrapedResults.length === 0) { return []; }
   const maxPosition = Math.max(...scrapedResults.map((r) => r.position));
   const scrapedByPos = new Map(scrapedResults.map((r) => [r.position, r]));
   const full: KeywordLastResult[] = [];
   for (let i = 1; i <= maxPosition; i += 1) {
      const found = scrapedByPos.get(i);
      full.push(found ? { position: i, url: found.url, title: found.title } : { position: i, url: '', title: '', skipped: true });
   }
   return full;
};

const resolveStrategy = (
   settings: SettingsType,
   domainSettings?: Partial<DomainType>,
): { strategy: ScrapeStrategy, paginationLimit: number } => {
   // Only 'custom' scrapes more than page 1; any other value (including the removed 'smart') means page 1 only.
   const toStrategy = (value: unknown): ScrapeStrategy => (value === 'custom' ? 'custom' : 'basic');
   const domainStrategy = domainSettings?.scrape_strategy;
   if (!domainStrategy) {
      return {
         strategy: toStrategy(settings.scrape_strategy),
         paginationLimit: settings.scrape_pagination_limit || 5,
      };
   }
   const paginationLimit = domainSettings?.scrape_pagination_limit || settings.scrape_pagination_limit || 5;
   return { strategy: toStrategy(domainStrategy), paginationLimit };
};

/**
 * Turns per-page results into one list with absolute positions. A page that was not scraped
 * (skipped by the strategy, or failed) is assumed to hold PAGE_SIZE results so later pages
 * keep their place; scraped pages contribute their real result count.
 */
const assemblePositions = (pageResults: Map<number, SearchResult[]>): SearchResult[] => {
   const assembled: SearchResult[] = [];
   if (pageResults.size === 0) { return assembled; }
   const lastPage = Math.max(...pageResults.keys());
   let offset = 0;
   for (let pageNum = 1; pageNum <= lastPage; pageNum += 1) {
      const pageItems = pageResults.get(pageNum);
      if (pageItems) {
         pageItems.forEach((item, index) => assembled.push({ ...item, position: offset + index + 1 }));
         offset += pageItems.length;
      } else {
         offset += PAGE_SIZE;
      }
   }
   return assembled;
};

export const scrapeKeywordWithStrategy = async (
   keyword: KeywordType,
   settings: SettingsType,
   domainSettings?: Partial<DomainType>,
): Promise<RefreshResult> => {
   const scraperType = settings?.scraper_type || '';
   const scraperObj = allScrapers.find((s: ScraperSettings) => s.id === scraperType);

   const errorResult: RefreshResult = {
      ID: keyword.ID,
      keyword: keyword.keyword,
      position: keyword.position,
      url: keyword.url,
      result: keyword.lastResult,
      mapPackTop3: keyword.mapPackTop3 ?? false,
      error: 'No results scraped',
   };

   if (!scraperObj) {
      return { ...errorResult, error: `Scraper type '${scraperType}' not found` };
   }

   const { strategy, paginationLimit } = resolveStrategy(settings, domainSettings);
   let pagesToScrape: number[];

   if (strategy === 'custom') {
      const limit = Math.max(1, Math.min(paginationLimit, TOTAL_PAGES));
      pagesToScrape = Array.from({ length: limit }, (_, i) => i + 1);
   } else {
      pagesToScrape = [1];
   }

   const pageResults = new Map<number, SearchResult[]>();
   const state = {
      page1MapPackTop3: keyword.mapPackTop3 ?? false,
      page1LocalResults: [] as any[],
      page1Scraped: false,
      failureMessage: undefined as string | undefined,
   };

   // Resolves to 'ok' when the page had results, 'empty' when Google has no more results,
   // and 'failed' when the request itself failed (the reason is kept in state.failureMessage).
   const scrapePage = async (pageNum: number): Promise<'ok' | 'empty' | 'failed'> => {
      // Offset-based providers continue after the results already returned (2 results -> start 2, then 5 more -> start 7).
      let start = (pageNum - 1) * PAGE_SIZE;
      if (scraperObj.usesResultOffset) {
         start = 0;
         for (let earlier = 1; earlier < pageNum; earlier += 1) {
            start += pageResults.get(earlier)?.length ?? PAGE_SIZE;
         }
      }
      const pagination: ScraperPagination = { start, num: PAGE_SIZE, page: pageNum };
      const scraped = await scrapeSinglePage(keyword, settings, scraperObj, pagination);
      if (scraped.failed) {
         state.failureMessage = scraped.error || 'Scrape request failed';
         return 'failed';
      }
      // Page 1 can hold a map pack but no organic results; still record the map pack (position stays 0).
      if (scraped.results.length === 0) {
         if (pageNum === 1 && !state.page1Scraped && scraped.localResults.length > 0) {
            state.page1MapPackTop3 = scraped.mapPackTop3;
            state.page1LocalResults = scraped.localResults;
            state.page1Scraped = true;
         }
         return 'empty';
      }
      pageResults.set(pageNum, scraped.results);
      if (pageNum === 1 && !state.page1Scraped) {
         state.page1MapPackTop3 = scraped.mapPackTop3;
         state.page1LocalResults = scraped.localResults;
         state.page1Scraped = true;
      }
      return 'ok';
   };

   for (const pageNum of pagesToScrape) {
      const outcome = await scrapePage(pageNum);
      if (outcome !== 'ok') {
         break;
      }

      if (strategy === 'custom' && getSerp(keyword.domain, assemblePositions(pageResults)).position > 0) {
         break;
      }
   }

   if (pageResults.size === 0) {
      if (state.page1Scraped && !state.failureMessage) {
         // Local results only: not ranked organically (position 0), map pack updated.
         return {
            ID: keyword.ID,
            keyword: keyword.keyword,
            position: 0,
            url: '',
            result: [],
            mapPackTop3: state.page1MapPackTop3,
            localResults: state.page1LocalResults,
            error: false,
         };
      }
      return { ...errorResult, error: state.failureMessage || errorResult.error };
   }

   const allScrapedResults = assemblePositions(pageResults);
   const finalSerp = getSerp(keyword.domain, allScrapedResults);

   // A failed page means the keyword may simply be on a page we could not read. Report the
   // failure instead of recording "not ranked", so the old position and history are kept.
   if (state.failureMessage && finalSerp.position === 0) {
      return { ...errorResult, error: state.failureMessage };
   }

   const fullResults = buildFullResults(allScrapedResults);

   logger.info('[SERP] Strategy scrape completed', { keyword: keyword.keyword, position: finalSerp.position, strategy });
   return {
      ID: keyword.ID,
      keyword: keyword.keyword,
      position: finalSerp.position,
      url: finalSerp.url,
      result: fullResults,
      mapPackTop3: state.page1MapPackTop3,
      localResults: state.page1LocalResults,
      error: false,
   };
};

const resolveResultURL = (value: string | undefined | null): URL | null => {
   if (!value) { return null; }
   try {
      return new URL(value);
   } catch (_error) {
      try {
         return new URL(value, GOOGLE_BASE_URL);
      } catch (error: any) {
         logger.error('[ERROR] Unable to resolve SERP result URL', error, { url: value });
         return null;
      }
   }
};

const normalizeComparableHost = (host: string): string => host.replace(/^www\./i, '').toLowerCase();

export const getSerp = (domainURL:string, result:SearchResult[]) : SERPObject => {
   if (result.length === 0 || !domainURL) { return { position: 0, url: '' }; }

   let URLToFind: URL;
   try {
      URLToFind = domainURL.includes('://') ? new URL(domainURL) : new URL(`https://${domainURL}`);
   } catch (error: any) {
      logger.error('Invalid domain URL provided', error, { domainURL });
      return { position: 0, url: '' };
   }

   const targetHost = normalizeComparableHost(URLToFind.hostname);
   const targetPath = URLToFind.pathname.replace(/\/$/, '');
   const hasSpecificPath = targetPath.length > 0;

   const matchingItems = result.filter((item) => {
      const parsedURL = resolveResultURL(item.url);
      if (!parsedURL) { return false; }

      const rawValue = item.url ? item.url.trim() : '';
      const looksRelative = rawValue.startsWith('/') || rawValue.startsWith('?') || rawValue.startsWith('#');
      if (looksRelative && parsedURL.origin === GOOGLE_BASE_URL) { return false; }

      const itemPath = parsedURL.pathname.replace(/\/$/, '');
      if (hasSpecificPath) {
         return normalizeComparableHost(parsedURL.hostname) === targetHost && itemPath === targetPath;
      }
      return normalizeComparableHost(parsedURL.hostname) === targetHost;
   });

   const foundItem = matchingItems.length > 0
      ? matchingItems.reduce((best, item) => (item.position < best.position ? item : best))
      : undefined;

   return { position: foundItem ? foundItem.position : 0, url: foundItem && foundItem.url ? foundItem.url : '' };
};

export const retryScrape = async (keywordID: number) : Promise<void> => {
   await retryQueueManager.addToQueue(keywordID);
};

export const removeFromRetryQueue = async (keywordID: number) : Promise<void> => {
   await retryQueueManager.removeFromQueue(keywordID);
};
