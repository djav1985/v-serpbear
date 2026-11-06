import allScrapers from '../scrapers/index';

/**
 * The scraper options exposed to the app as `available_scapers` in the settings payload.
 * Built from the registered scrapers so every settings response uses the same shape.
 */
export const buildAvailableScrapers = () => allScrapers.map((scraper) => ({
   label: scraper.name,
   value: scraper.id,
   allowsCity: !!scraper.allowsCity,
   supportsMapPack: !!scraper.supportsMapPack,
   scraperCountries: scraper.scraperCountries,
}));
