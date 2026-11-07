/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { getBranding } from '../../../utils/branding';
import { ensureBrandingAssets } from '../../../utils/brandingAssets';
import { logger } from '../../../utils/logger';
import { withApiLogging } from '../../../utils/apiLogging';
import { errorResponse } from '../../../utils/api/response';

export type BrandingConfigResponse = ReturnType<typeof getBranding>;
type BrandingResponse = BrandingConfigResponse;

const handler = (req: NextApiRequest, res: NextApiResponse<BrandingResponse | ReturnType<typeof errorResponse>>) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (req.method !== 'GET') {
      logger.debug(`Method not allowed for branding config: ${req.method}`);
      res.setHeader('Allow', 'GET');
      res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
      return;
   }

   // The white-label variables are read at request time, and the two files are looked for once per start
   ensureBrandingAssets();
   const branding = getBranding();
   res.setHeader('Cache-Control', 'no-store, max-age=0');
   res.status(200).json(branding);
};

export default withApiLogging(handler, { name: 'branding/config' });
