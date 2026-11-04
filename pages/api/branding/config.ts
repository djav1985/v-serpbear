/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { getBranding } from '../../../utils/branding';
import { logger } from '../../../utils/logger';
import { withApiLogging } from '../../../utils/apiLogging';
import { errorResponse } from '../../../utils/api/response';

export type BrandingConfigResponse = ReturnType<typeof getBranding> & { screenshots: boolean };
type BrandingResponse = BrandingConfigResponse;

// Read at request time (not build time) so docker-compose env changes take effect without a rebuild.
// SCREENSHOTS is the runtime name; NEXT_PUBLIC_SCREENSHOTS is still honoured for existing setups.
const isScreenshotsEnabled = (): boolean => {
   const normalized = (process.env.SCREENSHOTS || process.env.NEXT_PUBLIC_SCREENSHOTS || 'true').trim().toLowerCase();
   return !['false', '0', 'off', 'disabled', 'no'].includes(normalized);
};

const handler = (req: NextApiRequest, res: NextApiResponse<BrandingResponse | ReturnType<typeof errorResponse>>) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (req.method !== 'GET') {
      logger.debug(`Method not allowed for branding config: ${req.method}`);
      res.setHeader('Allow', 'GET');
      res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
      return;
   }

   const branding = getBranding();
   res.setHeader('Cache-Control', 'no-store, max-age=0');
   res.status(200).json({ ...branding, screenshots: isScreenshotsEnabled() });
};

export default withApiLogging(handler, { name: 'branding/config' });
