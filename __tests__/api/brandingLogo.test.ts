export {};

import path from 'path';
import { promises as fs } from 'fs';
import handler from '../../pages/api/branding/logo';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../utils/apiLogging', () => ({ __esModule: true, withApiLogging: (fn: unknown) => fn }));

jest.mock('../../utils/logger', () => ({
   __esModule: true,
   logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('fs', () => ({
   __esModule: true,
   createReadStream: jest.fn(),
   promises: { stat: jest.fn() },
}));

const statMock = fs.stat as unknown as jest.Mock;
const ORIGINAL_ENV = { ...process.env };
const EXPECTED_LOGO_PATH = path.join(process.cwd(), 'data', 'logo.png');

const createResponse = () => {
   const res = createMockResponse();
   (res as unknown as { removeHeader: jest.Mock }).removeHeader = jest.fn();
   return res;
};

describe('GET /api/branding/logo', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };
   });

   afterAll(() => {
      process.env = ORIGINAL_ENV;
   });

   it('answers 404 without touching the file system when white-label is off', async () => {
      process.env.NEXT_PUBLIC_WHITE_LABEL = 'false';
      const res = createResponse();

      await handler(createMockRequest({ method: 'GET' }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(statMock).not.toHaveBeenCalled();
   });

   it('serves data/logo.png as a PNG', async () => {
      statMock.mockResolvedValue({ isFile: () => true, size: 2048 });
      const res = createResponse();

      await handler(createMockRequest({ method: 'HEAD' }), res);

      expect(statMock).toHaveBeenCalledWith(EXPECTED_LOGO_PATH);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '2048');
      expect(res.status).toHaveBeenCalledWith(200);
   });

   it('ignores the old WHITE_LABEL_LOGO_FILE setting and any other file name', async () => {
      process.env.WHITE_LABEL_LOGO_FILE = '../settings.json';
      statMock.mockResolvedValue({ isFile: () => true, size: 10 });

      await handler(createMockRequest({ method: 'HEAD' }), createResponse());

      expect(statMock).toHaveBeenCalledTimes(1);
      expect(statMock).toHaveBeenCalledWith(EXPECTED_LOGO_PATH);
   });

   it('answers 404 when logo.png does not exist', async () => {
      statMock.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
      const res = createResponse();

      await handler(createMockRequest({ method: 'GET' }), res);

      expect(res.status).toHaveBeenCalledWith(404);
   });

   it('rejects methods other than GET and HEAD', async () => {
      const res = createResponse();

      await handler(createMockRequest({ method: 'POST' }), res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(statMock).not.toHaveBeenCalled();
   });
});
