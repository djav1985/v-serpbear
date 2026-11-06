export const REMOVED_SCRAPER_IDS = new Set(['proxy', 'scrapingant', 'scrapingrobot', 'spaceSerp']);

export const isRemovedScraperId = (value?: string | null): boolean => {
   if (typeof value !== 'string') {
      return false;
   }

   const normalizedValue = value.trim();
   return normalizedValue.length > 0 && REMOVED_SCRAPER_IDS.has(normalizedValue);
};

export const normalizeLegacyGlobalScraperType = (value?: string | null): string => {
   if (typeof value !== 'string') {
      return 'none';
   }

   const normalizedValue = value.trim();
   if (!normalizedValue || isRemovedScraperId(normalizedValue)) {
      return 'none';
   }

   return normalizedValue;
};

export const normalizeLegacyDomainScraperType = (value?: string | null): string | null => {
   if (typeof value !== 'string') {
      return null;
   }

   const normalizedValue = value.trim();
   if (!normalizedValue || isRemovedScraperId(normalizedValue)) {
      return null;
   }

   return normalizedValue;
};
