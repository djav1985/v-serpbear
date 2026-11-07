export {};

import path from 'path';
import { promises as fs, createReadStream } from 'fs';
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

// The file name ends in .png, which Jest maps to an image stub, so the route is loaded with its real .ts name.
const handler = require('../../pages/api/images/logo.png.ts').default;

const statMock = fs.stat as unknown as jest.Mock;
const streamMock = createReadStream as unknown as jest.Mock;
const ORIGINAL_ENV = { ...process.env };
const CUSTOM_LOGO = path.join(process.cwd(), 'data', 'logo.png');
const DEFAULT_LOGO = path.join(process.cwd(), 'public', 'icon.png');

const createResponse = () => {
   const res = createMockResponse();
   (res as unknown as { removeHeader: jest.Mock }).removeHeader = jest.fn();
   return res;
};

// The stat of each fixed path decides what is served.
const filesOnDisk = (paths: Record<string, number>) => statMock.mockImplementation(async (filePath: string) => {
   if (paths[filePath] === undefined) { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }
   return { isFile: () => true, size: paths[filePath] };
});

describe('GET /api/images/logo.png', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };
      streamMock.mockImplementation(() => ({ on: jest.fn(), pipe: jest.fn() }));
   });

   afterAll(() => {
      process.env = ORIGINAL_ENV;
   });

   it('serves data/logo.png as a PNG when white-label is on and the file exists', async () => {
      filesOnDisk({ [CUSTOM_LOGO]: 2048, [DEFAULT_LOGO]: 99 });
      const res = createResponse();

      await handler(createMockRequest({ method: 'HEAD' }), res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '2048');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
      expect(res.status).toHaveBeenCalledWith(200);
   });

   it('serves the bundled default, not a 404, when white-label is off, without looking for the custom file', async () => {
      process.env.NEXT_PUBLIC_WHITE_LABEL = 'false';
      filesOnDisk({ [CUSTOM_LOGO]: 2048, [DEFAULT_LOGO]: 99 });
      const res = createResponse();

      await handler(createMockRequest({ method: 'HEAD' }), res);

      expect(statMock).not.toHaveBeenCalledWith(CUSTOM_LOGO);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '99');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
      expect(res.status).toHaveBeenCalledWith(200);
   });

   it('serves the bundled default when white-label is on but logo.png is missing', async () => {
      filesOnDisk({ [DEFAULT_LOGO]: 99 });
      const res = createResponse();

      await handler(createMockRequest({ method: 'GET' }), res);

      expect(streamMock).toHaveBeenCalledWith(DEFAULT_LOGO);
      expect(res.status).not.toHaveBeenCalledWith(404);
   });

   it('answers 404 only when not even the bundled default exists', async () => {
      filesOnDisk({});
      const res = createResponse();

      await handler(createMockRequest({ method: 'GET' }), res);

      expect(res.status).toHaveBeenCalledWith(404);
   });

   it('ignores the old WHITE_LABEL_LOGO_FILE setting: only fixed paths are ever read', async () => {
      process.env.WHITE_LABEL_LOGO_FILE = '../settings.json';
      filesOnDisk({ [CUSTOM_LOGO]: 10 });

      await handler(createMockRequest({ method: 'HEAD' }), createResponse());

      expect(statMock.mock.calls.map(([filePath]) => filePath)).toEqual([CUSTOM_LOGO]);
   });

   it('rejects methods other than GET and HEAD', async () => {
      const res = createResponse();

      await handler(createMockRequest({ method: 'POST' }), res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(statMock).not.toHaveBeenCalled();
   });
});
