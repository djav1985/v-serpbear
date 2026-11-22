import { logger } from '../../../../utils/logger';
import { retryQueueManager } from '../../../../utils/retryQueueManager';
import { createRoute, fail, json, type ApiContext } from '../../../../utils/apiLogging';
import { parseBody } from '../../../../utils/api/validate';

const clearFailedQueue = async (req: Request, ctx: ApiContext) => {
   // The body is an empty object; callers may leave it out
   await parseBody(req, 'clearFailed.run', { emptyBodyOk: true });
   try {
      await retryQueueManager.clearQueue();
      logger.debug('[SCRAPER] Failed queue cleared successfully');
      return json({ cleared: true });
   } catch (error) {
      logger.error('Error clearing failed queue', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error && error.message ? error.message : 'Error Clearing Failed Queue!';
      return fail(500, 'INTERNAL_SERVER_ERROR', message, ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'clearfailed', PUT: clearFailedQueue });
