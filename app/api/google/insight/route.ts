import { getCountryInsight, getKeywordsInsight, getPagesInsight } from '../../../../utils/insight';
import { fetchDomainSCData, getSearchConsoleApiInfo, readLocalSCData } from '../../../../utils/searchConsole';
import { SAFE_DOMAIN_NAME } from '../../../../utils/domainSlug';
import Domain from '../../../../database/models/domain';
import { logger } from '../../../../utils/logger';
import { createRoute, fail, json, getParam, type ApiContext } from '../../../../utils/apiLogging';


const getDomainSearchConsoleInsight = async (req: Request, ctx: ApiContext) => {
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
   const getInsightFromSCData = (localSCData: SCDomainDataType): InsightDataType => {
      const { stats = [] } = localSCData;
      const countries = getCountryInsight(localSCData);
      const keywords = getKeywordsInsight(localSCData);
      const pages = getPagesInsight(localSCData);
      return { pages, keywords, countries, stats };
   };

   // First try and read the  Local SC Domain Data file.
   const localSCData = await readLocalSCData(domainname);

   if (localSCData) {
      const oldFetchedDate = localSCData.lastFetched;
      const fetchTimeDiff = new Date().getTime() - (oldFetchedDate ? new Date(oldFetchedDate as string).getTime() : 0);
      // Check if we have any data (not just stats) and it's within 24 hours
      const hasData = (localSCData.threeDays && localSCData.threeDays.length > 0)
                     || (localSCData.sevenDays && localSCData.sevenDays.length > 0)
                     || (localSCData.thirtyDays && localSCData.thirtyDays.length > 0);
      if (hasData && fetchTimeDiff <= 86400000) {
         const response = getInsightFromSCData(localSCData);
         return json({ data: response });
      }
   }

   // If the Local SC Domain Data file does not exist, fetch from Googel Search Console.
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
         const response = getInsightFromSCData(scData);
         return json({ data: response });
      }
      return fail(502, 'BAD_GATEWAY', 'Error Fetching Stats from Google Search Console.', ctx);
   } catch (error) {
      logger.error(`Error getting domain insight for: ${domainname}`, error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Internal error fetching Search Console stats.', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'insight', GET: getDomainSearchConsoleInsight });
