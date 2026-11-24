import Domain from '../../../../database/models/domain';
import { logger } from '../../../../utils/logger';
import { createRoute, fail, json, type ApiContext } from '../../../../utils/apiLogging';
import { parseQuery } from '../../../../utils/api/validate';
import { formatDomainPlain } from '../../../../utils/domainsList';


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

      // The same mapper as the domain list and the domain page: credentials masked, empty columns filled in
      return json({ domain: formatDomainPlain(foundDomain.get({ plain: true }) as unknown as Record<string, unknown>) });
   } catch (error) {
      logger.error('Getting Domain: ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Loading Domain', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'domain', GET: getDomain });
