import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/clearfailed';
import verifyUser from '../../utils/verifyUser';

jest.mock('../../utils/verifyUser');

jest.mock('../../utils/retryQueueManager', () => ({
   retryQueueManager: {
      clearQueue: jest.fn(),
   },
}));

jest.mock('../../utils/apiLogging', () => ({
   withApiLogging: (handler: any) => handler,
}));

describe('/api/clearfailed', () => {
   const req = { method: 'PUT', headers: {} } as unknown as NextApiRequest;
   let res: NextApiResponse;

   beforeEach(() => {
      res = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn(),
      } as unknown as NextApiResponse;

      (verifyUser as jest.Mock).mockReturnValue('authorized');
      const { retryQueueManager } = require('../../utils/retryQueueManager');
      (retryQueueManager.clearQueue as jest.Mock).mockResolvedValue(undefined);
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('responds with error status when clearing the queue fails', async () => {
      const { retryQueueManager } = require('../../utils/retryQueueManager');
      (retryQueueManager.clearQueue as jest.Mock).mockRejectedValue(new Error('disk full'));

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'disk full' });
   });
});
