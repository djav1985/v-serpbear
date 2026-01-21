import type { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { getBranding } from '../../../utils/branding';
import { logger } from '../../../utils/logger';

const respondNotFound = (res: NextApiResponse) => {
   res.status(404).end('Logo not found');
};

const isAllowedMethod = (method?: string): method is 'GET' | 'HEAD' => method === 'GET' || method === 'HEAD';

const dataDirectory = path.join(process.cwd(), 'data');

const resolveLogoPath = (fileName: string): string => {
   const sanitizedFileName = path.basename(fileName);
   return path.join(dataDirectory, sanitizedFileName);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   if (!isAllowedMethod(req.method)) {
      logger.debug(`Method not allowed for logo: ${req.method}`);
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end('Method Not Allowed');
      return;
   }

   const { whiteLabelEnabled, hasCustomLogo, logoFile, logoMimeType } = getBranding();

   if (!whiteLabelEnabled || !hasCustomLogo || !logoMimeType) {
      logger.debug('Custom logo not configured or not enabled');
      respondNotFound(res);
      return;
   }

   const filePath = resolveLogoPath(logoFile);
   const resolvedPath = path.resolve(filePath);

   if (!resolvedPath.startsWith(dataDirectory)) {
      logger.warn('Attempt to access logo outside data directory', { requestedPath: filePath });
      respondNotFound(res);
      return;
   }

   try {
      // Path is constrained to the data directory via `resolveLogoPath` and checked above.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stat = await fs.stat(resolvedPath);
      if (!stat.isFile()) {
         logger.debug('Logo path is not a file', { path: resolvedPath });
         respondNotFound(res);
         return;
      }

      res.setHeader('Content-Type', logoMimeType);
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader('Cache-Control', 'public, max-age=3600, immutable');

      if (req.method === 'HEAD') {
         res.status(200).end();
         return;
      }

      // Path is constrained to the data directory via `resolveLogoPath` and checked above.
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

export default handler;
