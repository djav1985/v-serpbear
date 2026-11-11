import { promises as fs } from 'fs';
import path from 'path';
import { getBranding, LOGO_MIME_TYPE } from '../branding';
import { logger } from '../logger';

// All paths are fixed constants, so no part of a path comes from the request or the environment.
const DEFAULT_IMAGE_PATH = path.join(process.cwd(), 'public', 'icon.png');

const readFile = async (filePath: string): Promise<Buffer | null> => {
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return await fs.readFile(filePath);
   } catch (_error) {
      return null;
   }
};

/**
 * Serves one white-label image. It always answers with an image: `data/<fileName>` when white-label is on and the file
 * exists, otherwise the bundled default (public/icon.png). HEAD is answered by Next from GET.
 */
export const serveBrandImage = async (fileName: 'logo.png' | 'favicon.png'): Promise<Response> => {
   const custom = getBranding().hasCustomLogo ? await readFile(path.join(process.cwd(), 'data', fileName)) : null;
   const file = custom ?? await readFile(DEFAULT_IMAGE_PATH);

   if (!file) {
      logger.error(`No ${fileName} could be found, not even the bundled default`);
      return new Response('Image not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
   }

   return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
         'Content-Type': LOGO_MIME_TYPE,
         'Content-Length': file.length.toString(),
         // Logo URLs cache for one year; favicons refresh after one week.
         'Cache-Control': fileName === 'favicon.png' ? 'public, max-age=604800' : 'public, max-age=31536000',
      },
   });
};
