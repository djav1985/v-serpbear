import type { NextApiRequest, NextApiResponse } from 'next';
import { promises as fs } from 'fs';
import path from 'path';
import { getBranding } from '../../../utils/branding';
import { logger } from '../../../utils/logger';
import { withApiLogging } from '../../../utils/apiLogging';

const FAVICON_FILE = 'favicon.ico';

// Where the tab icon is looked for, in order: the custom file in the data folder, then the default one
const faviconPaths = (): string[] => [
   path.join(process.cwd(), 'data', FAVICON_FILE),
   path.join(process.cwd(), 'public', FAVICON_FILE),
];

const respondNotFound = (res: NextApiResponse) => {
   res.setHeader('Cache-Control', 'no-store');
   res.status(404).end('Favicon not found');
};

/**
 * The browser tab icon for white-label installs: data/favicon.ico when it exists, the default favicon otherwise.
 * Only answers when NEXT_PUBLIC_WHITE_LABEL is true; the page links to /favicon.ico in every other case.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end('Method Not Allowed');
      return;
   }

   if (!getBranding().whiteLabelEnabled) {
      respondNotFound(res);
      return;
   }

   for (const filePath of faviconPaths()) {
      try {
         // The paths are fixed (the data and public folders plus a constant file name), never built from the request.
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         const file = await fs.readFile(filePath);
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
   }

   respondNotFound(res);
};

export default withApiLogging(handler, { name: 'branding/favicon' });
