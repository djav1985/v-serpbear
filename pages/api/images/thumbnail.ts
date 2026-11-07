/// <reference path="../../../types.d.ts" />

import { randomBytes } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import Domain from '../../../database/models/domain';
import { withApiLogging } from '../../../utils/apiLogging';
import { errorResponse } from '../../../utils/api/response';
import { logger } from '../../../utils/logger';
import verifyUser from '../../../utils/verifyUser';
import { generateThumbnail, getThumbnailById, readThumbnailFile, type ThumbnailIndexEntry } from '../../../utils/thumbnails';

const writeChunk = async (res: NextApiResponse, chunk: Buffer | string, isClosed: () => boolean): Promise<boolean> => {
   if (isClosed()) { return false; }
   if (res.write(chunk)) { return true; }
   if (isClosed()) { return false; }
   return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (writable: boolean) => {
         if (settled) { return; }
         settled = true;
         resolve(writable);
      };
      res.once('drain', () => finish(!isClosed()));
      res.once('close', () => finish(false));
      res.once('error', () => finish(false));
   });
};

const sendPart = async (
   res: NextApiResponse,
   boundary: string,
   entry: ThumbnailIndexEntry,
   image: Buffer,
   isClosed: () => boolean,
): Promise<boolean> => {
   const headers = [
      `--${boundary}`,
      `Content-ID: ${entry.ID}`,
      `Content-Type: ${entry.contentType}`,
      `X-Generated-At: ${new Date(entry.generatedAt).toISOString()}`,
      `Content-Length: ${image.length}`,
      '',
      '',
   ].join('\r\n');
   if (!await writeChunk(res, headers, isClosed)) { return false; }
   if (!await writeChunk(res, image, isClosed)) { return false; }
   return writeChunk(res, '\r\n', isClosed);
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
   }
   if (req.url?.includes('?') || Object.keys(req.query || {}).length > 0) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Query parameters are not supported.', requestId));
   }
   const body = req.body;
   if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray((body as { ids?: unknown }).ids)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Request body must contain an IDs array.', requestId));
   }
   const inputIds = (body as { ids: unknown[] }).ids;
   if (inputIds.length === 0 || !inputIds.every((id) => Number.isSafeInteger(id) && Number(id) > 0)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'IDs must be positive integers.', requestId));
   }
   const ids = Array.from(new Set(inputIds as number[]));

   let responseClosed = false;
   try {
      // Resolve every ID before touching the thumbnail index or filesystem so one unknown ID rejects the whole batch.
      const records = await Domain.findAll({ where: { ID: ids }, attributes: ['ID', 'domain'], raw: true }) as unknown as Array<{ ID: number; domain: string }>;
      const tracked = new Map(records.map((record) => [record.ID, record]));
      if (ids.some((id) => !tracked.has(id))) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'One or more domain IDs are not tracked.', requestId));
      }

      const boundary = `serpbear-${randomBytes(16).toString('hex')}`;
      res.once('close', () => { responseClosed = true; });
      res.once('error', () => { responseClosed = true; });
      res.status(200);
      res.setHeader('Content-Type', `multipart/mixed; boundary=${boundary}`);
      res.setHeader('Cache-Control', 'no-store');

      // Bound file reads and keep writes in completion order so slow clients cannot buffer an entire batch in memory.
      let writeQueue = Promise.resolve();
      let nextId = 0;
      const worker = async () => {
         while (!responseClosed) {
            const index = nextId;
            nextId += 1;
            const id = ids[index];
            if (id === undefined) { return; }
            const domain = tracked.get(id) as { ID: number; domain: string };
            let entry = getThumbnailById(id);
            if (!entry || entry.ID !== id || entry.domain !== domain.domain) {
               entry = await generateThumbnail(domain.domain, id);
            }
            if (!entry || responseClosed) { continue; }
            let image: Buffer;
            try { image = await readThumbnailFile(entry); }
            catch { continue; }
            if (responseClosed) { return; }
            writeQueue = writeQueue.then(async () => {
               if (responseClosed) { return; }
               if (!await sendPart(res, boundary, entry as ThumbnailIndexEntry, image, () => responseClosed)) {
                  responseClosed = true;
               }
            });
            await writeQueue;
         }
      };
      await Promise.all(Array.from({ length: Math.min(3, ids.length) }, () => worker()));
      if (responseClosed) { return; }
      await writeQueue;
      if (!await writeChunk(res, `--${boundary}--\r\n`, () => responseClosed)) { return; }
      return res.end();
   } catch (error) {
      logger.error('Error streaming domain thumbnails', error instanceof Error ? error : new Error(String(error)));
      if (!res.headersSent) {
         return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Getting Thumbnails.', requestId));
      }
      if (responseClosed) { return; }
      return res.end();
   }
}

export const config = { api: { responseLimit: false } };

export default withApiLogging(handler, { name: 'thumbnail-batch' });
