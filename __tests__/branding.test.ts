import { LOGO_FILE, LOGO_MIME_TYPE, buildLogoUrl, getBranding } from '../utils/branding';
import path from 'path';
import { createReadStream, promises as fs } from 'fs';
import { createMockRequest, createMockResponse } from './__helpers__';

jest.mock('../utils/apiLogging', () => ({ __esModule: true, withApiLogging: (fn: unknown) => fn }));
jest.mock('../utils/logger', () => ({
   __esModule: true,
   logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('fs', () => ({
   __esModule: true,
   createReadStream: jest.fn(),
   promises: { stat: jest.fn() },
}));

describe('branding', () => {
  const ORIGINAL_ENV = { ...process.env };

  describe('branding utils', () => {
     afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
        jest.resetModules();
     });

     describe('fixed logo file', () => {
        it('always uses logo.png as a PNG, whatever the environment says', () => {
           process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true', WHITE_LABEL_LOGO_FILE: 'something-else.svg' };

           expect(LOGO_FILE).toBe('logo.png');
           expect(LOGO_MIME_TYPE).toBe('image/png');
           expect(getBranding().hasCustomLogo).toBe(true);
           expect(getBranding()).not.toHaveProperty('logoFile');
        });

        it('has no custom logo when white-label is off', () => {
           process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'false' };

           expect(getBranding().hasCustomLogo).toBe(false);
        });
     });

     describe('buildLogoUrl', () => {
        it('returns empty string when white-label is disabled', () => {
           process.env = { 
              ...ORIGINAL_ENV, 
              NEXT_PUBLIC_WHITE_LABEL: 'false',
              NEXT_PUBLIC_APP_URL: 'https://example.com' 
           };
         
           const logoUrl = buildLogoUrl('https://example.com');
           expect(logoUrl).toBe('');
        });

        it('returns the logo URL whenever white-label is enabled (the logo is always data/logo.png)', () => {
           process.env = {
              ...ORIGINAL_ENV,
              NEXT_PUBLIC_WHITE_LABEL: 'true',
              NEXT_PUBLIC_APP_URL: 'https://example.com'
           };

           expect(buildLogoUrl('https://example.com')).toBe('https://example.com/api/images/logo.png');
        });

        it('builds correct URL when white-label is enabled with valid logo file', () => {
           process.env = { 
              ...ORIGINAL_ENV, 
              NEXT_PUBLIC_WHITE_LABEL: 'true',
              NEXT_PUBLIC_APP_URL: 'https://example.com' 
           };
         
           const logoUrl = buildLogoUrl('https://example.com');
           expect(logoUrl).toBe('https://example.com/api/images/logo.png');
        });

        it('strips trailing slashes from origin', () => {
           process.env = { 
              ...ORIGINAL_ENV, 
              NEXT_PUBLIC_WHITE_LABEL: 'true',
              NEXT_PUBLIC_APP_URL: 'https://example.com' 
           };
         
           const logoUrl = buildLogoUrl('https://example.com/');
           expect(logoUrl).toBe('https://example.com/api/images/logo.png');
        });

        it('works with empty origin parameter', () => {
           process.env = { 
              ...ORIGINAL_ENV, 
              NEXT_PUBLIC_WHITE_LABEL: 'true',
              NEXT_PUBLIC_APP_URL: 'https://example.com' 
           };
         
           const logoUrl = buildLogoUrl('');
           expect(logoUrl).toBe('/api/images/logo.png');
        });
     });

     describe('email branding integration', () => {
        it('buildLogoUrl handles all logo validation internally', () => {
           // Test that buildLogoUrl returns empty string when conditions aren't met
           process.env = { 
              ...ORIGINAL_ENV, 
              NEXT_PUBLIC_WHITE_LABEL: 'false',
              NEXT_PUBLIC_APP_URL: 'https://example.com' 
           };
         
           const logoUrl = buildLogoUrl('https://example.com');
           expect(logoUrl).toBe('');
         
           // Test that buildLogoUrl returns proper URL when conditions are met
           process.env = { 
              ...ORIGINAL_ENV, 
              NEXT_PUBLIC_WHITE_LABEL: 'true',
              NEXT_PUBLIC_APP_URL: 'https://example.com' 
           };
         
           const validLogoUrl = buildLogoUrl('https://example.com');
           expect(validLogoUrl).toBe('https://example.com/api/images/logo.png');
        });

        it('buildLogoUrl can be used directly without additional conditional checks', () => {
           const DEFAULT_BRAND_LOGO = 'https://serpbear.b-cdn.net/ikAdjQq.png';
         
           // Test with white-label disabled - buildLogoUrl returns empty string
           process.env = { 
              ...ORIGINAL_ENV, 
              NEXT_PUBLIC_WHITE_LABEL: 'false',
              NEXT_PUBLIC_APP_URL: 'https://example.com' 
           };
         
           const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
           const logoUrl = buildLogoUrl(baseUrl);
           const emailLogo = logoUrl || DEFAULT_BRAND_LOGO;
         
           expect(logoUrl).toBe('');
           expect(emailLogo).toBe(DEFAULT_BRAND_LOGO);
         
           // Test with white-label enabled - buildLogoUrl returns proper URL
           process.env = { 
              ...ORIGINAL_ENV, 
              NEXT_PUBLIC_WHITE_LABEL: 'true',
              NEXT_PUBLIC_APP_URL: 'https://example.com' 
           };
         
           const baseUrl2 = process.env.NEXT_PUBLIC_APP_URL || '';
           const logoUrl2 = buildLogoUrl(baseUrl2);
           const emailLogo2 = logoUrl2 || DEFAULT_BRAND_LOGO;
         
           expect(logoUrl2).toBe('https://example.com/api/images/logo.png');
           expect(emailLogo2).toBe('https://example.com/api/images/logo.png');
        });
     });
  });
});

describe('logo route', () => {
  // The file name ends in .png, which Jest maps to an image stub, so the route is loaded with its real .ts name.
  const handler = require('../pages/api/images/logo.png.ts').default;

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
});
