// Connects the models to the database. Server components import these loaders directly, without an API route
// that would otherwise have loaded it first.
import '../database/database';
import Cryptr from 'cryptr';
import { Op } from 'sequelize';
import Domain from '../database/models/domain';
import getdomainStats from './domains';
import { maskSearchConsole } from './maskSearchConsole';
import { maskDomainScraperSettings, parseDomainScraperSettings } from './domainScraperSettings';
import normalizeDomainBooleans from './normalizeDomain';
import { getAppSettings } from './appSettings';
import { logger } from './logger';
import { creditKey, creditsUnitFor, readScraperCredits, resolveCreditSource, supportsCredits } from './scraperCredits';
import { getUnknownErrorMessage } from './errorSerialization';

/**
 * Reads every domain with credentials masked, the same shape `GET /api/serp/domains` returns.
 * Shared by the API handler and by server components so both see identical data.
 * Pass `withStats` to attach keyword counts and Search Console totals.
 */
const formatDomainPlain = (domainPlain: Record<string, unknown>): DomainType => {
   const searchConsoleData = maskSearchConsole(domainPlain?.search_console, String(domainPlain?.domain ?? domainPlain?.ID ?? ''));
   const persistedScraperSettings = parseDomainScraperSettings(domainPlain?.scraper_settings);
   const maskedDomain = {
      ...domainPlain,
      search_console: JSON.stringify(searchConsoleData),
      scraper_settings: maskDomainScraperSettings(persistedScraperSettings),
   } as DomainType;
   return normalizeDomainBooleans(maskedDomain);
};

const formatDomain = (el: Domain): DomainType => formatDomainPlain(el.get({ plain: true }) as unknown as Record<string, unknown>);

/** Reads one domain by its route slug, with the same credential masking as the domain list. */
export const loadDomainBySlug = async (slug: string): Promise<DomainType | null> => {
   const domain = await Domain.findOne({ where: { slug } });
   return domain ? formatDomain(domain) : null;
};

export const loadDomains = async (withStats = false, selectedDomains?: string[]): Promise<DomainType[]> => {
   const allDomains: Domain[] = await Domain.findAll(selectedDomains ? { where: { domain: { [Op.in]: selectedDomains } } } : undefined);
   // Saved scraper balances, only needed for the cards. A failure here just leaves the credits line out.
   let credits: { settings: SettingsType, saved: Awaited<ReturnType<typeof readScraperCredits>>, cryptr: Cryptr | null } | null = null;
   if (withStats) {
      try {
         const secret = process.env.SECRET;
         credits = { settings: await getAppSettings(), saved: await readScraperCredits(), cryptr: secret ? new Cryptr(secret) : null };
      } catch (error) {
         logger.debug('[CREDITS] Could not load scraper credits for the domain list', { error: getUnknownErrorMessage(error) });
      }
   }
   const formattedDomains: DomainType[] = allDomains.map((el) => {
      const domainPlain = el.get({ plain: true }) as unknown as Record<string, unknown>;
      const formatted = formatDomainPlain(domainPlain);
      if (credits) {
         const source = resolveCreditSource(domainPlain, credits.settings, credits.cryptr);
         const entry = source.apiKey && supportsCredits(source.scraperId) ? credits.saved[creditKey(source.scraperId, source.apiKey)] : undefined;
         if (entry && typeof entry.remaining === 'number') {
            formatted.creditsRemaining = entry.remaining;
            formatted.creditsUnit = creditsUnitFor(source.scraperId);
         }
      }
      return formatted;
   });
   return withStats ? getdomainStats(formattedDomains) : formattedDomains;
};
