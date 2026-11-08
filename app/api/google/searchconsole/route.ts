import Domain from '../../../../database/models/domain';
import { logger } from '../../../../utils/logger';
import { fetchDomainSCData, getSearchConsoleApiInfo, readLocalSCData } from '../../../../utils/searchConsole';
import { SAFE_DOMAIN_NAME } from '../../../../utils/domainSlug';
import { createRoute, fail, json, getParam, type ApiContext } from '../../../../utils/apiLogging';

const getDomainSearchConsoleData = async (req: Request, ctx: ApiContext) => {
   const domainParam = getParam(req, 'domain');
   if (!domainParam) return fail(400, 'BAD_REQUEST', 'Domain is Missing.', ctx);
   const requestedDomain = domainParam.trim().toLowerCase();
   if (!SAFE_DOMAIN_NAME.test(requestedDomain)) {
      return fail(400, 'BAD_REQUEST', 'Domain is Missing.', ctx);
   }
   const foundDomain: Domain | null = await Domain.findOne({ where: { domain: requestedDomain } });
   if (!foundDomain) {
      return fail(404, 'NOT_FOUND', 'Domain not found.', ctx);
   }
   const domainObj: DomainType = foundDomain.get({ plain: true });
   const domainname = domainObj.domain;
   const localSCData = await readLocalSCData(domainname);
   // Fresh means fetched within the last 24 hours. Empty windows are valid (a site with no recent clicks),
   // so they must not force a new Google request on every page load.
   const isFresh = !!localSCData && !!localSCData.lastFetched
      && Array.isArray(localSCData.threeDays) && Array.isArray(localSCData.sevenDays) && Array.isArray(localSCData.thirtyDays)
      && (new Date().getTime() - new Date(localSCData.lastFetched).getTime() <= 86400000);
   if (isFresh) {
      return json({ data: localSCData });
   }
   try {
      const scDomainAPI = domainObj?.search_console ? await getSearchConsoleApiInfo(domainObj) : { client_email: '', private_key: '' };
      const scGlobalAPI = await getSearchConsoleApiInfo({} as DomainType);
      if (!(scDomainAPI.client_email && scDomainAPI.private_key)
          && !(scGlobalAPI.client_email && scGlobalAPI.private_key)) {
         // Stays 200: "not integrated" is a normal state the pages render from the error field, not a failure
         return json({ data: null, error: 'Google Search Console is not Integrated.' });
      }
      const scData = await fetchDomainSCData(domainObj, scDomainAPI, scGlobalAPI);
      if (scData && scData.thirtyDays && scData.thirtyDays.length) {
         return json({ data: scData });
      }
      // The request was valid; Google returned nothing usable, so this is an upstream failure
      return fail(502, 'BAD_GATEWAY', 'Error Fetching Data from Google Search Console.', ctx);
   } catch (error) {
      logger.error('Error getting Search Console data for domain', error instanceof Error ? error : new Error(String(error)), { domain: domainname });
      return fail(502, 'BAD_GATEWAY', 'Error Fetching Data from Google Search Console.', ctx);
   }
};

const cronRefreshSearchConsoleData = async (_req: Request, ctx: ApiContext) => {
   try {
      const allDomainsRaw = await Domain.findAll();
      const Domains: DomainType[] = allDomainsRaw.map((el) => el.get({ plain: true }));
      let updatedCount = 0;
      let failedCount = 0;
      for (const domain of Domains) {
         try {
            const scDomainAPI = domain.search_console ? await getSearchConsoleApiInfo(domain) : { client_email: '', private_key: '' };
            const scGlobalAPI = await getSearchConsoleApiInfo({} as DomainType);
            if (scDomainAPI.client_email || scGlobalAPI.client_email) {
               const scData = await fetchDomainSCData(domain, scDomainAPI, scGlobalAPI);
               if (scData && scData.thirtyDays && scData.thirtyDays.length) {
                  logger.info(`[GOOGLE] Updated Search Console data for domain: ${domain.domain}`);
               } else {
                  logger.error(`Failed to update Search Console data for domain: ${domain.domain}`);
               }
               // A site with no recent data is still a successful fetch; only a missing result or a recorded fetch error is a failure
               if (scData && !scData.lastFetchError) {
                  updatedCount += 1;
               } else {
                  failedCount += 1;
               }
            } else {
               logger.debug(`[GOOGLE] No Search Console API credentials found for domain: ${domain.domain}`);
            }
         } catch (domainError) {
            failedCount += 1;
            logger.error(`Failed to update Search Console data for domain: ${domain.domain}`, domainError instanceof Error ? domainError : new Error(String(domainError)));
         }
      }
      // Every domain that was tried failed: report it instead of "completed". Partial failures stay 200 (logged above).
      if (failedCount > 0 && updatedCount === 0) {
         return fail(502, 'BAD_GATEWAY', 'Failed to update Search Console data for every domain.', ctx);
      }
      return json({ status: 'completed' });
   } catch (error) {
      logger.error('Error in CRON updating Search Console data', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error updating Search Console data.', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'searchconsole', GET: getDomainSearchConsoleData, POST: cronRefreshSearchConsoleData });
