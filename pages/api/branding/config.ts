import type { NextApiRequest, NextApiResponse } from 'next';
import { getBranding } from '../../../utils/branding';
import { logger } from '../../../utils/logger';

type BrandingResponse = ReturnType<typeof getBranding>;

const handler = (req: NextApiRequest, res: NextApiResponse<BrandingResponse | { error: string }>) => {
   if (req.method !== 'GET') {
      logger.debug(`Method not allowed for branding config: ${req.method}`);
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
   }

   const branding = getBranding();
   res.setHeader('Cache-Control', 'no-store, max-age=0');
   res.status(200).json(branding);
};

export default handler;
