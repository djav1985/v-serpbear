import { promises as fs } from 'fs';
import path from 'path';
import { getBranding, LOGO_FILE, LOGO_MIME_TYPE } from '../../../../utils/branding';
import { logger } from '../../../../utils/logger';
import { createRoute } from '../../../../utils/apiLogging';

// Both paths are fixed constants, so no part of a path comes from the request or the environment.
const customLogoPath = path.join(process.cwd(), 'data', LOGO_FILE);
const defaultLogoPath = path.join(process.cwd(), 'public', 'icon.png');

const readFile = async (filePath: string): Promise<Buffer | null> => {
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return await fs.readFile(filePath);
   } catch (_error) {
      return null;
   }
};

/**
 * The one logo URL. It always answers with an image: the white-label logo (data/logo.png) when white-label is on and the
 * file exists, otherwise the bundled default (public/icon.png). Pages, the tab icon, the manifest and emails can all point
 * here without a fallback of their own. It is a fixed route, so no other file name is ever served. HEAD is answered by Next from GET.
 */
const getLogo = async () => {
   const custom = getBranding().hasCustomLogo ? await readFile(customLogoPath) : null;
   const file = custom ?? await readFile(defaultLogoPath);

   if (!file) {
      logger.error('No logo file could be found, not even the bundled default');
      return new Response('Logo not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
   }

   return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
         'Content-Type': LOGO_MIME_TYPE,
         'Content-Length': file.length.toString(),
         // No `immutable`: the file keeps its name when a new logo is uploaded. The default is cached for less time,
         // so a logo added later is picked up quickly.
         'Cache-Control': custom ? 'public, max-age=3600' : 'public, max-age=300',
      },
   });
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'images/logo', auth: false, GET: getLogo });
