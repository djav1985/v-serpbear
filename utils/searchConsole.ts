/// <reference path="../types.d.ts" />

import { searchconsole_v1 } from '@googleapis/searchconsole';
import { JWT } from 'google-auth-library';
import Cryptr from 'cryptr';
import { readFile, unlink } from 'fs/promises';
import * as path from 'path';
import { countryAlphaTwoCodes } from './countries';
import { logger } from './logger';
import { atomicWriteFile } from './atomicWrite';
import { safeJsonParse } from './safeJsonParse';
import { readSettingsFile } from './settingsFile';
import { APP_TIMEZONE, SEARCH_CONSOLE_TIMEZONE, dateKeyInZone, daysAgoKey, todayKey } from './timezone';

export type SCDomainFetchError = {
   error: boolean,
   errorMsg: string,
}

type SCAPISettings = { client_email: string, private_key: string }

type fetchConsoleDataResponse = SearchAnalyticsItem[] | SearchAnalyticsStat[] | SCDomainFetchError;

// Search Console API maximum rows per searchanalytics.query request, and a cap on pages fetched per window
const SC_ROW_LIMIT = 25000;
const SC_MAX_PAGES = 40;

export const isSearchConsoleDataFreshForToday = (
   lastFetched?: string | null,
   timezoneSetting?: string,
): boolean => {
   const tz = timezoneSetting || APP_TIMEZONE;
   if (!lastFetched) return false;
   const parsedDate = new Date(lastFetched);
   if (Number.isNaN(parsedDate.getTime())) return false;
   return dateKeyInZone(parsedDate, tz) === todayKey(tz, new Date(Date.now()));
};

/**
 * Retrieves data from the Google Search Console API based on the provided domain name, number of days, and optional type.
 * @param {DomainType} domain - The domain for which you want to fetch search console data.
 * @param {number} days - number of days of data you want to fetch from the Search Console.
 * @param {string} [type] - (optional) specifies the type of data to fetch from the Search Console.
 * @param {SCAPISettings} [api] - (optional) specifies the Search Console API Information.
 * @returns {Promise<fetchConsoleDataResponse>}
 */
export const fetchSearchConsoleData = async (domain:DomainType, days:number, type?:string, api?:SCAPISettings): Promise<fetchConsoleDataResponse> => {
   if (!domain) return { error: true, errorMsg: 'Domain Not Provided!' };
   if (!api?.private_key || !api?.client_email) {
      return { error: true, errorMsg: 'Search Console API data is not available.' };
   }
   const domainName = domain.domain;
   const defaultSCSettings = { property_type: 'domain', url: '', client_email: '', private_key: '' };
   const domainSettings = safeJsonParse(domain.search_console, defaultSCSettings, {
      context: `domain ${domainName} search_console`,
   });
   const sCPrivateKey = api?.private_key || process.env.SEARCH_CONSOLE_PRIVATE_KEY || '';
   const sCClientEmail = api?.client_email || process.env.SEARCH_CONSOLE_CLIENT_EMAIL || '';

   try {
   const authClient = new JWT({
      email: (sCClientEmail || '').trim(),
      key: (sCPrivateKey).replaceAll('\\n', '\n'),
      scopes: [
        'https://www.googleapis.com/auth/webmasters.readonly',
      ],
   });
   // Search Console reports whole days in Pacific Time whatever zone is asked for, so the window is Pacific days
   // The window includes today, so "N days" starts N-1 days back: both ends are inclusive and it covers N calendar days
   const startDate = daysAgoKey(Math.max(days - 1, 0), SEARCH_CONSOLE_TIMEZONE);
   const endDate = todayKey(SEARCH_CONSOLE_TIMEZONE);
   const client = new searchconsole_v1.Searchconsole({ auth: authClient });
   // Params: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
   let requestBody:any = {
      startDate,
      endDate,
      type: 'web',
      rowLimit: SC_ROW_LIMIT,
      dataState: 'all',
      dimensions: ['query', 'device', 'country', 'page'],
   };
   if (type === 'stat') {
      requestBody = {
         startDate,
         endDate,
         rowLimit: SC_ROW_LIMIT,
         dataState: 'all',
         dimensions: ['date'],
      };
   }

      const siteUrl = domainSettings.property_type === 'url' && domainSettings.url ? domainSettings.url : `sc-domain:${domainName}`;
      // The API returns at most rowLimit rows per request, so page through with startRow until a short page
      const rawRows:SearchAnalyticsRawItem[] = [];
      for (let page = 0; page < SC_MAX_PAGES; page++) {
         const res = client.searchanalytics.query({
            siteUrl,
            requestBody: { ...requestBody, startRow: page * SC_ROW_LIMIT },
         });
         const resData:any = (await res).data;
         const pageRows:SearchAnalyticsRawItem[] = resData.rows || [];
         rawRows.push(...pageRows);
         if (pageRows.length < SC_ROW_LIMIT) break;
      }
      let finalRows:any[] = rawRows.map((item:SearchAnalyticsRawItem) => parseSearchConsoleItem(item, domainName));

      if (type === 'stat' && rawRows.length > 0) {
         finalRows = [];
         rawRows.forEach((row:SearchAnalyticsRawItem) => {
            finalRows.push({
               date: row.keys[0],
               clicks: row.clicks,
               impressions: row.impressions,
               ctr: row.ctr * 100,
               position: row.position,
            });
         });
      }

      return finalRows;
   } catch (err:any) {
      const qType = type === 'stat' ? '(stats)' : `(${days}days)`;
      const errorMsg = err?.response?.status && `${err?.response?.statusText}. ${err?.response?.data?.error_description}`;
      logger.error(`Search Console API error for ${domainName} ${qType}`, new Error(errorMsg || err?.code || 'Unknown error'));
      return { error: true, errorMsg: errorMsg || err?.code };
   }
};

/**
 * The function fetches search console data for a given domain and returns it in a structured format.
 * Domain level credentials take precedence over global credentials if both are provided.
 * @param {DomainType} domain - The domain for which to fetch search console data.
 * @param {SCAPISettings} [scDomainAPI] - Domain specific Search Console credentials.
 * @param {SCAPISettings} [scGlobalAPI] - Global Search Console credentials used as fallback.
 * @returns {Promise<SCDomainDataType|null>}
 */
export const fetchDomainSCData = async (
   domain:DomainType | null,
   scDomainAPI?: SCAPISettings,
   scGlobalAPI?: SCAPISettings,
): Promise<SCDomainDataType | null> => {
   if (!domain) {
      return null;
   }
   const days = [3, 7, 30];
   const domainName = domain.domain;
   const existingData = await readLocalSCData(domainName) || {
      threeDays: [], sevenDays: [], thirtyDays: [], lastFetched: '', lastFetchError: '', stats: [],
   } as SCDomainDataType;
   const scDomainData:SCDomainDataType = {
      threeDays: [],
      sevenDays: [],
      thirtyDays: [],
      lastFetched: existingData.lastFetched || '',
      lastFetchError: '',
      stats: [],
   };
   const apiCreds = (scDomainAPI?.client_email && scDomainAPI?.private_key)
      ? scDomainAPI
      : scGlobalAPI;
   if (apiCreds?.client_email && apiCreds?.private_key) {
      const theDomain = domain;
      for (const day of days) {
         const items = await fetchSearchConsoleData(theDomain, day, undefined, apiCreds);
         if (Array.isArray(items) && items.length > 0) {
            scDomainData.lastFetched = new Date().toJSON();
            if (day === 3) scDomainData.threeDays = items as SearchAnalyticsItem[];
            if (day === 7) scDomainData.sevenDays = items as SearchAnalyticsItem[];
            if (day === 30) scDomainData.thirtyDays = items as SearchAnalyticsItem[];
         } else if ((items as SCDomainFetchError)?.error) {
            scDomainData.lastFetchError = (items as SCDomainFetchError).errorMsg;
         }
      }
      const stats = await fetchSearchConsoleData(theDomain, 30, 'stat', apiCreds);
      if (Array.isArray(stats) && stats.length > 0) {
         scDomainData.stats = stats as SearchAnalyticsStat[];
      }
      // Keep the previous data for any window that failed to fetch, so a transient Google error does not
      // blank the stored data. Only the windows that returned rows are replaced.
      if (scDomainData.threeDays.length === 0) { scDomainData.threeDays = existingData.threeDays || []; }
      if (scDomainData.sevenDays.length === 0) { scDomainData.sevenDays = existingData.sevenDays || []; }
      if (scDomainData.thirtyDays.length === 0) { scDomainData.thirtyDays = existingData.thirtyDays || []; }
      if (!scDomainData.stats || scDomainData.stats.length === 0) { scDomainData.stats = existingData.stats || []; }
      const writeRes = await updateLocalSCData(domainName, scDomainData);
      if (!writeRes) {
         return null;
      }
   }
   return scDomainData;
};

/**
 * The function takes a raw search console item and a domain name as input and returns a parsed search analytics item.
 * @param {SearchAnalyticsRawItem} SCItem - The SCItem parameter is an object that represents a raw item from the Search Console API.
 * @param {string} domainName - The `domainName` parameter is a string that represents the domain name of the website.
 * @returns {SearchAnalyticsItem}.
 */
export const parseSearchConsoleItem = (SCItem: SearchAnalyticsRawItem, domainName: string): SearchAnalyticsItem => {
   const { clicks = 0, impressions = 0, ctr = 0, position = 0 } = SCItem;
   const keyword = SCItem.keys[0];
   const device = SCItem.keys[1] ? SCItem.keys[1].toLowerCase() : 'desktop';
   const countryCode = SCItem.keys[2] ? SCItem.keys[2].toUpperCase() : 'ZZ';
   const country = countryAlphaTwoCodes[countryCode] || countryCode;
   const rawPage = SCItem.keys[3] || '';
   const normalizedDomain = domainName.toLowerCase();
   let page = '';

   if (rawPage) {
      try {
         const url = new URL(rawPage);
         const hostLower = url.host.toLowerCase();
         const isRootDomain = hostLower === normalizedDomain || hostLower === `www.${normalizedDomain}`;
         const hostWithoutWWW = url.host.startsWith('www.') ? url.host.slice(4) : url.host;
         const suffix = `${url.pathname}${url.search}${url.hash}`;

         page = isRootDomain ? suffix : `${hostWithoutWWW}${suffix}`;
      } catch {
         const protoRegex = /^https?:\/\/(?:www\.)?/i;
         const withoutProtocol = rawPage.replace(protoRegex, '');
         const escapedDomain = normalizedDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
         const domainRegex = new RegExp(`^(?:${escapedDomain}|www\\.${escapedDomain})`, 'i');
         page = withoutProtocol.replace(domainRegex, '');
      }
   }

   if (page === '/' || page === '') {
      page = '';
   } else if (!page.startsWith('/')) {
      page = `/${page}`;
   }
   const uid = buildKeywordUid(country, device, keyword);

   return { keyword, uid, device, country, clicks, impressions, ctr: ctr * 100, position, page };
};

/**
 * Builds the key that joins a Search Console row to a tracked keyword. Matching ignores case and surrounding spaces,
 * because Search Console and the tracked keyword list do not always agree on capitalisation.
 */
export const buildKeywordUid = (country: string, device: string, keyword: string): string => (
   `${country.trim().toLowerCase()}:${device.trim().toLowerCase()}:${keyword.trim().toLowerCase().replaceAll(' ', '_')}`
);

/**
 * The function integrates search console data with a keyword object and returns the updated keyword object with the search console data.
 * @param {KeywordType} keyword - The `keyword` parameter is of type `KeywordType`, which is a custom type representing a keyword.
 * @param {SCDomainDataType} SCData - SCData is an object that contains search analytics data for different time periods
 * @returns {KeywordType}
 */
export const integrateKeywordSCData = (keyword: KeywordType, SCData:SCDomainDataType) : KeywordType => {
   const kuid = buildKeywordUid(keyword.country, keyword.device, keyword.keyword);
   // Stored rows may predate the case-insensitive key, so both sides are normalised when comparing
   const findRow = (rows?: SearchAnalyticsItem[]) => rows?.find((item) => (item.uid ?? '').trim().toLowerCase() === kuid);
   const impressions:any = { yesterday: 0, threeDays: 0, sevenDays: 0, thirtyDays: 0, avgSevenDays: 0, avgThreeDays: 0, avgThirtyDays: 0 };
   const visits :any = { yesterday: 0, threeDays: 0, sevenDays: 0, thirtyDays: 0, avgSevenDays: 0, avgThreeDays: 0, avgThirtyDays: 0 };
   const ctr:any = { yesterday: 0, threeDays: 0, sevenDays: 0, thirtyDays: 0, avgSevenDays: 0, avgThreeDays: 0, avgThirtyDays: 0 };
   const position:any = { yesterday: 0, threeDays: 0, sevenDays: 0, thirtyDays: 0, avgSevenDays: 0, avgThreeDays: 0, avgThirtyDays: 0 };

   const threeDaysData = findRow(SCData?.threeDays) || {};
   const sevenDaysData = findRow(SCData?.sevenDays) || {};
   const thirtyDaysData = findRow(SCData?.thirtyDays) || {};
   const totalData:any = { threeDays: threeDaysData, sevenDays: sevenDaysData, thirtyDays: thirtyDaysData };

   Object.keys(totalData).forEach((dataKey) => {
      let avgDataKey = 'avgThreeDays'; let divideBy = 3;
      if (dataKey === 'sevenDays') { avgDataKey = 'avgSevenDays'; divideBy = 7; }
      if (dataKey === 'thirtyDays') { avgDataKey = 'avgThirtyDays'; divideBy = 30; }
      // Actual Data
      impressions[dataKey] = totalData[dataKey].impressions || 0;
      visits[dataKey] = totalData[dataKey].clicks || 0;
      ctr[dataKey] = Math.round((totalData[dataKey].ctr || 0) * 100) / 100;
      position[dataKey] = totalData[dataKey].position ? Math.round(totalData[dataKey].position) : 0;
      // Average Data
      impressions[avgDataKey] = Math.round(impressions[dataKey] / divideBy);
      ctr[avgDataKey] = Math.round((ctr[dataKey] / divideBy) * 100) / 100;
      visits[avgDataKey] = Math.round(visits[dataKey] / divideBy);
      position[avgDataKey] = Math.round(position[dataKey] / divideBy);
   });
   const finalSCData = { impressions, visits, ctr, position };

   return { ...keyword, scData: finalSCData };
};

/**
 * Retrieves the Search Console API information for a given domain.
 * @param {DomainType} domain - The `domain` parameter is of type `DomainType`, which represents a
 * domain object. It likely contains information about a specific domain, such as its name, search
 * console settings, etc.
 * @returns an object of type `SCAPISettings`.
 */
export const getSearchConsoleApiInfo = async (domain: DomainType): Promise<SCAPISettings> => {
   const scAPIData = { client_email: '', private_key: '' };
   // Check if the Domain Has the API Data
   const domainSCSettings = safeJsonParse<Record<string, string> | null>(
      domain.search_console,
      null,
      { context: `domain ${domain.domain ?? ''} search_console` },
   );
   if (domainSCSettings && domainSCSettings.private_key) {
      if (!domainSCSettings.private_key.includes('BEGIN PRIVATE KEY')) {
         try {
            const cryptr = new Cryptr(process.env.SECRET as string);
            scAPIData.client_email = domainSCSettings.client_email ? cryptr.decrypt(domainSCSettings.client_email) : '';
            scAPIData.private_key = domainSCSettings.private_key ? cryptr.decrypt(domainSCSettings.private_key) : '';
         } catch (error) {
            logger.warn('Failed to decrypt domain-level Search Console credentials, falling back to global credentials', {
               domain: domain.domain,
               error: error instanceof Error ? error.message : String(error),
            });
            // Continue to fallback logic below
         }
      } else {
         scAPIData.client_email = domainSCSettings.client_email;
         scAPIData.private_key = domainSCSettings.private_key;
      }
   }
   // Check if the App Settings Has the API Data
   if (!scAPIData?.private_key) {
      try {
         const settings = await readSettingsFile();
         const cryptr = new Cryptr(process.env.SECRET as string);
         scAPIData.client_email = settings.search_console_client_email ? cryptr.decrypt(settings.search_console_client_email) : '';
         scAPIData.private_key = settings.search_console_private_key ? cryptr.decrypt(settings.search_console_private_key) : '';
      } catch (error) {
         logger.error('Unable to read app settings for Search Console credentials', undefined, { error: error instanceof Error ? error.message : String(error) });
         // Settings file doesn't exist or is invalid, continue with environment variables
      }
   }
   if (!scAPIData?.private_key && process.env.SEARCH_CONSOLE_PRIVATE_KEY && process.env.SEARCH_CONSOLE_CLIENT_EMAIL) {
      scAPIData.client_email = process.env.SEARCH_CONSOLE_CLIENT_EMAIL;
      scAPIData.private_key = process.env.SEARCH_CONSOLE_PRIVATE_KEY;
   }

   return scAPIData;
};

/**
 * Checks if the provided domain level Google Search Console API info is valid.
 * @param {DomainType} domain - The domain that represents the domain for which the SC API info is being checked.
 * @returns an object of type `{ isValid: boolean, error: string }`.
 */
export const checkSearchConsoleIntegration = async (domain: DomainType): Promise<{ isValid: boolean, error: string }> => {
   const res = { isValid: false, error: '' };
   const { client_email = '', private_key = '' } = safeJsonParse<DomainSearchConsole>(
      domain?.search_console,
      { client_email: '', private_key: '', property_type: 'domain', url: '' },
      { context: `domain ${domain?.domain ?? ''} search_console` },
   );
   const response = await fetchSearchConsoleData(domain, 3, undefined, { client_email, private_key });
   if (Array.isArray(response)) { res.isValid = true; }
   if ((response as SCDomainFetchError)?.errorMsg) { res.error = (response as SCDomainFetchError).errorMsg; }
   return res;
};

/**
 * The function reads and returns the domain-specific data stored in a local JSON file.
 * @param {string} domain - The `domain` parameter is a string that represents the domain for which the SC data is being read.
 * @returns {Promise<SCDomainDataType>}
 */
export const readLocalSCData = async (domain:string): Promise<SCDomainDataType|false> => {
   try {
      const filePath = getSafeSCDataFilePath(domain);
      if (!filePath) throw new Error('Invalid domain for file path');
      let currentQueueRaw: string;
      try {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         currentQueueRaw = await readFile(filePath, { encoding: 'utf-8' });
      } catch (readError) {
         // No data stored for this domain yet. Reading must not create a file as a side effect.
         if ((readError as NodeJS.ErrnoException)?.code === 'ENOENT') { return false; }
         throw readError;
      }
      const domainSCData = safeJsonParse<SCDomainDataType | false>(
         currentQueueRaw,
         false,
         { context: `local Search Console data for ${domain}` },
      );
      if (!domainSCData) {
         return false;
      }
      return domainSCData;
   } catch (error) {
      logger.warn(`Failed to read local Search Console data for domain: ${domain}`, { error: error instanceof Error ? error.message : String(error) });
      return false;
   }
};

/**
 * The function reads and returns the domain-specific data stored in a local JSON file.
 * @param {string} domain - The `domain` parameter is a string that represents the domain for which the SC data will be written.
 * @param {SCDomainDataType} scDomainData - an object that contains search analytics data for different time periods.
 * @returns {Promise<SCDomainDataType|false>}
 */
export const updateLocalSCData = async (domain:string, scDomainData?:SCDomainDataType): Promise<SCDomainDataType|false> => {
   try {
      const filePath = getSafeSCDataFilePath(domain);
      if (!filePath) throw new Error('Invalid domain for file path');
      
      const dataToWrite = scDomainData || { threeDays: [], sevenDays: [], thirtyDays: [], lastFetched: '', lastFetchError: '' };
      // A failed write must reach the caller as a failure, so it is not caught here
      await atomicWriteFile(filePath, JSON.stringify(dataToWrite), 'utf-8');
      return dataToWrite;
   } catch (error) {
      logger.error(`Failed to write local Search Console data for domain: ${domain}`, undefined, { error: error instanceof Error ? error.message : String(error) });
      return false;
   }
};

/**
 * The function removes the domain-specific Search Console data stored in a local JSON file.
 * @param {string} domain - The `domain` parameter is a string that represents the domain for which the SC data file will be removed.
 * @returns {Promise<boolean>} - Returns true if the file was removed or did not exist, false on real errors.
 */
export const removeLocalSCData = async (domain:string): Promise<boolean> => {
   const filePath = getSafeSCDataFilePath(domain);
   if (!filePath) return false;
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(filePath);
      return true;
   } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true;
      logger.error(`Failed to remove local Search Console data for domain: ${domain}`, undefined, { error: error instanceof Error ? error.message : String(error) });
      return false;
   }
};

/**
 * Helper to safely construct the SC data file path for a given domain.
 * Returns the absolute path if safe, or null if the domain is invalid.
 */
export function getSafeSCDataFilePath(domain: string): string | null {
   const domainName = (domain ?? '').trim();
   if (!domainName) {
      return null;
   }
   // Only allow alphanumeric, dash, dot, and underscore in domain - preserve dots for domains
   const safeDomain = domainName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
   const dataDir = path.resolve(process.cwd(), 'data');
   const fileName = `SC_${safeDomain}.json`;
   const filePath = path.resolve(dataDir, fileName);

   // Ensure the filePath is within the dataDir
   if (!filePath.startsWith(dataDir + path.sep)) {
      return null;
   }
   return filePath;
}
