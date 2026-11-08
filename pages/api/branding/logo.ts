import type { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { getBranding, LOGO_FILE, LOGO_MIME_TYPE } from '../../../utils/branding';
import { logger } from '../../../utils/logger';
import { withApiLogging } from '../../../utils/apiLogging';

// Errors are never cached: the logo headers (type, length, cache policy) are dropped before the 404 is sent
const respondNotFound = (res: NextApiResponse) => {
   if (res.headersSent) {
      // Part of a logo was already streamed, so the status can no longer change; cut the response off
      res.destroy();
      return;
   }
   res.removeHeader('Content-Type');
   res.removeHeader('Content-Length');
   res.setHeader('Cache-Control', 'no-store');
   res.status(404).end('Logo not found');
};

const isAllowedMethod = (method?: string): method is 'GET' | 'HEAD' => method === 'GET' || method === 'HEAD';

// Fixed path: the logo is always data/logo.png, so no part of the path comes from the request or the environment.
const logoPath = path.join(process.cwd(), 'data', LOGO_FILE);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   if (!isAllowedMethod(req.method)) {
      logger.debug(`Method not allowed for logo: ${req.method}`);
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end('Method Not Allowed');
      return;
   }

   if (!getBranding().hasCustomLogo) {
      logger.debug('White-label is not enabled, so there is no custom logo');
      respondNotFound(res);
      return;
   }

   try {
      // logoPath is a fixed constant (data/logo.png); nothing from the request reaches it.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stat = await fs.stat(logoPath);
      if (!stat.isFile()) {
         logger.debug('Logo path is not a file', { path: logoPath });
         respondNotFound(res);
         return;
      }

      res.setHeader('Content-Type', LOGO_MIME_TYPE);
      res.setHeader('Content-Length', stat.size.toString());
      // Cached only for a successful response. No `immutable`: the file keeps its name when a new logo is uploaded.
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (req.method === 'HEAD') {
         res.status(200).end();
         return;
      }

      // logoPath is a fixed constant (data/logo.png); nothing from the request reaches it.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stream = createReadStream(logoPath);
      stream.on('error', (error) => {
         logger.error('Error streaming logo file', error);
         respondNotFound(res);
      });
      stream.pipe(res);
   } catch (error) {
      logger.error('Error serving logo', error instanceof Error ? error : new Error(String(error)));
      respondNotFound(res);
   }
};

export default withApiLogging(handler, { name: 'branding/logo' });
