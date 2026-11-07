// Connects the models to the database. Server components import these loaders directly, without an API route
// that would otherwise have loaded it first.
import '../database/database';
import Domain from '../database/models/domain';
import getdomainStats from './domains';
import { maskSearchConsole } from './maskSearchConsole';
import { maskDomainScraperSettings, parseDomainScraperSettings } from './domainScraperSettings';
import normalizeDomainBooleans from './normalizeDomain';

/**
 * Reads every domain with credentials masked, the same shape `GET /api/serp/domains` returns.
 * Shared by the API handler and by server components so both see identical data.
 * Pass `withStats` to attach keyword counts and Search Console totals.
 */
export const loadDomains = async (withStats = false): Promise<DomainType[]> => {
   const allDomains: Domain[] = await Domain.findAll();
   const formattedDomains: DomainType[] = allDomains.map((el) => {
      const domainPlain = el.get({ plain: true }) as any;
      const searchConsoleData = maskSearchConsole(domainPlain?.search_console, String(domainPlain?.domain ?? domainPlain?.ID ?? ''));
      const persistedScraperSettings = parseDomainScraperSettings(domainPlain?.scraper_settings);
      const maskedDomain = {
         ...domainPlain,
         search_console: JSON.stringify(searchConsoleData),
         scraper_settings: maskDomainScraperSettings(persistedScraperSettings),
      } as DomainType;
      return normalizeDomainBooleans(maskedDomain);
   });
   return withStats ? getdomainStats(formattedDomains) : formattedDomains;
};
