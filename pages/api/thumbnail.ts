/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { withApiLogging } from '../../utils/apiLogging';
import { errorResponse } from '../../utils/api/response';
import { logger } from '../../utils/logger';
import {
   ensureThumbnails,
   generateThumbnail,
   getThumbnail,
   isSafeThumbnailDomain,
   listThumbnails,
   readThumbnailFile,
} from '../../utils/thumbnails';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      return typeof req.query.domain === 'string' ? sendThumbnail(req, res) : listDomainThumbnails(req, res);
   }
   if (req.method === 'POST') {
      return regenerateThumbnail(req, res);
   }
   res.setHeader('Allow', 'GET, POST');
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, { name: 'thumbnail' });

const normalizeDomain = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** GET /api/thumbnail: the version of each tracked domain's thumbnail (its date plus when the file was written). Missing and stale ones start generating in the background. */
const listDomainThumbnails = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   try {
      const domains = await Domain.findAll({ attributes: ['domain'] });
      const names = domains.map((item) => String(item.get({ plain: true }).domain));
      // Not awaited beyond the folder listing: a screenshot can take a while, and the old image keeps being served meanwhile
      await ensureThumbnails(names);
      const existing = await listThumbnails();
      const thumbnails: Record<string, string> = {};
      names.forEach((name) => {
         const found = existing.get(name);
         if (found) { thumbnails[name] = found.version; }
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ thumbnails });
   } catch (error) {
      logger.error('Error listing thumbnails', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Getting Thumbnails.', requestId));
   }
};

/** GET /api/thumbnail?domain=: the saved image of one domain */
const sendThumbnail = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const domain = normalizeDomain(req.query.domain);
   if (!isSafeThumbnailDomain(domain)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Domain is Required!', requestId));
   }
   try {
      const found = await getThumbnail(domain);
      if (!found) {
         res.setHeader('Cache-Control', 'no-store');
         return res.status(404).json(errorResponse('NOT_FOUND', 'No thumbnail yet.', requestId));
      }
      const image = await readThumbnailFile(found);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', image.length.toString());
      // The page asks with the file's date in the URL (&v=), so a new image is a new address
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.status(200).end(image);
   } catch (error) {
      logger.error('Error serving a thumbnail', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Getting Thumbnail.', requestId));
   }
};

/** POST /api/thumbnail?domain=: regenerates one thumbnail now (the reload button). The old image stays until the new one is saved. */
const regenerateThumbnail = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const domain = normalizeDomain(req.query.domain);
   if (!isSafeThumbnailDomain(domain)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Domain is Required!', requestId));
   }
   try {
      const tracked = await Domain.findOne({ where: { domain }, attributes: ['ID'] });
      if (!tracked) {
         return res.status(404).json(errorResponse('NOT_FOUND', 'Domain not found', requestId));
      }
      const saved = await generateThumbnail(domain);
      const found = await getThumbnail(domain);
      if (!saved || !found) {
         return res.status(502).json(errorResponse('BAD_GATEWAY', 'Could not get a screenshot of this website right now.', requestId));
      }
      return res.status(200).json({ thumbnail: found.version });
   } catch (error) {
      logger.error('Error regenerating a thumbnail', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Updating Thumbnail.', requestId));
   }
};
