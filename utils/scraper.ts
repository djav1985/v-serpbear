import axios, { AxiosResponse, CreateAxiosDefaults } from 'axios';
import * as cheerio from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import countries from './countries';
import { serializeError } from './errorSerialization';
import allScrapers from '../scrapers/index';
import { GOOGLE_BASE_URL, DEVICE_MOBILE } from './constants';
import { computeMapPackTop3, doesUrlMatchDomainHost, normaliseDomainHost, extractLocalResultsFromPayload } from './mapPack';
import { logger } from './logger';
import { retryQueueManager } from './retryQueueManager';

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
   const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
   return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
};

/**
 * Creates a SERP Scraper client promise with enhanced error handling and retries
 * @param {KeywordType} keyword - the keyword to get the SERP for.
 * @param {SettingsType} settings - the App Settings that contains the scraper details
 * @param {ScraperSettings} scraper - the specific scraper configuration
 * @param {number} retryAttempt - current retry attempt number
 * @returns {Promise}
 */
export const getScraperClient = (
   keyword:KeywordType,
   settings:SettingsType,
   scraper?: ScraperSettings,
   retryAttempt: number = 0,
   pagination?: ScraperPagination,
): Promise<AxiosResponse|Response> | false => {
   let apiURL = ''; let client: Promise<AxiosResponse|Response> | false = false;
   const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246',
      Accept: 'application/json; charset=utf8;',
   };

   const mobileAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G996U Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Mobile Safari/537.36';
   if (keyword && keyword.device === DEVICE_MOBILE) {
      headers['User-Agent'] = mobileAgent;
   }

   if (scraper) {
      // Set Scraper Header
      const scrapeHeaders = scraper.headers ? scraper.headers(keyword, settings) : null;
      const scraperAPIURL = scraper.scrapeURL ? scraper.scrapeURL(keyword, settings, countries, pagination) : null;
      if (scrapeHeaders && Object.keys(scrapeHeaders).length > 0) {
         Object.keys(scrapeHeaders).forEach((headerItemKey:string) => {
            headers[headerItemKey] = scrapeHeaders[headerItemKey as keyof object];
         });
      }
      // Set Scraper API URL
      // If not URL is generated, stop right here.
      if (scraperAPIURL) {
         apiURL = scraperAPIURL;
      } else {
         return false;
      }
   }

   if (settings && settings.scraper_type === 'proxy' && settings.proxy) {
      const axiosConfig: CreateAxiosDefaults = {};
      headers.Accept = 'gzip,deflate,compress;';
      axiosConfig.headers = headers;
      
      // Enhanced proxy configuration with timeout and error handling
      // Use scraper-specific timeout if provided, otherwise use default with retry adjustment
      const defaultTimeout = Math.min(30000, 15000 + retryAttempt * 5000);
      axiosConfig.timeout = scraper?.timeoutMs || defaultTimeout;
      axiosConfig.maxRedirects = 3;
      
      const proxies = settings.proxy.split(/\r?\n|\r|\n/g).filter(proxy => proxy.trim());
      let proxyURL = '';
      if (proxies.length > 1) {
         proxyURL = proxies[Math.floor(Math.random() * proxies.length)];
      } else {
         const [firstProxy] = proxies;
         proxyURL = firstProxy;
      }

      axiosConfig.httpsAgent = new HttpsProxyAgent(proxyURL.trim());
      axiosConfig.proxy = false;
      const axiosClient = axios.create(axiosConfig);
      const p = pagination || { start: 0, num: PAGE_SIZE };
      client = axiosClient.get(`https://www.google.com/search?num=${p.num}&start=${p.start}&q=${encodeURI(keyword.keyword)}`);
   } else {
      // Enhanced fetch configuration with timeout and better error handling
      const controller = new AbortController();
      // Use scraper-specific timeout if provided, otherwise use default with retry adjustment
      const defaultTimeout = Math.min(30000, 15000 + retryAttempt * 5000);
      const timeoutMs = scraper?.timeoutMs || defaultTimeout;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      client = fetch(apiURL, {
         method: 'GET',
         headers,
         signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
   }

   return client;
};

/**
 * Checks if the scraper response indicates an error condition
 */
const hasScraperError = (res: any): boolean => res && (
      (res.status && (res.status < 200 || res.status >= 300))
      || (res.ok === false)
      || (res.request_info?.success === false)
   );

/**
 * Builds a comprehensive error object from the scraper response
 */
const buildScraperError = (res: any) => {
   // Try to get status code from multiple sources
   const statusCode = res.status || res.request_info?.status_code || 'Unknown Status';
   // Try to get error message from multiple sources, including request_info.message
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

/**
 * Handles proxy-specific error processing
 */
const handleProxyError = (error: any, settings: SettingsType): string => {
   if (settings.scraper_type === 'proxy' && error?.response?.statusText) {
      return `[${error.response.status}] ${error.response.statusText}`;
   }
   return serializeError(error);
};

type PageScrapeResult = {
   results: SearchResult[];
   mapPackTop3: boolean;
   localResults: any[];
};

/**
 * Scrape a single page of Google Search results with absolute position offsets applied.
 * Includes retry logic with exponential backoff and returns mapPackTop3 / localResults.
 */
const scrapeSinglePage = async (
   keyword: KeywordType,
   settings: SettingsType,
   scraperObj: ScraperSettings | undefined,
   pagination: ScraperPagination,
   maxRetries: number = 3,
): Promise<PageScrapeResult> => {
   const scraperType = settings?.scraper_type || '';
   const empty: PageScrapeResult = { results: [], mapPackTop3: false, localResults: [] };

   for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const scraperClient = getScraperClient(keyword, settings, scraperObj, attempt, pagination);
      if (!scraperClient) { return empty; }
      try {
         const res = scraperType === 'proxy' && settings.proxy ? await scraperClient : await scraperClient.then((result:any) => result.json());
         if (hasScraperError(res)) {
            if (attempt < maxRetries) {
               await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
               continue;
            }
            break;
         }
         const scraperResult = scraperObj?.resultObjectKey && res[scraperObj.resultObjectKey] ? res[scraperObj.resultObjectKey] : '';
         const scrapeResult: string = (res.data || res.html || res.results || scraperResult || '');
         if (res && scrapeResult) {
            let organic: SearchResult[];
            let mapPackTop3 = false;
            if (scraperObj?.serpExtractor) {
               const extraction = scraperObj.serpExtractor({ keyword, response: res, result: scrapeResult, settings });
               organic = extraction.organic;
               mapPackTop3 = extraction.mapPackTop3 ?? false;
            } else {
               const extraction = extractScrapedResult(scrapeResult, keyword.device, keyword.domain);
               organic = extraction.organic;
               mapPackTop3 = extraction.mapPackTop3;
            }
            const debugMode = process.env.NODE_ENV === 'development';
            const localResults = extractLocalResultsFromPayload(res, debugMode);
            return {
               results: organic.map((item, i) => ({ ...item, position: pagination.start + i + 1 })),
               mapPackTop3,
               localResults,
            };
         }
         if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
            continue;
         }
      } catch (error:any) {
         logger.debug('[SCRAPE] Scraping page failed', { page: pagination.page, keyword: keyword.keyword, error: error?.message || '' });
         if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
            continue;
         }
      }
   }
   return empty;
};

/**
 * Build a full 100-position result array: scraped positions keep their data, unscraped positions are marked skipped.
 */
const buildFullResults = (scrapedResults: SearchResult[]): KeywordLastResult[] => {
   const totalPositions = TOTAL_PAGES * PAGE_SIZE;
   const scrapedByPos = new Map(scrapedResults.map((r) => [r.position, r]));
   const full: KeywordLastResult[] = [];
   for (let i = 1; i <= totalPositions; i += 1) {
      const found = scrapedByPos.get(i);
      full.push(found ? { position: i, url: found.url, title: found.title } : { position: i, url: '', title: '', skipped: true });
   }
   return full;
};

/**
 * Resolve the effective scrape strategy from domain-level overrides or global settings.
 */
const resolveStrategy = (
   settings: SettingsType,
   domainSettings?: Partial<DomainType>,
): { strategy: ScrapeStrategy, paginationLimit: number, smartFullFallback: boolean } => {
   const domainStrategy = domainSettings?.scrape_strategy;
   if (!domainStrategy) {
      return {
         strategy: (settings.scrape_strategy || 'basic') as ScrapeStrategy,
         paginationLimit: settings.scrape_pagination_limit || 5,
         smartFullFallback: settings.scrape_smart_full_fallback || false,
      };
   }
   const strategy = domainStrategy as ScrapeStrategy;
   const paginationLimit = domainSettings?.scrape_pagination_limit || settings.scrape_pagination_limit || 5;
   const smartFullFallback = domainSettings?.scrape_smart_full_fallback ?? (settings.scrape_smart_full_fallback || false);
   return { strategy, paginationLimit, smartFullFallback };
};

/**
 * Scrape Google Search results using the configured scrape strategy (Basic, Custom, Smart).
 * Domain-level settings override global settings. Marks non-scraped positions as skipped.
 * For native-pagination scrapers (serpapi, searchapi) this delegates to scrapeKeywordFromGoogle.
 * @param {KeywordType} keyword - the keyword to scrape
 * @param {SettingsType} settings - global App Settings
 * @param {Partial<DomainType>} domainSettings - optional domain-level setting overrides
 * @returns {Promise<RefreshResult>}
 */
export const scrapeKeywordWithStrategy = async (
   keyword: KeywordType,
   settings: SettingsType,
   domainSettings?: Partial<DomainType>,
): Promise<RefreshResult> => {
   const scraperType = settings?.scraper_type || '';
   const scraperObj = allScrapers.find((s: ScraperSettings) => s.id === scraperType);

   // Native-pagination scrapers (serpapi, searchapi) fetch up to 100 results in one request
   if (scraperObj?.nativePagination) {
      return scrapeKeywordFromGoogle(keyword, settings);
   }

   const errorResult: RefreshResult = {
      ID: keyword.ID,
      keyword: keyword.keyword,
      position: keyword.position,
      url: keyword.url,
      result: keyword.lastResult,
      mapPackTop3: keyword.mapPackTop3 ?? false,
      error: 'No results scraped',
   };

   const { strategy, paginationLimit, smartFullFallback } = resolveStrategy(settings, domainSettings);
   let pagesToScrape: number[];

   if (strategy === 'custom') {
      const limit = Math.max(1, Math.min(paginationLimit, TOTAL_PAGES));
      pagesToScrape = Array.from({ length: limit }, (_, i) => i + 1);
   } else if (strategy === 'smart') {
      const lastPos = keyword.position;
      const lastPage = lastPos > 0 ? Math.min(Math.ceil(lastPos / PAGE_SIZE), TOTAL_PAGES) : 1;
      // Always include page 1 so improvements into the top 10 are never missed, plus the
      // neighbors of the last-known page to track the existing position.
      const neighbors = [1, lastPage - 1, lastPage, lastPage + 1].filter((p) => p >= 1 && p <= TOTAL_PAGES);
      pagesToScrape = [...new Set(neighbors)];
   } else {
      pagesToScrape = [1]; // Basic: first page only
   }

   const allScrapedResults: SearchResult[] = [];
   // Map pack and local results only appear on page 1; retain the previous value when page 1 is not scraped.
   let page1MapPackTop3 = keyword.mapPackTop3 ?? false;
   let page1LocalResults: any[] = [];
   let page1Scraped = false;
   for (const pageNum of pagesToScrape) {
      const pagination: ScraperPagination = { start: (pageNum - 1) * PAGE_SIZE, num: PAGE_SIZE, page: pageNum };
      const { results, mapPackTop3, localResults } = await scrapeSinglePage(keyword, settings, scraperObj, pagination);
      if (results.length > 0) {
         allScrapedResults.push(...results);
         if (pageNum === 1) {
            page1MapPackTop3 = mapPackTop3;
            page1LocalResults = localResults;
            page1Scraped = true;
         }
      }
   }

   if (allScrapedResults.length === 0) { return errorResult; }

   // Smart + full fallback: if domain not found on neighboring pages, scrape the rest
   if (strategy === 'smart' && smartFullFallback) {
      const serpCheck = getSerp(keyword.domain, allScrapedResults);
      if (serpCheck.position === 0) {
         const alreadyScraped = new Set(pagesToScrape);
         const remainingPages = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).filter((p) => !alreadyScraped.has(p));
         for (const pageNum of remainingPages) {
            const pagination: ScraperPagination = { start: (pageNum - 1) * PAGE_SIZE, num: PAGE_SIZE, page: pageNum };
            const { results, mapPackTop3, localResults } = await scrapeSinglePage(keyword, settings, scraperObj, pagination);
            if (results.length > 0) {
               allScrapedResults.push(...results);
               if (pageNum === 1 && !page1Scraped) {
                  page1MapPackTop3 = mapPackTop3;
                  page1LocalResults = localResults;
                  page1Scraped = true;
               }
            }
         }
      }
   }

   const finalSerp = getSerp(keyword.domain, allScrapedResults);
   const fullResults = buildFullResults(allScrapedResults);

   logger.info('[SERP] Strategy scrape completed', { keyword: keyword.keyword, position: finalSerp.position, strategy });
   return {
      ID: keyword.ID,
      keyword: keyword.keyword,
      position: finalSerp.position,
      url: finalSerp.url,
      result: fullResults,
      mapPackTop3: page1MapPackTop3,
      localResults: page1LocalResults,
      error: false,
   };
};

/**
 * Scrape Google Search result with retry logic and better error handling
 * @param {KeywordType} keyword - the keyword to search for in Google.
 * @param {SettingsType} settings - the App Settings
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<RefreshResult>}
 */
export const scrapeKeywordFromGoogle = async (keyword:KeywordType, settings:SettingsType, maxRetries: number = 3) : Promise<RefreshResult> => {
   let refreshedResults:RefreshResult = {
      ID: keyword.ID,
      keyword: keyword.keyword,
      position: keyword.position,
      url: keyword.url,
      result: keyword.lastResult,
      mapPackTop3: keyword.mapPackTop3 ?? false,
      error: true,
   };
   
   const scraperType = settings?.scraper_type || '';
   const scraperObj = allScrapers.find((scraper:ScraperSettings) => scraper.id === scraperType);
   
   if (!scraperObj) {
      return { ...refreshedResults, error: `Scraper type '${scraperType}' not found` };
   }

   let lastError: any = null;

   // Retry logic with exponential backoff
   for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const scraperClient = getScraperClient(keyword, settings, scraperObj, attempt);
      
      if (!scraperClient) { 
         return { ...refreshedResults, error: 'Failed to create scraper client' };
      }

      try {
         const res = scraperType === 'proxy' && settings.proxy ? await scraperClient : await scraperClient.then((reslt:any) => reslt.json());

         // Check response status and success indicators
         if (hasScraperError(res)) {
            // Build comprehensive error object
            const scraperError = buildScraperError(res);

            // Log error on final attempt only to avoid spam
            if (attempt === maxRetries) {
               const error = new Error(`Scraper error: ${scraperError.error || scraperError.body || 'Request failed'}`);
               logger.error(`Scraper failed after ${maxRetries + 1} attempts`, error, { 
                  status: scraperError.status,
                  payload: scraperError
               });
            }

            const errorMessage = `[${scraperError.status}] ${scraperError.error || scraperError.body || 'Request failed'}`;
            lastError = errorMessage;
            
            // If this was the last attempt, throw the error
            if (attempt === maxRetries) {
               throw new Error(errorMessage);
            }
            
            // Wait before retrying with exponential backoff
            await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
            continue;
         }

         const resultPayload = scraperObj?.resultObjectKey && res && typeof res === 'object'
            ? res[scraperObj.resultObjectKey]
            : undefined;

         const fallbackPayload = resultPayload ?? res?.data ?? res?.html ?? res?.results ?? res?.body ?? null;
         const extractorInput = { keyword, response: res, result: fallbackPayload, settings };

         let extraction: { organic: SearchResult[]; mapPackTop3?: boolean } | null = null;

         if (scraperObj?.serpExtractor) {
            extraction = scraperObj.serpExtractor(extractorInput);
         } else {
            const htmlContent = typeof fallbackPayload === 'string'
               ? fallbackPayload
               : typeof res?.data === 'string'
                  ? res.data
                  : '';

            if (!htmlContent) {
               throw new Error('Scraper payload did not include HTML content to parse.');
            }

            extraction = extractScrapedResult(htmlContent, keyword.device, keyword.domain);
         }

         if (extraction && Array.isArray(extraction.organic)) {
            const organicResults = extraction.organic;
            const serp = getSerp(keyword.domain, organicResults);
            
            // Only compute map pack if the scraper supports it
            let computedMapPack = false;
            let localResults: any[] = [];
            if (scraperObj?.supportsMapPack !== false) {
               const businessName = (settings as ExtendedSettings).business_name ?? null;
               computedMapPack = typeof extraction.mapPackTop3 === 'boolean'
                  ? extraction.mapPackTop3
                  : computeMapPackTop3(keyword.domain, res, businessName);
               
               // Extract local results from the response payload
               const debugMode = process.env.NODE_ENV === 'development';
               localResults = extractLocalResultsFromPayload(res, debugMode);
               if (debugMode && keyword.device === DEVICE_MOBILE) {
                  logger.debug(`[MAP_PACK] Mobile keyword: ${keyword.keyword}, mapPackTop3: ${computedMapPack}, localResults count: ${localResults.length}`);
               }
            }

            refreshedResults = {
               ID: keyword.ID,
               keyword: keyword.keyword,
               position: serp.position,
               url: serp.url,
               result: organicResults,
               mapPackTop3: computedMapPack,
               localResults,
               error: false,
            };
            // Only log on retries or if in top 3 map pack (significant event)
            if (attempt > 0 || computedMapPack) {
               logger.info('Keyword scraped', {
                  keyword: keyword.keyword,
                  device: keyword.device || 'desktop',
                  position: serp.position,
                  mapPackTop3: computedMapPack,
                  attempt: attempt + 1
               });
            }
            return refreshedResults; // Success, return immediately
         } else {
            // Enhanced error extraction for empty results
            const errorInfo = serializeError(
              res.request_info?.error || res.error_message || res.detail || res.error
              || 'No valid scrape result returned',
            );
            const statusCode = res.status || 'No Status';
            const errorMessage = `[${statusCode}] ${errorInfo}`;
            lastError = errorMessage;
            
            if (attempt === maxRetries) {
               throw new Error(errorMessage);
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
            continue;
         }
      } catch (error:any) {
         lastError = error;
         
         // Only log on final attempt to avoid spam
         if (attempt === maxRetries) {
            // Final attempt failed, process the error
            const errorMessage = handleProxyError(error, settings);
            refreshedResults.error = errorMessage;
            logger.error('Keyword scraping failed', error, { 
               keyword: keyword.keyword,
               attempts: maxRetries + 1,
               errorMessage 
            });
            break;
         } else {
            // Silent retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
            continue;
         }
      }
   }

   if (lastError && (refreshedResults.error === true || refreshedResults.error === undefined)) {
      refreshedResults = {
         ...refreshedResults,
         error: serializeError(lastError),
      };
   }

   return refreshedResults;
};

/**
 * Extracts the Google Search result as object array from the Google Search's HTML content
 * and determines whether the tracked domain appears inside the map pack.
 * @param {string} content - scraped google search page html data.
 * @param {string} device - The device of the keyword.
 * @param {string} [domain] - The tracked domain, used to detect map-pack membership.
 * @returns {{ organic: SearchResult[]; mapPackTop3: boolean }}
 */
const GOOGLE_REDIRECT_PATHS = ['/url', '/interstitial', '/imgres', '/aclk', '/link'];
const GOOGLE_REDIRECT_PARAMS = ['url', 'q', 'imgurl', 'target', 'dest', 'u', 'adurl'];

const ensureAbsoluteURL = (value: string | undefined | null, base: string = GOOGLE_BASE_URL): string | null => {
   if (!value) { return null; }
   const trimmedValue = value.trim();
   if (!trimmedValue) { return null; }

   if (trimmedValue.startsWith('//')) {
      try {
         return new URL(`https:${trimmedValue}`).toString();
      } catch (error: any) {
         logger.error('[ERROR] Failed to normalise protocol-relative URL', error, { url: trimmedValue });
         return null;
      }
   }

   const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedValue);
   if (hasScheme) {
      try {
         return new URL(trimmedValue).toString();
      } catch (error: any) {
         logger.error('[ERROR] Failed to normalise absolute URL', error, { url: trimmedValue });
         return null;
      }
   }

   if (trimmedValue.startsWith('/')) {
      try {
         return new URL(trimmedValue, base).toString();
      } catch (error: any) {
         logger.error('[ERROR] Failed to resolve relative URL', error, { url: trimmedValue });
         return null;
      }
   }

   try {
      return new URL(`https://${trimmedValue}`).toString();
   } catch (error: any) {
      logger.error('[ERROR] Failed to coerce host-only URL', error, { url: trimmedValue });
      return null;
   }
};

const normaliseGoogleHref = (href: string | undefined | null): string | null => {
   if (!href) { return null; }

   let resolvedURL: URL;
   try {
      resolvedURL = new URL(href, GOOGLE_BASE_URL);
   } catch (error: any) {
      logger.error('Unable to resolve SERP href', error, { href });
      return ensureAbsoluteURL(href);
   }

   const isRedirectPath = GOOGLE_REDIRECT_PATHS.some((redirectPath) => resolvedURL.pathname.startsWith(redirectPath));

   if (isRedirectPath) {
      for (let i = 0; i < GOOGLE_REDIRECT_PARAMS.length; i += 1) {
         const redirectParam = GOOGLE_REDIRECT_PARAMS[i];
         const candidate = resolvedURL.searchParams.get(redirectParam);
         const absoluteCandidate = ensureAbsoluteURL(candidate, resolvedURL.origin);
         if (absoluteCandidate) {
            return absoluteCandidate;
         }
      }
   }

   return resolvedURL.toString();
};

const collectCandidateWebsiteLinks = ($: cheerio.CheerioAPI): string[] => {
   const candidates: string[] = [];
   const pushCandidate = (value: string | undefined | null) => {
      if (value && value.trim()) {
         candidates.push(value.trim());
      }
   };

   $('div.VkpGBb, div[data-latlng], div[data-cid]').slice(0, 3).each((_, element) => {
      const el = $(element);
      pushCandidate(el.find('a[data-url]').attr('data-url'));
      pushCandidate(el.attr('data-url'));
      const websiteAnchor = el.find('a[href]').filter((__, anchor) => {
         const text = $(anchor).text().toLowerCase();
         return text.includes('website') || text.includes('menu');
      }).first();
      pushCandidate(websiteAnchor.attr('href'));
   });

   if (candidates.length === 0) {
      $('a[data-url]').slice(0, 6).each((_, anchor) => {
         pushCandidate($(anchor).attr('data-url'));
      });
   }

   if (candidates.length === 0) {
      $('a[href*="maps/place"]').slice(0, 6).each((_, anchor) => {
         pushCandidate($(anchor).attr('href'));
      });
   }

   return candidates;
};

const detectMapPackFromHtml = (
   $: cheerio.CheerioAPI,
   rawHtml: string,
   domain?: string,
): boolean => {
   if (!domain) { return false; }
   const domainHost = normaliseDomainHost(domain);
   if (!domainHost) { return false; }

   const candidates = collectCandidateWebsiteLinks($);

   if (candidates.length === 0 && rawHtml) {
      const websiteRegex = /"website":"(.*?)"/g;
      let match: RegExpExecArray | null;
      while ((match = websiteRegex.exec(rawHtml)) !== null && candidates.length < 6) {
         const value = match[1]
            .replace(/\\u002F/g, '/')
            .replace(/\\u003A/g, ':');
         if (value) {
            candidates.push(value);
         }
      }
   }

   return candidates.some((candidate) => doesUrlMatchDomainHost(domainHost, candidate));
};

export const extractScrapedResult = (
   content: string,
   device: string,
   domain?: string,
): { organic: SearchResult[]; mapPackTop3: boolean } => {
   const extractedResult: SearchResult[] = [];

   const $ = cheerio.load(content);
   const hasValidContent = [...$('body').find('#search'), ...$('body').find('#rso')];
   if (hasValidContent.length === 0) {
      const msg = 'Scraped search results do not adhere to expected format. Unable to parse results';
      logger.error(msg);
      throw new Error(msg);
   }

   const hasNumberofResult = $('body').find('#search  > div > div');
   const searchResultItems = hasNumberofResult.find('h3');
   let lastPosition = 0;

   for (let i = 0; i < searchResultItems.length; i += 1) {
      if (searchResultItems[i]) {
         const title = $(searchResultItems[i]).html();
         const rawURL = $(searchResultItems[i]).closest('a').attr('href');
         const normalisedURL = normaliseGoogleHref(rawURL);
         if (title && normalisedURL) {
            lastPosition += 1;
            extractedResult.push({ title, url: normalisedURL, position: lastPosition });
         }
      }
   }

   // Mobile Scraper
   if (extractedResult.length === 0 && device === DEVICE_MOBILE) {
      const items = $('body').find('#rso > div');
      for (let i = 0; i < items.length; i += 1) {
         const item = $(items[i]);
         const linkDom = item.find('a[role="presentation"]');
         if (linkDom) {
            const rawURL = linkDom.attr('href');
            const titleDom = linkDom.find('[role="link"]');
            const title = titleDom ? titleDom.text() : '';
            const normalisedURL = normaliseGoogleHref(rawURL);
            if (title && normalisedURL) {
               lastPosition += 1;
               extractedResult.push({ title, url: normalisedURL, position: lastPosition });
            }
         }
      }
   }

   const mapPackTop3 = detectMapPackFromHtml($, content, domain);
   return { organic: extractedResult, mapPackTop3 };
};

/**
 * Find in the domain's position from the extracted search result.
 * @param {string} domainURL - URL Name to look for.
 * @param {SearchResult[]} result - The search result array extracted from the Google Search result.
 * @returns {SERPObject}
 */
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

export const getSerp = (domainURL:string, result:SearchResult[]) : SERPObject => {
   if (result.length === 0 || !domainURL) { return { position: 0, url: '' }; }

   let URLToFind: URL;
   try {
      URLToFind = domainURL.includes('://') ? new URL(domainURL) : new URL(`https://${domainURL}`);
   } catch (error: any) {
      logger.error('Invalid domain URL provided', error, { domainURL });
      return { position: 0, url: '' };
   }

   const targetHost = URLToFind.hostname;
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
         return parsedURL.hostname === targetHost && itemPath === targetPath;
      }
      return parsedURL.hostname === targetHost;
   });

   const foundItem = matchingItems.length > 0
      ? matchingItems.reduce((best, item) => (item.position < best.position ? item : best))
      : undefined;

   return { position: foundItem ? foundItem.position : 0, url: foundItem && foundItem.url ? foundItem.url : '' };
};

/**
 * When a Refresh request is failed, automatically add the keyword id to a failed_queue.json file
 * so that the retry cron tries to scrape it every hour until the scrape is successful.
 * @param {string} keywordID - The keywordID of the failed Keyword Scrape.
 * @returns {void}
 */
export const retryScrape = async (keywordID: number) : Promise<void> => {
   await retryQueueManager.addToQueue(keywordID);
};

/**
 * When a Refresh request is completed, remove it from the failed retry queue.
 * @param {string} keywordID - The keywordID of the failed Keyword Scrape.
 * @returns {void}
 */
export const removeFromRetryQueue = async (keywordID: number) : Promise<void> => {
   await retryQueueManager.removeFromQueue(keywordID);
};
