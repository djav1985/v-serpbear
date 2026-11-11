import {
   getAdwordsCredentials, getAdwordsKeywordIdeas, getLocalKeywordIdeas, updateLocalKeywordIdeas, withIdeasLock,
} from '../../../../utils/adwords';
import { createRoute, fail, json, getParam, readJson, type ApiContext } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import { SAFE_DOMAIN_NAME } from '../../../../utils/domainSlug';
import { RESEARCH_IDEAS_KEY } from '../../../../utils/domainIdeasFile';

/**
 * Reads the optional `domain` field. Missing or empty means the research page (no domain). A given value must be a
 * real domain name: letters, digits, dots and hyphens, with at least one dot. Returns null when it is invalid.
 */
const parseIdeasDomain = (raw: unknown): string | null => {
   if (raw === undefined || raw === null || raw === '') return '';
   if (typeof raw !== 'string') return null;
   const domain = raw.trim().toLowerCase();
   if (!domain) return '';
   return SAFE_DOMAIN_NAME.test(domain) && domain.includes('.') ? domain : null;
};

const getKeywordIdeas = async (req: Request, ctx: ApiContext) => {
   try {
      const domain = parseIdeasDomain(getParam(req, 'domain'));
      if (domain === null) {
         return fail(400, 'BAD_REQUEST', 'Invalid domain', ctx);
      }
      const keywordsDatabase = await getLocalKeywordIdeas(domain || RESEARCH_IDEAS_KEY);
      if (keywordsDatabase) {
         return json({ data: keywordsDatabase });
      }
      return fail(400, 'BAD_REQUEST', 'Error Loading Keyword Ideas.', ctx);
   } catch (error) {
      logger.error('Error fetching keyword ideas', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Loading Keyword Ideas.', ctx);
   }
};

const updateKeywordIdeas = async (req: Request, ctx: ApiContext) => {
   const errMsg = 'Error Fetching Keywords. Please try again!';
   const body = await readJson(req);
   if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail(400, 'BAD_REQUEST', 'Request body must be a JSON object.', ctx);
   }
   const {
      keywords = [],
      country: rawCountry = 'US',
      language = '1000',
      domain: rawDomain,
      seedSCKeywords = false,
      seedCurrentKeywords = false,
      seedType,
   } = body as Record<string, any>;

   if (!Array.isArray(keywords) || keywords.length > 1000 || keywords.some((item) => typeof item !== 'string')) {
      return fail(400, 'BAD_REQUEST', 'keywords must be a list of up to 1000 strings.', ctx);
   }

   logger.debug('[GOOGLE] updateKeywordIdeas called', {
      keywordsCount: keywords.length,
      country: rawCountry,
      language,
      domain: rawDomain,
      seedSCKeywords,
      seedCurrentKeywords,
      seedType,
   });

   if (!rawCountry || !language) {
      return fail(400, 'BAD_REQUEST', 'Please provide both country and language', ctx);
   }
   // These values go to the paid Google Ads API and into a file name, so check their shape first
   if (typeof rawCountry !== 'string' || !/^[A-Za-z]{2}$/.test(rawCountry)) {
      return fail(400, 'BAD_REQUEST', 'country must be a two-letter country code.', ctx);
   }
   // The country table is keyed by upper-case codes, so a lower-case code would find no geo target
   const country = rawCountry.toUpperCase();
   if (!/^\d{1,10}$/.test(String(language))) {
      return fail(400, 'BAD_REQUEST', 'language must be a Google Ads language ID.', ctx);
   }
   const domain = parseIdeasDomain(rawDomain);
   if (domain === null) {
      return fail(400, 'BAD_REQUEST', 'Invalid domain', ctx);
   }
   if (seedType === 'auto' && !domain) {
      return fail(400, 'BAD_REQUEST', 'Missing domain', ctx);
   }
   if (!seedType) {
      return fail(400, 'BAD_REQUEST', 'Missing seedType', ctx);
   }
   const validSeedTypes = ['auto', 'custom', 'tracking', 'searchconsole'];
   if (!validSeedTypes.includes(seedType)) {
      return fail(400, 'BAD_REQUEST', 'Invalid seedType', ctx);
   }
   if (seedType === 'custom' && (keywords.length === 0 && !seedSCKeywords && !seedCurrentKeywords)) {
      return fail(400, 'BAD_REQUEST', 'Error Fetching Keywords. Please Provide one of these: keywords, seedSCKeywords or seedCurrentKeywords', ctx);
   }
   try {
      const adwordsCreds = await getAdwordsCredentials();
      const { client_id, client_secret, developer_token, account_id, refresh_token } = adwordsCreds || {};
      
      logger.debug('[GOOGLE] Google Ads credentials check', {
         hasCredentials: !!adwordsCreds,
         hasClientId: !!client_id,
         hasClientSecret: !!client_secret,
         hasDeveloperToken: !!developer_token,
         hasAccountId: !!account_id,
         hasRefreshToken: !!refresh_token,
      });
      
      if (!adwordsCreds || !client_id || !client_secret || !developer_token || !account_id || !refresh_token) {
         logger.error('Google Ads credentials not configured', undefined, { adwordsCreds: !!adwordsCreds });
         return fail(500, 'INTERNAL_SERVER_ERROR', 'Google Ads credentials not configured', ctx);
      }
      const ideaOptions = { country, language, keywords, domain, seedSCKeywords, seedCurrentKeywords, seedType };
      
      logger.debug('[GOOGLE] Calling getAdwordsKeywordIdeas', { ideaOptions });
      
      try {
         const keywordIdeas = await getAdwordsKeywordIdeas(adwordsCreds, ideaOptions);
         
         logger.debug('[GOOGLE] getAdwordsKeywordIdeas result', {
            hasResults: !!keywordIdeas,
            isArray: Array.isArray(keywordIdeas),
            count: Array.isArray(keywordIdeas) ? keywordIdeas.length : 0,
         });
         
         if (keywordIdeas && Array.isArray(keywordIdeas) && keywordIdeas.length > 0) {
            logger.info('[GOOGLE] Successfully fetched keyword ideas', { count: keywordIdeas.length });
            return json({ keywords: keywordIdeas });
         }
         // Surface empty result sets as a not-found condition so the client can warn the user appropriately
         logger.debug('[GOOGLE] No keyword ideas returned by Google Ads', { ideaOptions });
         return fail(404, 'NOT_FOUND', 'No keyword ideas were returned for these keywords.', ctx);
      } catch (error: any) {
         logger.error('Error fetching keyword ideas from Google Ads', error instanceof Error ? error : new Error(String(error)), {
            message: error?.message,
            ideaOptions,
         });
         // Only the "no seed keywords" messages are about the request; everything else stays in the log
         const seedMessage = typeof error?.message === 'string' && /^No (tracked|search console) keywords found for this domain$/.test(error.message);
         if (seedMessage) {
            return fail(400, 'BAD_REQUEST', error.message, ctx);
         }
         return fail(502, 'BAD_GATEWAY', errMsg, ctx);
      }
   } catch (error) {
      logger.error('Error in updateKeywordIdeas', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', errMsg, ctx);
   }
};

const favoriteKeywords = async (req: Request, ctx: ApiContext) => {
   const errMsg = 'Error Favorating Keyword Idea. Please try again!';
   const rawBody = await readJson(req);
   const { keywordID = '', domain: rawDomain } = (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody : {}) as { keywordID?: string, domain?: unknown };

   if (!keywordID) {
      return fail(400, 'BAD_REQUEST', 'Missing Necessary data. Please provide a keywordID value.', ctx);
   }
   const parsedDomain = parseIdeasDomain(rawDomain);
   if (parsedDomain === null) {
      return fail(400, 'BAD_REQUEST', 'Invalid domain', ctx);
   }
   const domain = parsedDomain || RESEARCH_IDEAS_KEY;

   try {
      // Read and write under one lock, so two toggles at once cannot drop each other's favourite
      const result = await withIdeasLock(domain, async () => {
         const keywordsDatabase = await getLocalKeywordIdeas(domain);
         if (!keywordsDatabase || !keywordsDatabase.keywords) return null;
         const theKeyword = keywordsDatabase.keywords.find((kw) => kw.uid === keywordID);
         const existingKeywords = keywordsDatabase.favorites || [];
         const newFavorites = [...existingKeywords];
         const existingKeywordIndex = newFavorites.findIndex((kw) => kw.uid === keywordID);
         if (existingKeywordIndex > -1) {
            newFavorites.splice(existingKeywordIndex, 1);
         } else if (theKeyword) newFavorites.push(theKeyword);

         const updated = await updateLocalKeywordIdeas(domain, { favorites: newFavorites });
         return updated ? newFavorites : null;
      });

      if (result) {
         return json({ keywords: result, error: '' });
      }

      return fail(400, 'BAD_REQUEST', errMsg, ctx);
   } catch (error) {
      logger.error('Error favorating keyword idea', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', errMsg, ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'ideas', GET: getKeywordIdeas, POST: updateKeywordIdeas, PUT: favoriteKeywords });
