import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/images/thumbnail';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import * as thumbs from '../../utils/thumbnails';
import { createMockResponse } from '../__helpers__';

jest.mock('../../database/models/domain', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/apiLogging', () => ({ __esModule: true, withApiLogging: (apiHandler: unknown) => apiHandler }));
jest.mock('../../utils/thumbnails', () => ({
   __esModule: true,
   getThumbnailById: jest.fn(),
   generateThumbnail: jest.fn(),
   readThumbnailFile: jest.fn(),
}));

const DomainMock = Domain as unknown as { findAll: jest.Mock };
const verifyUserMock = verifyUser as unknown as jest.Mock;
const thumbsMock = thumbs as unknown as Record<'getThumbnailById' | 'generateThumbnail' | 'readThumbnailFile', jest.Mock>;

const makeReq = (body: unknown, url = '/api/images/thumbnail') => ({
   method: 'POST', url, query: url.includes('?') ? { extra: '1' } : {}, body, headers: {},
} as unknown as NextApiRequest);

const makeStreamResponse = () => {
   const output: Buffer[] = [];
   const base = createMockResponse();
   const res = Object.assign(base, {
      statusCode: 200,
      headersSent: false,
      write: jest.fn((chunk: Buffer | string) => { output.push(Buffer.from(chunk)); return true; }),
      once: jest.fn(),
   }) as unknown as NextApiResponse;
   return { res, output };
};

describe('POST /api/images/thumbnail', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
      DomainMock.findAll.mockResolvedValue([{ ID: 1, domain: 'a.com' }, { ID: 2, domain: 'b.com' }]);
      thumbsMock.getThumbnailById.mockImplementation((id: number) => ({
         ID: id, domain: id === 1 ? 'a.com' : 'b.com', file: `${id}.jpg`, contentType: 'image/jpeg', generatedAt: Date.parse('2026-11-07T12:00:00Z'),
      }));
      thumbsMock.readThumbnailFile.mockImplementation(async (entry: { ID: number }) => Buffer.from([entry.ID, 0, 255]));
      thumbsMock.generateThumbnail.mockResolvedValue(undefined);
   });

   it('requires a login session and rejects malformed, queried, or untracked batches before image access', async () => {
      verifyUserMock.mockReturnValue('Not authorized');
      const { res } = makeStreamResponse();
      await handler(makeReq({ ids: [1] }), res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(DomainMock.findAll).not.toHaveBeenCalled();

      verifyUserMock.mockReturnValue('This Route cannot be accessed with API.');
      const apiKeyRes = makeStreamResponse().res;
      await handler(makeReq({ ids: [1] }), apiKeyRes);
      expect(apiKeyRes.status).toHaveBeenCalledWith(401);

      verifyUserMock.mockReturnValue('authorized');
      const inputs = [
         { body: null }, { body: { ids: [] } }, { body: { ids: [0] } },
         { body: { ids: [1, '2'] } }, { body: { ids: [1] }, url: '/api/images/thumbnail?x=1' },
      ];
      for (const input of inputs) {
         const res = makeStreamResponse().res;
         await handler(makeReq(input.body, input.url), res);
         expect(res.status).toHaveBeenCalledWith(400);
      }
      DomainMock.findAll.mockResolvedValueOnce([{ ID: 1, domain: 'a.com' }]);
      const unknownRes = makeStreamResponse().res;
      await handler(makeReq({ ids: [1, 999] }), unknownRes);
      expect(unknownRes.status).toHaveBeenCalledWith(400);
      expect(thumbsMock.getThumbnailById).not.toHaveBeenCalled();
      expect(thumbsMock.readThumbnailFile).not.toHaveBeenCalled();
      expect(thumbsMock.generateThumbnail).not.toHaveBeenCalled();
   });

   it('streams complete binary MIME parts, honors backpressure, and omits failed generations', async () => {
      const { res, output } = makeStreamResponse();
      let drain: (() => void) | undefined;
      (res.write as jest.Mock).mockImplementationOnce((chunk: Buffer | string) => {
         output.push(Buffer.from(chunk));
         setTimeout(() => drain?.(), 0);
         return false;
      });
      (res.once as jest.Mock).mockImplementation((event: string, callback: () => void) => {
         if (event === 'drain') { drain = callback; }
      });
      await handler(makeReq({ ids: [2, 1, 2] }), res);

      expect(DomainMock.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { ID: [2, 1] } }));
      expect(thumbsMock.readThumbnailFile).toHaveBeenCalledTimes(2);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', expect.stringMatching(/^multipart\/mixed; boundary=/));
      const wire = Buffer.concat(output).toString('latin1');
      expect(wire.match(/Content-ID: 1/g)).toHaveLength(1);
      expect(wire.match(/Content-ID: 2/g)).toHaveLength(1);
      expect(wire).toContain('Content-Type: image/jpeg');
      expect(wire).toContain('X-Generated-At: 2026-11-07T12:00:00.000Z');
      expect(Buffer.concat(output).indexOf(Buffer.from([1, 0, 255]))).toBeGreaterThanOrEqual(0);
      expect(Buffer.concat(output).indexOf(Buffer.from([2, 0, 255]))).toBeGreaterThanOrEqual(0);
      expect(res.once).toHaveBeenCalledWith('drain', expect.any(Function));
      expect(res.end).toHaveBeenCalled();
      thumbsMock.getThumbnailById.mockReturnValue(undefined);
      thumbsMock.generateThumbnail.mockImplementation(async (_domain: string, id: number) => (
         id === 1 ? { ID: 1, domain: 'a.com', file: 'a.jpg', contentType: 'image/webp', generatedAt: Date.parse('2026-11-07T12:00:00Z') } : undefined
      ));
      const missing = makeStreamResponse();
      await handler(makeReq({ ids: [1, 2] }), missing.res);

      expect(thumbsMock.generateThumbnail).toHaveBeenCalledWith('a.com', 1);
      expect(thumbsMock.generateThumbnail).toHaveBeenCalledWith('b.com', 2);
      expect(Buffer.concat(missing.output).toString('latin1')).toContain('Content-ID: 1');
      expect(Buffer.concat(missing.output).toString('latin1')).not.toContain('Content-ID: 2');
   });
});
