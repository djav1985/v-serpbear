/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { OAuth2Client } from 'google-auth-library';
import { readFile, writeFile } from 'fs/promises';
import Cryptr from 'cryptr';
import db from '../../database/database';
import verifyUser from '../../utils/verifyUser';
import { getAdwordsCredentials, getAdwordsKeywordIdeas } from '../../utils/adwords';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';

type adwordsValidateResp = {
   valid: boolean
   error?: string|null,
}

type IntegrationResultOptions = {
   success: boolean;
   message?: string;
   statusCode?: number;
};

const respondWithIntegrationResult = (
   req: NextApiRequest,
   res: NextApiResponse,
   { success, message = '', statusCode }: IntegrationResultOptions,
) => {
   const host = req.headers.host || '';
   const protocol = host.includes('localhost:') ? 'http://' : 'https://';
   const origin = `${protocol}${host}`;
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
          logger.warn('Failed to notify opener', { error: err?.message || String(err) });
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
   await db.sync();
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   if (req.method === 'GET') {
      return getAdwordsRefreshToken(req, res);
   }
   if (req.method === 'POST') {
      return validateAdwordsIntegration(req, res);
   }
   return res.status(502).json({ error: 'Unrecognized Route.' });
}

const getAdwordsRefreshToken = async (req: NextApiRequest, res: NextApiResponse) => {
   try {
      const code = (req.query.code as string);
      const https = req.headers.host?.includes('localhost:') ? 'http://' : 'https://';
      const redirectURL = `${https}${req.headers.host}/api/adwords`;

      if (code) {
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
               await writeFile(`${process.cwd()}/data/settings.json`, JSON.stringify({ ...settings, adwords_refresh_token }), { encoding: 'utf-8' });
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
            logger.debug('[Error] Getting Google Ads Refresh Token! Reason: ', { data: errorMsg });
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

const validateAdwordsIntegration = async (req: NextApiRequest, res: NextApiResponse<adwordsValidateResp>) => {
   const errMsg = 'Error Validating Google Ads Integration. Please make sure your provided data are correct!';
   const { developer_token, account_id } = req.body;
   if (!developer_token || !account_id) {
      return res.status(400).json({ valid: false, error: 'Please Provide the Google Ads Developer Token and Test Account ID' });
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
         return res.status(400).json({ valid: false, error: errMsg });
      }

      const securedSettings = {
         ...settings,
         adwords_developer_token: encryptedDeveloperToken,
         adwords_account_id: encryptedAccountId,
      };

      await writeFile(`${process.cwd()}/data/settings.json`, JSON.stringify(securedSettings), { encoding: 'utf-8' });

      return res.status(200).json({ valid: true });
   } catch (error) {
      logger.error('Validating Google Ads Integration: ', error instanceof Error ? error : new Error(String(error)));
      return res.status(400).json({ valid: false, error: errMsg });
   }
};

export default withApiLogging(handler, { name: 'adwords' });
