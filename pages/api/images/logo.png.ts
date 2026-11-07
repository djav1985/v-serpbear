import type { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { getBranding, LOGO_FILE, LOGO_MIME_TYPE } from '../../../utils/branding';
import { logger } from '../../../utils/logger';
import { withApiLogging } from '../../../utils/apiLogging';

const isAllowedMethod = (method?: string): method is 'GET' | 'HEAD' => method === 'GET' || method === 'HEAD';

// Both paths are fixed constants, so no part of a path comes from the request or the environment.
const customLogoPath = path.join(process.cwd(), 'data', LOGO_FILE);
const defaultLogoPath = path.join(process.cwd(), 'public', 'icon.png');

const isFile = async (filePath: string): Promise<{ size: number } | null> => {
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stat = await fs.stat(filePath);
      return stat.isFile() ? { size: stat.size } : null;
   } catch (_error) {
      return null;
   }
};

/**
 * The one logo URL. It always answers with an image: the white-label logo (data/logo.png) when white-label is on and the
 * file exists, otherwise the bundled default (public/icon.png). Pages, the tab icon, the manifest and emails can all point
 * here without a fallback of their own. It is a fixed route, so no other file name is ever served.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   if (!isAllowedMethod(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end('Method Not Allowed');
      return;
   }

   const custom = getBranding().hasCustomLogo ? await isFile(customLogoPath) : null;
   const source = custom ? { filePath: customLogoPath, size: custom.size, custom: true } : await (async () => {
      const fallback = await isFile(defaultLogoPath);
      return fallback ? { filePath: defaultLogoPath, size: fallback.size, custom: false } : null;
   })();

   if (!source) {
      logger.error('No logo file could be found, not even the bundled default');
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).end('Logo not found');
      return;
   }

   res.setHeader('Content-Type', LOGO_MIME_TYPE);
   res.setHeader('Content-Length', source.size.toString());
   // No `immutable`: the file keeps its name when a new logo is uploaded. The default is cached for less time, so a logo
   // added later is picked up quickly.
   res.setHeader('Cache-Control', source.custom ? 'public, max-age=3600' : 'public, max-age=300');

   if (req.method === 'HEAD') {
      res.status(200).end();
      return;
   }

   // eslint-disable-next-line security/detect-non-literal-fs-filename
   const stream = createReadStream(source.filePath);
   stream.on('error', (error) => {
      logger.error('Error streaming logo file', error);
      if (res.headersSent) { res.destroy(); return; }
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Length');
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).end('Logo not found');
   });
   stream.pipe(res);
};

export default withApiLogging(handler, { name: 'images/logo' });
