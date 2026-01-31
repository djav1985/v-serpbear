import type { NextApiRequest, NextApiResponse } from 'next';
import verifyUser from '../../utils/verifyUser';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { retryQueueManager } from '../../utils/retryQueueManager';

type SettingsGetResponse = {
   cleared?: boolean,
   error?: string,
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   if (req.method === 'PUT') {
      return clearFailedQueue(req, res);
   }
   return res.status(405).json({ error: 'Method not allowed' });
}

export default withApiLogging(handler, { name: 'clearfailed' });

const clearFailedQueue = async (req: NextApiRequest, res: NextApiResponse<SettingsGetResponse>) => {
   try {
      await retryQueueManager.clearQueue();
      logger.info('Failed queue cleared successfully');
      return res.status(200).json({ cleared: true });
   } catch (error) {
      logger.error('Error clearing failed queue', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error && error.message ? error.message : 'Error Clearing Failed Queue!';
      return res.status(500).json({ error: message });
   }
};
