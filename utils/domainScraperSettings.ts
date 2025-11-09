/// <reference path="../types.d.ts" />

import Cryptr from 'cryptr';

export type PersistedDomainScraperSettings = {
   scraper_type?: string | null;
   scraping_api?: string | null;
   business_name?: string | null;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const parseDomainScraperSettings = (
   raw: unknown,
): PersistedDomainScraperSettings | null => {
   if (!raw) { return null; }

   let payload: any = raw;
   if (typeof raw === 'string') {
      try {
         payload = JSON.parse(raw);
      } catch {
         return null;
      }
   }

   if (!payload || typeof payload !== 'object') {
      return null;
   }

   const scraperType = isNonEmptyString(payload.scraper_type) ? payload.scraper_type.trim() : null;
   const scrapingApi = isNonEmptyString(payload.scraping_api) ? payload.scraping_api : null;
   const businessName = isNonEmptyString(payload.business_name) ? payload.business_name.trim() : null;

   // Return null only if there's no meaningful data at all
   if (!scraperType && !scrapingApi && !businessName) {
      return null;
   }

   return { scraper_type: scraperType, scraping_api: scrapingApi, business_name: businessName };
};

export const maskDomainScraperSettings = (
   raw: PersistedDomainScraperSettings | null,
): DomainScraperSettings | null => {
   if (!raw) {
      return null;
   }

   // Return null only if there's no meaningful data at all
   if (!isNonEmptyString(raw.scraper_type) && !isNonEmptyString(raw.scraping_api) && !isNonEmptyString(raw.business_name)) {
      return null;
   }

   return {
      scraper_type: raw.scraper_type,
      has_api_key: isNonEmptyString(raw.scraping_api),
      business_name: raw.business_name,
   };
};

export const buildPersistedScraperSettings = (
   incoming: DomainScraperSettings | null | undefined,
   existing: PersistedDomainScraperSettings | null,
   cryptr: Cryptr,
): PersistedDomainScraperSettings | null => {
   if (!incoming) {
      return existing ?? null;
   }

   const nextType = isNonEmptyString(incoming.scraper_type) ? incoming.scraper_type.trim() : null;

   // Handle business_name - always preserve it regardless of scraper type
   let businessName: string | null = null;
   if (isNonEmptyString(incoming.business_name)) {
      businessName = incoming.business_name.trim();
   } else if (existing && isNonEmptyString(existing.business_name)) {
      businessName = existing.business_name;
   }

   if (!nextType) {
      // When reverting to system scraper, preserve business_name if it exists
      if (businessName) {
         return { scraper_type: null, scraping_api: null, business_name: businessName };
      }
      return null;
   }

   const hasNewKey = isNonEmptyString(incoming.scraping_api);
   const shouldClearKey = incoming.clear_api_key === true;

   const next: PersistedDomainScraperSettings = { scraper_type: nextType };

   if (hasNewKey) {
      next.scraping_api = cryptr.encrypt((incoming.scraping_api as string).trim());
   } else if (shouldClearKey) {
      next.scraping_api = null;
   } else if (existing && existing.scraper_type === nextType && isNonEmptyString(existing.scraping_api)) {
      next.scraping_api = existing.scraping_api;
   } else {
      next.scraping_api = null;
   }

   next.business_name = businessName;

   return next;
};

export const decryptDomainScraperSettings = (
   raw: PersistedDomainScraperSettings | null,
   cryptr: Cryptr,
): PersistedDomainScraperSettings | null => {
   if (!raw || !isNonEmptyString(raw.scraper_type)) {
      return null;
   }

   let decryptedKey: string | null = null;
   if (isNonEmptyString(raw.scraping_api)) {
      try {
         decryptedKey = cryptr.decrypt(raw.scraping_api);
      } catch (error) {
         console.warn('[WARN] Failed to decrypt domain scraper API key override.', error);
         decryptedKey = null;
      }
   }

   return {
      scraper_type: raw.scraper_type,
      scraping_api: decryptedKey,
      business_name: raw.business_name,
   };
};
