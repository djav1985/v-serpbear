import type { NextApiRequest, NextApiResponse } from 'next';
import { promises as fs } from 'fs';
import { getBranding } from '../../../utils/branding';
import { ensureBrandingAssets, getBrandingFaviconPath } from '../../../utils/brandingAssets';
import { logger } from '../../../utils/logger';
import { withApiLogging } from '../../../utils/apiLogging';

const respondNotFound = (res: NextApiResponse) => {
   res.setHeader('Cache-Control', 'no-store');
   res.status(404).end('Favicon not found');
};

/**
 * The browser tab icon for white-label installs: data/favicon.ico. Answers only when white label is on and the
 * file existed when the app started; the page links to /favicon.ico (the default icon) in every other case.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end('Method Not Allowed');
      return;
   }

   ensureBrandingAssets();
   if (!getBranding().hasCustomFavicon) {
      respondNotFound(res);
      return;
   }

   try {
      // The path is the data folder plus the fixed file name favicon.ico, never built from the request.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const file = await fs.readFile(getBrandingFaviconPath());
      res.setHeader('Content-Type', 'image/x-icon');
      res.setHeader('Content-Length', file.length.toString());
      // Cached only for a successful response; the file keeps its name when a new icon is dropped in
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).end(req.method === 'HEAD' ? undefined : file);
      return;
   } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
         logger.error('Error serving favicon', error instanceof Error ? error : new Error(String(error)));
      }
   }

   respondNotFound(res);
};

export default withApiLogging(handler, { name: 'branding/favicon' });
