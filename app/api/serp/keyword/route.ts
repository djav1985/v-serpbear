import Keyword from '../../../../database/models/keyword';
import parseKeywords from '../../../../utils/parseKeywords';
import { logger } from '../../../../utils/logger';
import { createRoute, fail, getParam, json, type ApiContext } from '../../../../utils/apiLogging';

const getKeyword = async (req: Request, ctx: ApiContext) => {
   const idParam = getParam(req, 'id');
   if (!idParam) {
      return fail(400, 'BAD_REQUEST', 'Keyword ID is Required!', ctx);
   }

   try {
      // Plain digits only: "12abc" or "1.5" are not IDs
      const id = /^\d+$/.test(idParam) ? Number(idParam) : NaN;

      if (!Number.isSafeInteger(id) || id <= 0) {
         return fail(400, 'BAD_REQUEST', 'Invalid keyword ID provided', ctx);
      }

      const foundKeyword: Keyword | null = await Keyword.findOne({ where: { ID: id } });
      const parsed = foundKeyword && parseKeywords([foundKeyword.get({ plain: true })]);
      return json({ keyword: parsed && parsed[0] ? parsed[0] : null });
   } catch (error) {
      logger.error('Getting Keyword: ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Loading Keyword', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'keyword', GET: getKeyword });
