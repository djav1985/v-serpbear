/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { OAuth2Client } from 'google-auth-library';
import { readFile } from 'fs/promises';
import Cryptr from 'cryptr';
import Cookies from 'cookies';
import { randomBytes, timingSafeEqual } from 'crypto';
import verifyUser from '../../utils/verifyUser';
import { getAdwordsCredentials, getAdwordsKeywordIdeas } from '../../utils/adwords';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { atomicWriteFile } from '../../utils/atomicWrite';
import { errorResponse } from '../../utils/api/response';
import normalizeOrigin from '../../utils/normalizeOrigin';
import isRequestSecure from '../../utils/api/isRequestSecure';


type IntegrationResultOptions = {
   success: boolean;
   message?: string;
   statusCode?: number;
};

const OAUTH_STATE_COOKIE = 'adwords_oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const getTrustedOrigin = (req: NextApiRequest) => {
   const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '');
   if (configuredOrigin) {
      return configuredOrigin;
   }
   return '';
};

const oauthCookies = (req: NextApiRequest, res: NextApiResponse) => {
   const secure = isRequestSecure(req) || !req.headers.host?.includes('localhost:');
   return {
      cookies: new Cookies(req, res, { secure }),
      options: { httpOnly: true, secure, sameSite: 'lax' as const, path: '/api/adwords' },
   };
};

const respondWithIntegrationResult = (
   req: NextApiRequest,
   res: NextApiResponse,
   { success, message = '', statusCode }: IntegrationResultOptions,
) => {
   const origin = getTrustedOrigin(req);
   const status = success ? 'success' : 'error';
   const payload = { type: 'adwordsIntegrated', status, message };
   const redirectUrl = `${origin}/settings?ads=integrated&status=${status}${message ? `&detail=${encodeURIComponent(message)}` : ''}`;

   const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Google Ads Integration</title>
  </head>
  <body>
    <script>
      (function() {
        const payload = ${JSON.stringify(payload)};
        const redirectUrl = ${JSON.stringify(redirectUrl)};
        try {
          if (window.opener && typeof window.opener.postMessage === 'function') {
            window.opener.postMessage(payload, window.location.origin);
            window.close();
            return;
          }
        } catch (err) {
          console.warn('Failed to notify opener', err?.message || String(err));
        }
        if (redirectUrl) {
          window.location.replace(redirectUrl);
        }
      })();
    </script>
    <p>Google Ads integration ${success ? 'completed' : 'failed'}. You can close this window.</p>
  </body>
</html>`;

   return res
      .status(statusCode ?? (success ? 200 : 400))
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(html);
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;

   if (req.method === 'GET' && typeof req.query.code === 'string' && req.query.code.trim()) {
      return getAdwordsRefreshToken(req, res);
   }

   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      return beginAdwordsIntegration(req, res);
   }
   if (req.method === 'POST') {
      return validateAdwordsIntegration(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

const beginAdwordsIntegration = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   try {
      const trustedOrigin = getTrustedOrigin(req);
      if (!trustedOrigin) {
         return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'A trusted APP_URL or NEXT_PUBLIC_APP_URL must be configured for OAuth.', requestId));
      }
      const settingsRaw = await readFile(`${process.cwd()}/data/settings.json`, { encoding: 'utf-8' });
      const settings: SettingsType = settingsRaw ? JSON.parse(settingsRaw) : {};
      const cryptr = new Cryptr(process.env.SECRET as string);
      const clientId = settings.adwords_client_id ? cryptr.decrypt(settings.adwords_client_id) : '';
      if (!clientId) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Google Ads client ID is not configured.', requestId));
      }
      const state = randomBytes(32).toString('base64url');
      const { cookies, options } = oauthCookies(req, res);
      cookies.set(OAUTH_STATE_COOKIE, state, { ...options, maxAge: OAUTH_STATE_TTL_MS / 1000, expires: new Date(Date.now() + OAUTH_STATE_TTL_MS) });
      const redirectUri = `${trustedOrigin}/api/adwords`;
      const params = new URLSearchParams({
         access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/adwords',
         response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
      });
      return res.status(200).json({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
   } catch (error) {
      logger.error('Starting Google Ads OAuth integration', error instanceof Error ? error : new Error(String(error)));
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Unable to start Google Ads integration.', requestId));
   }
};

const getAdwordsRefreshToken = async (req: NextApiRequest, res: NextApiResponse) => {
   try {
      const code = (req.query.code as string);
      const trustedOrigin = getTrustedOrigin(req);
      if (!trustedOrigin) {
         return respondWithIntegrationResult(req, res, {
            success: false,
            message: 'OAuth callback rejected because trusted app origin is not configured.',
            statusCode: 500,
         });
      }
      const redirectURL = `${trustedOrigin}/api/adwords`;

      if (code) {
         const suppliedState = typeof req.query.state === 'string' ? req.query.state : '';
         const { cookies, options } = oauthCookies(req, res);
         const expectedState = cookies.get(OAUTH_STATE_COOKIE) || '';
         // Consume before any asynchronous work so every callback attempt is one-time.
         cookies.set(OAUTH_STATE_COOKIE, '', { ...options, maxAge: 0, expires: new Date(0) });
         const stateMatches = suppliedState.length === expectedState.length && suppliedState.length > 0
            && timingSafeEqual(Buffer.from(suppliedState), Buffer.from(expectedState));
         if (!stateMatches) {
            return respondWithIntegrationResult(req, res, {
               success: false,
               message: 'Invalid or expired OAuth state. Please start the integration again.',
               statusCode: 400,
            });
         }
         try {
            const settingsRaw = await readFile(`${process.cwd()}/data/settings.json`, { encoding: 'utf-8' });
            const settings: SettingsType = settingsRaw ? JSON.parse(settingsRaw) : {};
            const cryptr = new Cryptr(process.env.SECRET as string);
            const adwords_client_id = settings.adwords_client_id ? cryptr.decrypt(settings.adwords_client_id) : '';
            const adwords_client_secret = settings.adwords_client_secret ? cryptr.decrypt(settings.adwords_client_secret) : '';
            const oAuth2Client = new OAuth2Client({
               clientId: adwords_client_id,
               clientSecret: adwords_client_secret,
               redirectUri: redirectURL,
            });
            const r = await oAuth2Client.getToken(code);
            if (r?.tokens?.refresh_token) {
               const adwords_refresh_token = cryptr.encrypt(r.tokens.refresh_token);
               await atomicWriteFile(`${process.cwd()}/data/settings.json`, JSON.stringify({ ...settings, adwords_refresh_token }), 'utf-8');
               return respondWithIntegrationResult(req, res, { success: true, message: 'Integrated.' });
            }
            return respondWithIntegrationResult(req, res, {
               success: false,
               message: 'Error Getting the Google Ads Refresh Token. Please Try Again!',
               statusCode: 400,
            });
         } catch (error:any) {
            let errorMsg = error?.response?.data?.error;
            if (typeof errorMsg !== 'string' || !errorMsg) {
               errorMsg = 'Unknown error retrieving Google Ads refresh token.';
            } else if (errorMsg.includes('redirect_uri_mismatch')) {
               errorMsg += ` Redirected URL: ${redirectURL}`;
            }
            logger.error('[Error] Getting Google Ads Refresh Token!', undefined, { reason: errorMsg, redirectURL });
            return respondWithIntegrationResult(req, res, {
               success: false,
               message: 'Error Saving the Google Ads Refresh Token. Please Try Again!',
               statusCode: 400,
            });
         }
      }

      return respondWithIntegrationResult(req, res, {
         success: false,
         message: 'No Code Provided By Google. Please Try Again!',
         statusCode: 400,
      });
   } catch (error) {
      logger.error('Getting Google Ads Refresh Token: ', error instanceof Error ? error : new Error(String(error)));
      return respondWithIntegrationResult(req, res, {
         success: false,
         message: 'Error Getting Google Ads Refresh Token. Please Try Again!',
         statusCode: 400,
      });
   }
};

const validateAdwordsIntegration = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const errMsg = 'Error Validating Google Ads Integration. Please make sure your provided data are correct!';
   const { developer_token, account_id } = (req.body ?? {}) as {
      developer_token?: string;
      account_id?: string;
   };
   if (!developer_token || !account_id) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Please Provide the Google Ads Developer Token and Test Account ID', requestId));
   }
   try {
      const settingsRaw = await readFile(`${process.cwd()}/data/settings.json`, { encoding: 'utf-8' });
      const settings: SettingsType = settingsRaw ? JSON.parse(settingsRaw) : {};
      const cryptr = new Cryptr(process.env.SECRET as string);
      const trimmedDeveloperToken = developer_token.trim();
      const trimmedAccountId = account_id.trim();
      const encryptedDeveloperToken = cryptr.encrypt(trimmedDeveloperToken);
      const encryptedAccountId = cryptr.encrypt(trimmedAccountId);

      const adwordsCreds = await getAdwordsCredentials();
      if (!adwordsCreds || !adwordsCreds.client_id || !adwordsCreds.client_secret || !adwordsCreds.refresh_token) {
         throw new Error('Missing Google Ads OAuth credentials.');
      }

      const testCredentials: AdwordsCredentials = {
         ...adwordsCreds,
         developer_token: trimmedDeveloperToken,
         account_id: trimmedAccountId,
      };

      const keywords = await getAdwordsKeywordIdeas(
         testCredentials,
         { country: 'US', language: '1000', keywords: ['compress'], seedType: 'custom' },
         true,
      );

      if (!keywords || !Array.isArray(keywords)) {
         return res.status(400).json(errorResponse('BAD_REQUEST', errMsg, requestId));
      }

      const securedSettings = {
         ...settings,
         adwords_developer_token: encryptedDeveloperToken,
         adwords_account_id: encryptedAccountId,
      };

      await atomicWriteFile(`${process.cwd()}/data/settings.json`, JSON.stringify(securedSettings), 'utf-8');

      return res.status(200).json({ valid: true });
   } catch (error) {
      logger.error('Validating Google Ads Integration: ', error instanceof Error ? error : new Error(String(error)));
      return res.status(400).json(errorResponse('BAD_REQUEST', errMsg, requestId));
   }
};

export default withApiLogging(handler, { name: 'adwords' });
