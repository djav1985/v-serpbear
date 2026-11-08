/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import verifyUser from '../../../utils/verifyUser';
import {
   getAdwordsCredentials, getAdwordsKeywordIdeas, getLocalKeywordIdeas, updateLocalKeywordIdeas, withIdeasLock,
} from '../../../utils/adwords';
import { withApiLogging } from '../../../utils/apiLogging';
import { logger } from '../../../utils/logger';
import { errorResponse } from '../../../utils/api/response';
import { SAFE_DOMAIN_NAME } from '../../../utils/domainSlug';
import { RESEARCH_IDEAS_KEY } from '../../../utils/domainIdeasFile';

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

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      return getKeywordIdeas(req, res);
   }
   if (req.method === 'POST') {
      return updateKeywordIdeas(req, res);
   }
   if (req.method === 'PUT') {
      return favoriteKeywords(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
};

const getKeywordIdeas = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   try {
      const domain = parseIdeasDomain(req.query.domain);
      if (domain === null) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid domain', requestId));
      }
      const keywordsDatabase = await getLocalKeywordIdeas(domain || RESEARCH_IDEAS_KEY);
      if (keywordsDatabase) {
         return res.status(200).json({ data: keywordsDatabase });
      }
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Error Loading Keyword Ideas.', requestId));
   } catch (error) {
      logger.error('Error fetching keyword ideas', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Loading Keyword Ideas.', requestId));
   }
};

const updateKeywordIdeas = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const errMsg = 'Error Fetching Keywords. Please try again!';
   if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Request body must be a JSON object.', requestId));
   }
   const {
      keywords = [],
      country: rawCountry = 'US',
      language = '1000',
      domain: rawDomain,
      seedSCKeywords = false,
      seedCurrentKeywords = false,
      seedType,
   } = req.body;

   if (!Array.isArray(keywords) || keywords.length > 1000 || keywords.some((item) => typeof item !== 'string')) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keywords must be a list of up to 1000 strings.', requestId));
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
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Please provide both country and language', requestId));
   }
   // These values go to the paid Google Ads API and into a file name, so check their shape first
   if (typeof rawCountry !== 'string' || !/^[A-Za-z]{2}$/.test(rawCountry)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'country must be a two-letter country code.', requestId));
   }
   // The country table is keyed by upper-case codes, so a lower-case code would find no geo target
   const country = rawCountry.toUpperCase();
   if (!/^\d{1,10}$/.test(String(language))) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'language must be a Google Ads language ID.', requestId));
   }
   const domain = parseIdeasDomain(rawDomain);
   if (domain === null) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid domain', requestId));
   }
   if (seedType === 'auto' && !domain) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Missing domain', requestId));
   }
   if (!seedType) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Missing seedType', requestId));
   }
   const validSeedTypes = ['auto', 'custom', 'tracking', 'searchconsole'];
   if (!validSeedTypes.includes(seedType)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid seedType', requestId));
   }
   if (seedType === 'custom' && (keywords.length === 0 && !seedSCKeywords && !seedCurrentKeywords)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Error Fetching Keywords. Please Provide one of these: keywords, seedSCKeywords or seedCurrentKeywords', requestId));
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
         return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Google Ads credentials not configured', requestId));
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
            return res.status(200).json({ keywords: keywordIdeas });
         }
         // Surface empty result sets as a not-found condition so the client can warn the user appropriately
         logger.debug('[GOOGLE] No keyword ideas returned by Google Ads', { ideaOptions });
         return res.status(404).json(errorResponse('NOT_FOUND', 'No keyword ideas were returned for these keywords.', requestId));
      } catch (error: any) {
         logger.error('Error fetching keyword ideas from Google Ads', error instanceof Error ? error : new Error(String(error)), {
            message: error?.message,
            ideaOptions,
         });
         // Only the "no seed keywords" messages are about the request; everything else stays in the log
         const seedMessage = typeof error?.message === 'string' && /^No (tracked|search console) keywords found for this domain$/.test(error.message);
         if (seedMessage) {
            return res.status(400).json(errorResponse('BAD_REQUEST', error.message, requestId));
         }
         return res.status(502).json(errorResponse('BAD_GATEWAY', errMsg, requestId));
      }
   } catch (error) {
      logger.error('Error in updateKeywordIdeas', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', errMsg, requestId));
   }
};

const favoriteKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const errMsg = 'Error Favorating Keyword Idea. Please try again!';
   const { keywordID = '', domain: rawDomain } = (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) as { keywordID?: string, domain?: unknown };

   if (!keywordID) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Missing Necessary data. Please provide a keywordID value.', requestId));
   }
   const parsedDomain = parseIdeasDomain(rawDomain);
   if (parsedDomain === null) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid domain', requestId));
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
         return res.status(200).json({ keywords: result, error: '' });
      }

      return res.status(400).json(errorResponse('BAD_REQUEST', errMsg, requestId));
   } catch (error) {
      logger.error('Error favorating keyword idea', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', errMsg, requestId));
   }
};

export default withApiLogging(handler, {
   name: 'ideas',
});
