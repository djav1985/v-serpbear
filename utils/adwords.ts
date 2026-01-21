import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import Cryptr from 'cryptr';
import TTLCache from '@isaacs/ttlcache';
import { setTimeout as sleep } from 'timers/promises';
import Keyword from '../database/models/keyword';
import parseKeywords from './parseKeywords';
import countries from './countries';
import { readLocalSCData } from './searchConsole';

export const GOOGLE_ADS_API_VERSION = 'v21';

const memoryCache = new TTLCache({ max: 10000 });

type keywordIdeasMetrics = {
   competition: IdeaKeyword['competition'],
   monthlySearchVolumes: { month: string, year: string, monthlySearches: string }[],
   avgMonthlySearches: string,
   competitionIndex: string,
   lowTopOfPageBidMicros: string,
   highTopOfPageBidMicros: string
}

type keywordIdeasResponseItem = {
   keywordIdeaMetrics: keywordIdeasMetrics,
   text: string,
   keywordAnnotations: Object
};

type IdeaSettings = {
   country?: string;
   city?: string;
   state?: string;
   language?: string;
   keywords?: string[];
   domainUrl?: string;
   domainSlug?: string;
   seedType: 'auto' | 'custom' | 'tracking' | 'searchconsole';
   seedSCKeywords?: boolean;
   seedCurrentKeywords?: boolean;
}

type IdeaDatabaseUpdateData = {
   keywords?: IdeaKeyword[],
   settings?: IdeaSettings,
   favorites?: IdeaKeyword[]
}

type SearchConsoleKeyword = {
   keyword?: string,
   impressions?: number
};

const addSearchConsoleSeedKeywords = async (domainUrl: string, seedKeywords: string[]): Promise<void> => {
   const domainSCData = await readLocalSCData(domainUrl);
   if (!domainSCData || !Array.isArray(domainSCData.thirtyDays)) { return; }

   const scKeywords = domainSCData.thirtyDays as SearchConsoleKeyword[];
   [...scKeywords]
      .sort((a, b) => ((b.impressions ?? 0) > (a.impressions ?? 0) ? 1 : -1))
      .slice(0, 100)
      .forEach((sckeywrd) => {
         if (sckeywrd.keyword && !seedKeywords.includes(sckeywrd.keyword)) {
            seedKeywords.push(sckeywrd.keyword);
         }
      });
};

export type KeywordIdeasDatabase = {
   keywords: IdeaKeyword[],
   favorites: IdeaKeyword[],
   settings: IdeaSettings,
   updated: number
}

type SeedKeywordBaseOptions = {
   seedKeywords: string[];
   seedType: IdeaSettings['seedType'];
   domainUrl: string;
};

type SearchConsoleSeedOptions = SeedKeywordBaseOptions & { seedSCKeywords: boolean };
type TrackingSeedOptions = SeedKeywordBaseOptions & { seedCurrentKeywords: boolean };

const seedKeywordsFromSearchConsole = async ({
   seedKeywords,
   seedType,
   seedSCKeywords,
   domainUrl,
}: SearchConsoleSeedOptions): Promise<string[]> => {
   if (!domainUrl || (!seedSCKeywords && seedType !== 'searchconsole')) {
      return seedKeywords;
   }

   const domainSCData = await readLocalSCData(domainUrl);
   if (!domainSCData || !Array.isArray(domainSCData.thirtyDays)) {
      return seedKeywords;
   }

   const keywordSet = new Set(seedKeywords);
   const sortedSCKeywords = [...domainSCData.thirtyDays].sort((a, b) => b.impressions - a.impressions);

   sortedSCKeywords.slice(0, 100).forEach((sckeywrd) => {
      if (sckeywrd.keyword) {
         keywordSet.add(sckeywrd.keyword);
      }
   });

   return Array.from(keywordSet);
};

const seedKeywordsFromTracking = async ({
   seedKeywords,
   seedType,
   seedCurrentKeywords,
   domainUrl,
}: TrackingSeedOptions): Promise<string[]> => {
   if (!domainUrl || (!seedCurrentKeywords && seedType !== 'tracking')) {
      return seedKeywords;
   }

   const keywordSet = new Set(seedKeywords);
   const allKeywords:Keyword[] = await Keyword.findAll({
      where: { domain: domainUrl },
      order: [['volume', 'DESC']],
   });
   const currentKeywords: KeywordType[] = parseKeywords(allKeywords.map((e) => e.get({ plain: true })));

   currentKeywords.slice(0, 100).forEach((keyword) => {
      if (keyword.keyword) {
         keywordSet.add(keyword.keyword);
      }
   });

   return Array.from(keywordSet);
};

/**
 * The function `getAdwordsCredentials` reads and decrypts Google Ads credentials from the App settings file.
 * @returns {Promise<false | AdwordsCredentials>} returns either a decrypted `AdwordsCredentials` object if the settings are successfully decrypted,
 * or `false` if the decryption process fails.
 */
export const getAdwordsCredentials = async (): Promise<false | AdwordsCredentials> => {
   try {
      const settingsRaw = await readFile(`${process.cwd()}/data/settings.json`, { encoding: 'utf-8' });
      const settings: SettingsType = settingsRaw ? JSON.parse(settingsRaw) : {};
      let decryptedSettings: false | AdwordsCredentials = false;

      try {
         const cryptr = new Cryptr(process.env.SECRET as string);
         const client_id = settings.adwords_client_id ? cryptr.decrypt(settings.adwords_client_id) : '';
         const client_secret = settings.adwords_client_secret ? cryptr.decrypt(settings.adwords_client_secret) : '';
         const developer_token = settings.adwords_developer_token ? cryptr.decrypt(settings.adwords_developer_token) : '';
         const account_id = settings.adwords_account_id ? cryptr.decrypt(settings.adwords_account_id) : '';
         const refresh_token = settings.adwords_refresh_token ? cryptr.decrypt(settings.adwords_refresh_token) : '';

         decryptedSettings = {
            client_id,
            client_secret,
            developer_token,
            account_id,
            refresh_token,
         };
      } catch (error) {
         console.log('Error Decrypting Settings API Keys!', error);
      }

      return decryptedSettings;
   } catch (error) {
      console.log('[ERROR] Getting App Settings. ', error);
   }

   return false;
};

/**
 * retrieves an access token using Google Ads credentials for Google API authentication.
 * @param {AdwordsCredentials} credentials - The `credentials` to use to generate the access token,
 * @returns {Promise<string>} the fetched access token or an empty string if failed.
 */
export const getAdwordsAccessToken = async (credentials: AdwordsCredentials) => {
   const { client_id, client_secret, refresh_token } = credentials;
   try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/token', {
         method: 'POST',
         body: new URLSearchParams({ grant_type: 'refresh_token', client_id, client_secret, refresh_token }),
      });

      let tokens;
      try {
         const contentType = resp.headers.get('content-type');
         if (contentType && contentType.includes('application/json')) {
            tokens = await resp.json();
         } else {
            // Handle non-JSON responses from Google OAuth
            const textResponse = await resp.text();
            console.warn(`[ERROR] Google OAuth returned non-JSON response (${resp.status}):`, textResponse.substring(0, 200));
            return '';
         }
      } catch (parseError) {
         console.warn(`[ERROR] Failed to parse Google OAuth response (${resp.status}):`, parseError);
         return '';
      }

      //  console.log('token :', tokens);
      return tokens?.access_token || '';
   } catch (error) {
      console.log('[Error] Getting Google Account Access Token:', error);
      return '';
   }
};

/**
 * The function `getAdwordsKeywordIdeas` retrieves keyword ideas from Google Ads API based on
 * provided credentials and settings.
 * @param {AdwordsCredentials} credentials - an object containing Google Ads credentials needed to authenticate
 * the API request.
 * @param {IdeaSettings} adwordsDomainOptions - an object that contains settings and options for fetching
 * keyword ideas from Google Ads.
 * @param {boolean} [test=false] - a boolean flag that indicates whether the function is being run in a test mode or not.
 * When `test` is set to `true`, only 1 keyword is requested from adwords.
 * @returns returns an array of fetched keywords (`fetchedKeywords`) after processing the Google Ads API response.
 */
export const getAdwordsKeywordIdeas = async (credentials: AdwordsCredentials, adwordsDomainOptions: IdeaSettings, test: boolean = false) => {
   if (!credentials) { return false; }
   const { account_id, developer_token } = credentials;
   const {
      country = '2840',
      language = '1000',
      keywords = [],
      domainUrl = '',
      domainSlug = '',
      seedType,
      seedSCKeywords = false,
      seedCurrentKeywords = false,
   } = adwordsDomainOptions || {};

   let accessToken = '';

   const cachedAccessToken: string | false | undefined = memoryCache.get('adwords_token');
   if (cachedAccessToken && !test) {
      accessToken = cachedAccessToken;
   } else {
      accessToken = await getAdwordsAccessToken(credentials);
      memoryCache.delete('adwords_token');
      memoryCache.set('adwords_token', accessToken, { ttl: 3300000 });
   }

   let fetchedKeywords: IdeaKeyword[] = [];
   if (accessToken) {
      let seedKeywords = [...keywords];

      // Load Keywords from Google Search Console File.
      if ((seedType === 'searchconsole' || seedSCKeywords) && domainUrl) {
         await addSearchConsoleSeedKeywords(domainUrl, seedKeywords);
      }

      seedKeywords = await seedKeywordsFromSearchConsole({
         seedKeywords,
         seedType,
         seedSCKeywords,
         domainUrl,
      });

      seedKeywords = await seedKeywordsFromTracking({
         seedKeywords,
         seedType,
         seedCurrentKeywords,
         domainUrl,
      });

      if (['tracking', 'searchconsole'].includes(seedType) && seedKeywords.length === 0) {
         const errMessage = seedType === 'tracking'
            ? 'No tracked keywords found for this domain'
            : 'No search console keywords found for this domain';
         throw new Error(errMessage);
      }

      try {
         // API: https://developers.google.com/google-ads/api/rest/reference/rest/v21/customers/generateKeywordIdeas
         const customerID = account_id.replaceAll('-', '');
         const countryData = countries[country];
         const geoTargetConstants = countryData ? countryData[3] : undefined;

         if (!geoTargetConstants || Number(geoTargetConstants) === 0) {
            console.warn(`[ADWORDS] Skipping keyword idea lookup for ${country}: missing geo target constant.`);
            return [];
         }
         const reqPayload: Record<string, any> = {
            geoTargetConstants: [`geoTargetConstants/${geoTargetConstants}`],
            language: `languageConstants/${language}`,
            pageSize: test ? 1 : 1000,
         };
         if (['custom', 'searchconsole', 'tracking'].includes(seedType) && seedKeywords.length > 0) {
            reqPayload.keywordSeed = { keywords: seedKeywords.slice(0, 20) };
         }
         if (seedType === 'auto' && domainUrl) {
            reqPayload.siteSeed = { site: domainUrl };
         }

         const resp = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerID}:generateKeywordIdeas`, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'developer-token': developer_token,
               Authorization: `Bearer ${accessToken}`,
               'login-customer-id': customerID,
            },
            body: JSON.stringify(reqPayload),
         });

         let ideaData;
         let responseText = '';
         try {
            responseText = await resp.text();
            const contentType = resp.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
               try {
                  ideaData = JSON.parse(responseText);
               } catch (jsonParseError) {
                  console.warn(`[ERROR] Failed to parse Google Ads JSON response (${resp.status}):`, responseText.substring(0, 200), jsonParseError);
                  throw new Error(`Google Ads API error (${resp.status}): Invalid JSON response format`);
               }
            } else {
               // Handle non-JSON responses
               console.warn(`[ERROR] Google Ads returned non-JSON response (${resp.status}):`, responseText.substring(0, 200));
               throw new Error(`Google Ads API error (${resp.status}): Server returned non-JSON response`);
            }
         } catch (parseError) {
            if (parseError instanceof Error && parseError.message.includes('Google Ads API error')) {
               throw parseError;
            }
            const textResponse = responseText || 'Could not read response';
            console.warn(`[ERROR] Failed to parse Google Ads response (${resp.status}):`, textResponse.substring(0, 200), parseError);
            throw new Error(`Google Ads API error (${resp.status}): Invalid response format`);
         }

         if (resp.status !== 200) {
            const errMessage = ideaData?.error?.details?.[0]?.errors?.[0]?.message || 'Failed to fetch keyword ideas';
            console.log('[ERROR] Google Ads Response :', errMessage);
            throw new Error(errMessage);
         }

         if (ideaData?.results) {
            fetchedKeywords = extractAdwordskeywordIdeas(ideaData.results as keywordIdeasResponseItem[], { country, domain: domainSlug });
         }

         if (!test && fetchedKeywords.length > 0) {
            await updateLocalKeywordIdeas(domainSlug, { keywords: fetchedKeywords, settings: adwordsDomainOptions });
         }
      } catch (error) {
         console.log('[ERROR] Fetching Keyword Ideas from Google Ads :', error);
         throw error;
      }
   }

   return fetchedKeywords;
};

/**
 * The function `extractAdwordskeywordIdeas` processes keyword ideas data and returns an array of
 * IdeaKeyword objects sorted by average monthly searches.
 * @param {keywordIdeasResponseItem[]} keywordIdeas - The `keywordIdeas` parameter is an array of
 * objects that contain keyword ideas and their metrics.
 * @param options - The `options` parameter in the `extractAdwordskeywordIdeas` function is an object
 * that can contain two properties: `country` and `domain`.
 * @returns returns an array of `IdeaKeyword` array sorted based on the average monthly searches in descending order.
 */
const extractAdwordskeywordIdeas = (keywordIdeas: keywordIdeasResponseItem[], options: Record<string, string>) => {
   const keywords: IdeaKeyword[] = [];
   if (keywordIdeas.length > 0) {
      const { country = '', domain = '' } = options;
      keywordIdeas.forEach((kwRaw) => {
         const { text, keywordIdeaMetrics } = kwRaw;
         const { competition, competitionIndex = '0', avgMonthlySearches = '0', monthlySearchVolumes = [] } = keywordIdeaMetrics || {};
         if (keywordIdeaMetrics && text) {
            const searchVolumeTrend: Record<string, string> = {};
            const searchVolume = parseInt(avgMonthlySearches, 10);
            const compIndex = parseInt(competitionIndex, 10);
            
            if (isNaN(searchVolume) || searchVolume < 0) {
               return; // Skip invalid search volume
            }
            
            monthlySearchVolumes.forEach((item) => {
               searchVolumeTrend[`${item.month}-${item.year}`] = item.monthlySearches;
            });
            if (searchVolume > 10) {
               keywords.push({
                  uid: `${country.toLowerCase()}:${text.replaceAll(' ', '-')}`,
                  keyword: text,
                  competition,
                  competitionIndex: isNaN(compIndex) ? 0 : Math.max(0, compIndex),
                  monthlySearchVolumes: searchVolumeTrend,
                  avgMonthlySearches: searchVolume,
                  added: new Date().getTime(),
                  updated: new Date().getTime(),
                  country,
                  domain,
                  position: 999,
               });
            }
         }
      });
   }
   return keywords.sort((a: IdeaKeyword, b: IdeaKeyword) => (b.avgMonthlySearches > a.avgMonthlySearches ? 1 : -1));
};

/**
 * Retrieves keyword search volumes from Google Ads API based on provided keywords and their countries.
 * @param {KeywordType[]} keywords - The keywords that you want to get the search volume data for.
 * @returns returns a Promise that resolves to an object with a `volumes` and error `proprties`.
 *  The `volumes` propery which outputs `false` if the request fails and outputs the volume data in `{[keywordID]: volume}` object if succeeds.
 *  The `error` porperty that outputs the error message if any.
 */
export const getKeywordsVolume = async (keywords: KeywordType[]): Promise<{ error?: string, volumes: false | Record<number, number> }> => {
   const credentials = await getAdwordsCredentials();
   if (!credentials) { return { error: 'Cannot Load Google Ads Credentials', volumes: false }; }
   const { client_id, client_secret, developer_token, account_id } = credentials;
   if (!client_id || !client_secret || !developer_token || !account_id) {
      return { error: 'Google Ads Not Integrated Properly', volumes: false };
   }

   // Generate Access Token
   let accessToken = '';
   const cachedAccessToken: string | false | undefined = memoryCache.get('adwords_token');
   if (cachedAccessToken) {
      accessToken = cachedAccessToken;
   } else {
      accessToken = await getAdwordsAccessToken(credentials);
      memoryCache.delete('adwords_token');
      memoryCache.set('adwords_token', accessToken, { ttl: 3300000 });
   }
   const fetchedKeywords: Record<number, number> = {};

   if (accessToken) {
      // Group keywords based on their country.
      const keywordRequests: Record<string, KeywordType[]> = {};
      keywords.forEach((kw) => {
         const kwCountry = kw.country;
         if (keywordRequests[kwCountry]) {
            keywordRequests[kwCountry].push(kw);
         } else {
            keywordRequests[kwCountry] = [kw];
         }
      });

      // Send Requests to adwords based on grouped countries.
      // Since adwords does not allow sending country data for each keyword we are making requests for.
      for (const country in keywordRequests) {
         if (Object.hasOwn(keywordRequests, country) && keywordRequests[country].length > 0) {
            try {
               // API: https://developers.google.com/google-ads/api/rest/reference/rest/v21/customers/generateKeywordHistoricalMetrics
               const customerID = account_id.replaceAll('-', '');
               const countryData = countries[country];
               const geoTargetConstants = countryData ? countryData[3] : undefined;

               if (!geoTargetConstants || Number(geoTargetConstants) === 0) {
                  console.warn(`[ADWORDS] Skipping keyword volume lookup for ${country}: missing geo target constant.`);
                  continue;
               }
               const reqKeywords = keywordRequests[country].map((kw) => kw.keyword);
               const reqPayload: Record<string, any> = {
                  keywords: [...new Set(reqKeywords)],
                  geoTargetConstants: [`geoTargetConstants/${geoTargetConstants}`],
                  // language: `languageConstants/${language}`,
               };
               const resp = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerID}:generateKeywordHistoricalMetrics`, {
                  method: 'POST',
                  headers: {
                     'Content-Type': 'application/json',
                     'developer-token': developer_token,
                     Authorization: `Bearer ${accessToken}`,
                     'login-customer-id': customerID,
                  },
                  body: JSON.stringify(reqPayload),
               });

               let ideaData;
               try {
                  const contentType = resp.headers.get('content-type');
                  const responseText = await resp.text();
                  if (contentType && contentType.includes('application/json')) {
                     try {
                        ideaData = JSON.parse(responseText);
                     } catch (parseError) {
                        console.warn(`[ERROR] Failed to parse Google Ads Volume response (${resp.status}):`, responseText.substring(0, 200), parseError);
                        continue; // Skip this country and continue with next
                     }
                  } else {
                     // Handle non-JSON responses
                     console.warn(`[ERROR] Google Ads Volume API returned non-JSON response (${resp.status}):`, responseText.substring(0, 200));
                     continue; // Skip this country and continue with next
                  }
               } catch (error) {
                  console.warn(`[ERROR] Exception while handling Google Ads Volume response (${resp.status}):`, error);
                  continue; // Skip this country and continue with next
               }

               if (resp.status !== 200) {
                  console.log('[ERROR] Google Ads Volume Request Response :', ideaData?.error?.details[0]?.errors[0]?.message);
                  // console.log('Response from Google Ads :', JSON.stringify(ideaData, null, 2));
               }

               if (ideaData?.results) {
                  if (Array.isArray(ideaData.results) && ideaData.results.length > 0) {
                     const volumeDataObj: Map<string, number> = new Map();
                     ideaData.results.forEach((item: { keywordMetrics: keywordIdeasMetrics, text: string }) => {
                        const kwVol = item?.keywordMetrics?.avgMonthlySearches;
                        const parsedVolume = kwVol ? parseInt(kwVol, 10) : 0;
                        const validVolume = isNaN(parsedVolume) ? 0 : Math.max(0, parsedVolume);
                        volumeDataObj.set(`${country}:${item.text}`, validVolume);
                     });

                     keywordRequests[country].forEach((keyword) => {
                        const keywordKey = `${keyword.country}:${keyword.keyword}`;
                        if (volumeDataObj.has(keywordKey)) {
                           const volume = volumeDataObj.get(keywordKey);
                           if (volume !== undefined) {
                              fetchedKeywords[keyword.ID] = volume;
                           }
                        }
                     });
                     // console.log('fetchedKeywords :', fetchedKeywords);
                  }
               }
            } catch (error) {
               console.log('[ERROR] Fetching Keyword Volume from Google Ads :', error);
            }
            if (Object.keys(keywordRequests).length > 1) {
               await sleep(7000);
            }
         }
      }
   }

   return { volumes: fetchedKeywords };
};

/**
 * Updates volume data for keywords in the Keywords database using async/await and error handling.
 * @param {false | Record<number, number>} volumesData - The `volumesData` parameter can either be `false` or an object containing
 * keyword IDs as keys and corresponding volume data as values.
 * @returns returns a Promise that resolves to `true` if `volumesData` is not `false` else it returns `false`.
 */
export const updateKeywordsVolumeData = async (volumesData: false | Record<number, number>) => {
   if (volumesData === false) { return false; }

   for (const [keywordID, volume] of Object.entries(volumesData)) {
      const keyID = Number(keywordID);
      if (!Number.isNaN(keyID)) {
         const volumeData = typeof volume === 'number' ? volume : 0;
         await Keyword.update({ volume: volumeData }, { where: { ID: keyID } });
      }
   }

   return true;
};

/**
 * The function `getLocalKeywordIdeas` reads keyword ideas data from a local JSON file based on a domain slug and returns it as a Promise.
 * @param {string} domain - The `domain` parameter is the domain slug for which the keyword Ideas are fetched.
 * @returns returns either a `KeywordIdeasDatabase` object if the data is successfully retrieved , or it returns `false` if
 * there are no keywords found in the retrieved data or if an error occurs during the process.
 */
export const getLocalKeywordIdeas = async (domain: string): Promise<false | KeywordIdeasDatabase> => {
   try {
      const domainName = domain.replaceAll('-', '.').replaceAll('_', '-');
      const filename = `IDEAS_${domainName}.json`;
      const dataDir = path.resolve(process.cwd(), 'data');
      const filePath = path.resolve(dataDir, filename);
      // Ensure the filePath is within the data directory
      if (!filePath.startsWith(dataDir + path.sep)) {
         throw new Error('Invalid domain value for file access');
      }
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   const keywordIdeasRaw = await readFile(filePath, { encoding: 'utf-8' });
      const keywordIdeasData = JSON.parse(keywordIdeasRaw) as KeywordIdeasDatabase;
      if (keywordIdeasData.keywords) {
         return keywordIdeasData;
      }
      return false;
   } catch (error) {
      console.warn('[ERROR] Getting Local Ideas. ', error);
      return false;
   }
};

/**
 * The function `updateLocalKeywordIdeas` updates a local JSON file containing keyword ideas for a specific domain with new data provided.
 * @param {string} domain - The `domain` parameter is the domain slug for which the keyword Ideas are being updated.
 * @param {IdeaDatabaseUpdateData} data - The `data` parameter is an object of type `IdeaDatabaseUpdateData`.
 *  It contains the following properties: `keywords`, `favorites` & `settings`
 * @returns The function `updateLocalKeywordIdeas` returns a Promise<boolean>.
 */
export const updateLocalKeywordIdeas = async (domain: string, data: IdeaDatabaseUpdateData): Promise<boolean> => {
   try {
      const domainName = domain.replaceAll('-', '.').replaceAll('_', '-');
      const existingIdeas = await getLocalKeywordIdeas(domain);
      const filename = `IDEAS_${domainName}.json`;
      const dataDir = path.resolve(process.cwd(), 'data');
      const filePath = path.resolve(dataDir, filename);
      // Ensure the filePath is within the data directory
      if (!filePath.startsWith(dataDir + path.sep)) {
         throw new Error('Invalid domain value for file access');
      }
      const fileContent = { ...existingIdeas, updated: new Date().getTime() };
      if (Array.isArray(data.keywords)) {
         fileContent.keywords = data.keywords;
      }
      if (Array.isArray(data.favorites)) {
         fileContent.favorites = data.favorites;
      }
      if (data.settings) {
         fileContent.settings = data.settings;
      }

   // eslint-disable-next-line security/detect-non-literal-fs-filename
   await writeFile(filePath, JSON.stringify(fileContent, null, 2), 'utf-8');
      console.log(`Data saved to ${filename} successfully!`);
      return true;
   } catch (error) {
      console.error(`[Error] Saving data to IDEAS_${domain}.json: ${error}`);
      return false;
   }
};
