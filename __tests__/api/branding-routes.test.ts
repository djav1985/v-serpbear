import path from 'path';
import { promises as fs } from 'fs';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('../../utils/logger', () => ({
   __esModule: true,
   logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('fs', () => ({ __esModule: true, promises: { readFile: jest.fn() } }));

describe('logo route', () => {
  // The file name ends in .png, which Jest maps to an image stub, so the route is loaded with its real .ts name.
  const handler = require('../__helpers__/routeAdapter').asModule(require('../../app/api/images/logo.png/route')).default;

  const readFileMock = fs.readFile as unknown as jest.Mock;
  const ORIGINAL_ENV = { ...process.env };
  const CUSTOM_LOGO = path.join(process.cwd(), 'data', 'logo.png');
  const DEFAULT_LOGO = path.join(process.cwd(), 'public', 'icon.png');

  // The contents of each fixed path decide what is served; a path that is not listed does not exist.
  const filesOnDisk = (files: Record<string, Buffer>) => readFileMock.mockImplementation(async (filePath: string) => {
     if (files[filePath] === undefined) { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }
     return files[filePath];
  });
  const png = (size: number) => Buffer.alloc(size, 1);

  describe('GET /api/images/logo.png', () => {
     beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };
     });

     afterAll(() => {
        process.env = ORIGINAL_ENV;
     });

     it('serves data/logo.png as a PNG when white-label is on and the file exists', async () => {
        filesOnDisk({ [CUSTOM_LOGO]: png(2048), [DEFAULT_LOGO]: png(99) });
        const res = createMockResponse();

        await handler(createMockRequest({ method: 'GET' }), res);

        expect(res.setHeader).toHaveBeenCalledWith('content-type', 'image/png');
        expect(res.setHeader).toHaveBeenCalledWith('content-length', '2048');
        expect(res.setHeader).toHaveBeenCalledWith('cache-control', 'public, max-age=31536000');
        expect(res.status).toHaveBeenCalledWith(200);
     });

     it('serves the bundled default, not a 404, when white-label is off, without looking for the custom file', async () => {
        process.env.NEXT_PUBLIC_WHITE_LABEL = 'false';
        filesOnDisk({ [CUSTOM_LOGO]: png(2048), [DEFAULT_LOGO]: png(99) });
        const res = createMockResponse();

        await handler(createMockRequest({ method: 'GET' }), res);

        expect(readFileMock).not.toHaveBeenCalledWith(CUSTOM_LOGO);
        expect(res.setHeader).toHaveBeenCalledWith('content-length', '99');
        expect(res.setHeader).toHaveBeenCalledWith('cache-control', 'public, max-age=31536000');
        expect(res.status).toHaveBeenCalledWith(200);
     });

     it('serves the bundled default when white-label is on but logo.png is missing', async () => {
        filesOnDisk({ [DEFAULT_LOGO]: png(99) });
        const res = createMockResponse();

        await handler(createMockRequest({ method: 'GET' }), res);

        expect(readFileMock).toHaveBeenCalledWith(DEFAULT_LOGO);
        expect(res.status).toHaveBeenCalledWith(200);
     });

     it('answers 404 only when not even the bundled default exists', async () => {
        filesOnDisk({});
        const res = createMockResponse();

        await handler(createMockRequest({ method: 'GET' }), res);

        expect(res.status).toHaveBeenCalledWith(404);
     });

     it('ignores the old WHITE_LABEL_LOGO_FILE setting: only fixed paths are ever read', async () => {
        process.env.WHITE_LABEL_LOGO_FILE = '../../settings.json';
        filesOnDisk({ [CUSTOM_LOGO]: png(10) });

        await handler(createMockRequest({ method: 'GET' }), createMockResponse());

        expect(readFileMock.mock.calls.map(([filePath]) => filePath)).toEqual([CUSTOM_LOGO]);
     });

     it('rejects methods other than GET and HEAD', async () => {
        const res = createMockResponse();

        await handler(createMockRequest({ method: 'POST' }), res);

        expect(res.status).toHaveBeenCalledWith(405);
        expect(readFileMock).not.toHaveBeenCalled();
     });
  });
});

describe('favicon route', () => {
  const faviconHandler = require('../__helpers__/routeAdapter').asModule(require('../../app/api/images/favicon.png/route')).default;
  const readFileMock = fs.readFile as unknown as jest.Mock;
  const ORIGINAL_ENV = { ...process.env };
  const CUSTOM_FAVICON = path.join(process.cwd(), 'data', 'favicon.png');
  const CUSTOM_LOGO = path.join(process.cwd(), 'data', 'logo.png');
  const DEFAULT_ICON = path.join(process.cwd(), 'public', 'icon.png');
  const filesOnDisk = (files: Record<string, Buffer>) => readFileMock.mockImplementation(async (filePath: string) => {
     if (files[filePath] === undefined) { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }
     return files[filePath];
  });

  beforeEach(() => {
     jest.clearAllMocks();
     process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };
  });

  afterAll(() => {
     process.env = ORIGINAL_ENV;
  });

  it('serves data/favicon.png when white-label is on and the file exists, never the logo', async () => {
     filesOnDisk({ [CUSTOM_FAVICON]: Buffer.alloc(64, 1), [CUSTOM_LOGO]: Buffer.alloc(2048, 1), [DEFAULT_ICON]: Buffer.alloc(99, 1) });
     const res = createMockResponse();

     await faviconHandler(createMockRequest({ method: 'GET' }), res);

     expect(res.setHeader).toHaveBeenCalledWith('content-length', '64');
     expect(res.setHeader).toHaveBeenCalledWith('content-type', 'image/png');
     expect(res.setHeader).toHaveBeenCalledWith('cache-control', 'public, max-age=604800');
     expect(res.status).toHaveBeenCalledWith(200);
  });

  it('serves the bundled default when white-label is off or favicon.png is missing', async () => {
     filesOnDisk({ [CUSTOM_LOGO]: Buffer.alloc(2048, 1), [DEFAULT_ICON]: Buffer.alloc(99, 1) });
     const missing = createMockResponse();
     await faviconHandler(createMockRequest({ method: 'GET' }), missing);
     expect(missing.setHeader).toHaveBeenCalledWith('content-length', '99');
     expect(missing.setHeader).toHaveBeenCalledWith('cache-control', 'public, max-age=604800');

     process.env.NEXT_PUBLIC_WHITE_LABEL = 'false';
     readFileMock.mockClear();
     const off = createMockResponse();
     await faviconHandler(createMockRequest({ method: 'GET' }), off);
     expect(readFileMock).not.toHaveBeenCalledWith(CUSTOM_FAVICON);
     expect(off.status).toHaveBeenCalledWith(200);
  });
});
