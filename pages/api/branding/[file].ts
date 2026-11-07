import type { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream, promises as fs } from 'fs';
import { getBranding } from '../../../utils/branding';
import { ensureBrandingAssets, getBrandingLogoPath } from '../../../utils/brandingAssets';
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

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   if (!isAllowedMethod(req.method)) {
      logger.debug(`Method not allowed for logo: ${req.method}`);
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end('Method Not Allowed');
      return;
   }

   ensureBrandingAssets();
   const { whiteLabelEnabled, hasCustomLogo, logoApiPath } = getBranding();

   // Only the logo's own address answers (/api/branding/logo.png); other names are not served
   const requestedFile = typeof req.query.file === 'string' ? req.query.file : '';
   if (`/api/branding/${requestedFile}` !== logoApiPath) {
      respondNotFound(res);
      return;
   }

   if (!whiteLabelEnabled || !hasCustomLogo) {
      logger.debug('Custom logo not configured or not enabled');
      respondNotFound(res);
      return;
   }

   const resolvedPath = getBrandingLogoPath();

   try {
      // The path is the data folder plus the fixed file name logo.png.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stat = await fs.stat(resolvedPath);
      if (!stat.isFile()) {
         logger.debug('Logo path is not a file', { path: resolvedPath });
         respondNotFound(res);
         return;
      }

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', stat.size.toString());
      // Cached only for a successful response. No `immutable`: the file keeps its name when a new logo is uploaded.
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (req.method === 'HEAD') {
         res.status(200).end();
         return;
      }

      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stream = createReadStream(resolvedPath);
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
