import {
   getAdwordsCredentials, getAdwordsKeywordIdeas, getLocalKeywordIdeas, updateLocalKeywordIdeas, withIdeasLock,
} from '../../../../utils/adwords';
import { createRoute, fail, json, type ApiContext } from '../../../../utils/apiLogging';
import { parseBody, parseQuery } from '../../../../utils/api/validate';
import { logger } from '../../../../utils/logger';
import { SAFE_DOMAIN_NAME } from '../../../../utils/domainSlug';
import { RESEARCH_IDEAS_KEY } from '../../../../utils/domainIdeasFile';

type RequestBody = Record<string, unknown>;

const isRequestBody = (value: unknown): value is RequestBody => (
   value !== null && typeof value === 'object' && !Array.isArray(value)
);

const IDEA_SEED_TYPES = ['auto', 'custom', 'tracking', 'searchconsole'] as const;
type IdeaSeedType = typeof IDEA_SEED_TYPES[number];

const isIdeaSeedType = (value: unknown): value is IdeaSeedType => (
   typeof value === 'string' && IDEA_SEED_TYPES.includes(value as IdeaSeedType)
);

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
   const domain = parseIdeasDomain(parseQuery(req, 'ideas.get').domain);
   if (domain === null) {
      return fail(400, 'BAD_REQUEST', 'Invalid domain', ctx);
   }
   try {
      const keywordsDatabase = await getLocalKeywordIdeas(domain || RESEARCH_IDEAS_KEY);
      if (keywordsDatabase) {
         // The file written by a first generation has no favorites yet
         return json({ ideas: { ...keywordsDatabase, favorites: keywordsDatabase.favorites ?? [] } });
      }
      return fail(400, 'BAD_REQUEST', 'Error Loading Keyword Ideas.', ctx);
   } catch (error) {
      logger.error('Error fetching keyword ideas', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Loading Keyword Ideas.', ctx);
   }
};

const updateKeywordIdeas = async (req: Request, ctx: ApiContext) => {
   const errMsg = 'Error Fetching Keywords. Please try again!';
   // Types, the country and language formats, and the 1000-keyword limit are checked against the contract
   const {
      keywords = [],
      country: rawCountry = 'US',
      language = '1000',
      domain: rawDomain,
      seedSCKeywords = false,
      seedCurrentKeywords = false,
      seedType,
   } = await parseBody(req, 'ideas.generate');

   logger.debug('[GOOGLE] updateKeywordIdeas called', {
      keywordsCount: keywords.length,
      country: rawCountry,
      language,
      domain: rawDomain,
      seedSCKeywords,
      seedCurrentKeywords,
      seedType,
   });

   // The country table is keyed by upper-case codes, so a lower-case code would find no geo target
   const country = rawCountry.toUpperCase();
   const languageId = String(language);
   const domain = parseIdeasDomain(rawDomain);
   if (domain === null) {
      return fail(400, 'BAD_REQUEST', 'Invalid domain', ctx);
   }
   if (seedType === 'auto' && !domain) {
      return fail(400, 'BAD_REQUEST', 'Missing domain', ctx);
   }
   if (!isIdeaSeedType(seedType)) {
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
      const ideaOptions: Parameters<typeof getAdwordsKeywordIdeas>[1] = {
         country, language: languageId, keywords, domain, seedSCKeywords, seedCurrentKeywords, seedType,
      };
      
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
      } catch (error: unknown) {
         const errorMessage = error instanceof Error
            ? error.message
            : isRequestBody(error) && typeof error.message === 'string' ? error.message : undefined;
         logger.error('Error fetching keyword ideas from Google Ads', error instanceof Error ? error : new Error(String(error)), {
            message: errorMessage,
            ideaOptions,
         });
         // Only the "no seed keywords" messages are about the request; everything else stays in the log
         const seedMessage = typeof errorMessage === 'string' && /^No (tracked|search console) keywords found for this domain$/.test(errorMessage);
         if (seedMessage) {
            return fail(400, 'BAD_REQUEST', errorMessage, ctx);
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
   const { keywordID, domain: rawDomain } = await parseBody(req, 'ideas.favorite');
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
         return json({ favorites: result });
      }

      return fail(400, 'BAD_REQUEST', errMsg, ctx);
   } catch (error) {
      logger.error('Error favorating keyword idea', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', errMsg, ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'ideas', GET: getKeywordIdeas, POST: updateKeywordIdeas, PUT: favoriteKeywords });
