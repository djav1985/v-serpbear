import Keyword from '../../../../database/models/keyword';
import parseKeywords from '../../../../utils/parseKeywords';
import { logger } from '../../../../utils/logger';
import { createRoute, fail, json, type ApiContext } from '../../../../utils/apiLogging';
import { parseQuery } from '../../../../utils/api/validate';

const getKeyword = async (req: Request, ctx: ApiContext) => {
   // The id must be a positive whole number: "12abc" or "1.5" are refused by the contract
   const { id } = parseQuery(req, 'keywords.get');
   if (!Number.isSafeInteger(id)) {
      return fail(400, 'BAD_REQUEST', 'Invalid keyword ID provided', ctx);
   }

   try {
      const foundKeyword: Keyword | null = await Keyword.findOne({ where: { ID: id } });
      const parsed = foundKeyword && parseKeywords([foundKeyword.get({ plain: true })]);
      return json({ keyword: parsed && parsed[0] ? parsed[0] : null });
   } catch (error) {
      logger.error('Getting Keyword: ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Loading Keyword', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'keyword', GET: getKeyword });
