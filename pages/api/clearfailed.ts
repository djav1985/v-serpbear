/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import verifyUser from '../../utils/verifyUser';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { retryQueueManager } from '../../utils/retryQueueManager';
import { errorResponse } from '../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'PUT') {
      return clearFailedQueue(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, { name: 'clearfailed' });

const clearFailedQueue = async (_req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (_req as ExtendedRequest).requestId;
   try {
      await retryQueueManager.clearQueue();
      logger.info('Failed queue cleared successfully');
      return res.status(200).json({ cleared: true });
   } catch (error) {
      logger.error('Error clearing failed queue', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error && error.message ? error.message : 'Error Clearing Failed Queue!';
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', message, requestId));
   }
};
