import Domain from '../../../../database/models/domain';
import { maskDomainScraperSettings, parseDomainScraperSettings } from '../../../../utils/domainScraperSettings';
import { logger } from '../../../../utils/logger';
import { createRoute, fail, json, type ApiContext } from '../../../../utils/apiLogging';
import { parseQuery } from '../../../../utils/api/validate';
import { maskSearchConsole } from '../../../../utils/maskSearchConsole';
import normalizeDomainBooleans from '../../../../utils/normalizeDomain';


const getDomain = async (req: Request, ctx: ApiContext) => {
   const { domain: domainParam } = parseQuery(req, 'domains.get');
   if (!domainParam.trim()) {
      return fail(400, 'BAD_REQUEST', 'Domain Name is Required!', ctx);
   }

   try {
      const query = { domain: domainParam.trim().toLowerCase() };
      const foundDomain:Domain| null = await Domain.findOne({ where: query });

      if (!foundDomain) {
         return fail(404, 'NOT_FOUND', 'Domain not found', ctx);
      }

      const parsedDomain = foundDomain.get({ plain: true }) as DomainType & { scraper_settings?: unknown };

      if (parsedDomain.search_console) {
         // The Search Console key stays on the server: only a 'true' marker says whether credentials are saved.
         parsedDomain.search_console = JSON.stringify(maskSearchConsole(parsedDomain.search_console, String(parsedDomain.domain || parsedDomain.ID || '')));
      }

      const parsedScraperSettings = maskDomainScraperSettings(
         parseDomainScraperSettings(parsedDomain?.scraper_settings),
      );
      parsedDomain.scraper_settings = parsedScraperSettings;

      return json({ domain: normalizeDomainBooleans(parsedDomain) });
   } catch (error) {
      logger.error('Getting Domain: ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Loading Domain', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'domain', GET: getDomain });
