/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Keyword from '../../database/models/keyword';
import parseKeywords from '../../utils/parseKeywords';
import verifyUser from '../../utils/verifyUser';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { errorResponse } from '../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      return getKeyword(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, { name: 'keyword' });

const getKeyword = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.id || typeof req.query.id !== 'string') {
       return res.status(400).json(errorResponse('BAD_REQUEST', 'Keyword ID is Required!', requestId));
   }

   try {
      const idParam = req.query.id as string;
      const id = parseInt(idParam, 10);
      
      if (isNaN(id) || id <= 0) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid keyword ID provided', requestId));
      }
      
      const query = { ID: id };
      const foundKeyword:Keyword| null = await Keyword.findOne({ where: query });
      const pareseKeyword = foundKeyword && parseKeywords([foundKeyword.get({ plain: true })]);
      const keywords = pareseKeyword && pareseKeyword[0] ? pareseKeyword[0] : null;
      return res.status(200).json({ keyword: keywords });
   } catch (error) {
      logger.error('Getting Keyword: ', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Loading Keyword', requestId));
   }
};
