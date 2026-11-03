/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import nodeMailer from 'nodemailer';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import generateEmail from '../../utils/generateEmail';
import parseKeywords from '../../utils/parseKeywords';
import getdomainStats from '../../utils/domains';
import verifyUser from '../../utils/verifyUser';
import { canSendEmail, recordEmailSent } from '../../utils/emailThrottle';
import { getAppSettings } from './settings';
import { trimStringProperties, trimString, sanitizeSmtpHost } from '../../utils/security';
import { getBranding } from '../../utils/branding';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import normalizeDomainBooleans from '../../utils/normalizeDomain';
import { errorResponse } from '../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'POST') {
      return notify(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, { name: 'notify' });

const notify = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const reqDomain = req?.query?.domain as string || '';
   try {
      const settings = await getAppSettings();
      const normalizedSettings: SettingsType = trimStringProperties({ ...settings });

      const sanitizedHost = sanitizeSmtpHost(normalizedSettings.smtp_server);
      const sanitizedPort = normalizedSettings.smtp_port;
      const sanitizedDefaultEmail = normalizedSettings.notification_email;

      normalizedSettings.smtp_server = sanitizedHost;
      normalizedSettings.smtp_port = sanitizedPort;
      normalizedSettings.notification_email = sanitizedDefaultEmail;
      normalizedSettings.smtp_tls_servername = sanitizeSmtpHost(normalizedSettings.smtp_tls_servername);

      if (!sanitizedHost || !sanitizedPort || !sanitizedDefaultEmail) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'SMTP has not been setup properly!', requestId));
      }

      let sentCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      // A domain takes part only when scraping is enabled and it has a notification interval other than "never".
      const isNotifiable = (domain: DomainType) => domain.scrapeEnabled
         && domain.notification_interval !== 'never';

      // A send skipped on purpose (no address, or throttled) is counted apart from a failure, so skipped
      // domains never turn the response into an error.
      const notifyDomain = async (domain: DomainType) => {
         try {
            const outcome = await sendNotificationEmail(domain, normalizedSettings);
            if (outcome === 'sent') { sentCount++; } else { skippedCount++; }
         } catch (error) {
            failedCount++;
            const domainName = domain?.domain || 'unknown domain';
            logger.error(`Failed to send notification for ${domainName}`, error instanceof Error ? error : new Error(String(error)));
         }
      };

      if (reqDomain) {
         const theDomain = await Domain.findOne({ where: { domain: reqDomain } });
         if (theDomain) {
            const normalizedDomain = normalizeDomainBooleans(theDomain.get({ plain: true }) as DomainType);
            if (isNotifiable(normalizedDomain)) {
               await notifyDomain(normalizedDomain);
            }
         }
      } else {
         const allDomains: Domain[] = await Domain.findAll();
         if (allDomains && allDomains.length > 0) {
            const domains = allDomains.map((el) => normalizeDomainBooleans(el.get({ plain: true }) as DomainType));
            for (const domain of domains) {
               if (isNotifiable(domain)) {
                  await notifyDomain(domain);
               }
            }
         }
      }

      // Only real send failures are errors: every eligible domain failed and none was sent
      if (failedCount > 0 && sentCount === 0) {
         return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'All notification emails failed to send. Please check your SMTP configuration.', requestId));
      }

      // No eligible domains at all: tell the user nothing was sent
      if (sentCount === 0 && skippedCount === 0) {
         return res.status(200).json({ success: true, error: null, sent: 0, skipped: 0, message: 'No domains are enabled for notifications.' });
      }

      return res.status(200).json({ success: true, error: null, sent: sentCount, skipped: skippedCount });
   } catch (error) {
      logger.error('Error sending notification emails', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error && error.message ? error.message : 'Error Sending Notification Email.';
      const isConfigError = error instanceof Error && error.message === 'Invalid SMTP host configured.';
      return res.status(isConfigError ? 400 : 500).json(errorResponse(isConfigError ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR', message, requestId));
   }
};

/**
 * Sends the notification email for one domain. Resolves to 'sent', or to 'skipped' when the domain has no
 * notification address or the throttle held it back. A domain with no address never falls back to the global address.
 */
const sendNotificationEmail = async (domain: DomainType, settings: SettingsType): Promise<'sent' | 'skipped'> => {
   const domainName = domain.domain;
   const recipients = trimString(domain.notification_emails);
   if (!recipients) {
      logger.info(`Skipping email for ${domainName}: no notification address set for this domain`);
      return 'skipped';
   }

   // Check email throttling
   const throttleCheck = await canSendEmail(domainName);
   if (!throttleCheck.canSend) {
      logger.info(`Skipping email for ${domainName}: ${throttleCheck.reason}`);
      return 'skipped';
   }

   const { platformName } = getBranding();

   const {
      smtp_server = '',
      smtp_port = '',
      smtp_username = '',
      smtp_password = '',
      notification_email_from = '',
      notification_email_from_name = platformName,
      smtp_tls_servername = '',
     } = settings;

   if (!smtp_server) {
      throw new Error('Invalid SMTP host configured.');
   }

   const tlsServername = sanitizeSmtpHost(smtp_tls_servername);
   const fromAddress = notification_email_from || 'no-reply@serpbear.com';
   const fromName = notification_email_from_name || platformName;
   const fromEmail = `${fromName} <${fromAddress}>`;
   const portNum = parseInt(smtp_port, 10);
   const validPort = isNaN(portNum) ? 587 : Math.max(1, Math.min(65535, portNum)); // Default to 587, validate range
   const mailerSettings:any = { host: smtp_server, port: validPort };
   if (tlsServername) {
      mailerSettings.tls = { servername: tlsServername };
   }
   const sanitizedUser = smtp_username;
   const sanitizedPass = smtp_password;
   if (sanitizedUser || sanitizedPass) {
      mailerSettings.auth = {};
      if (smtp_username) mailerSettings.auth.user = smtp_username;
      if (smtp_password) mailerSettings.auth.pass = smtp_password;
   }

   try {
      const transporter = nodeMailer.createTransport(mailerSettings);
      const query = { where: { domain: domainName } };
      const domainKeywords:Keyword[] = await Keyword.findAll(query);
      const keywordsArray = domainKeywords.map((el) => el.get({ plain: true }));
      const keywords: KeywordType[] = parseKeywords(keywordsArray);
      
      // Calculate domain stats to ensure email shows correct tracker summary
      const domainsWithStats = await getdomainStats([domain]);
      const domainWithStats = domainsWithStats[0] || domain;
      
      const emailHTML = await generateEmail(domainWithStats, keywords, settings);

      await transporter.sendMail({
         from: fromEmail,
         to: recipients,
         subject: `[${domainName}] Keyword Positions Update`,
         html: emailHTML,
      });

      // Record successful email send
      await recordEmailSent(domainName);
      logger.info(`Successfully sent notification for ${domainName}`);
      return 'sent';

   } catch (error:any) {
      logger.error('Error sending notification email', error instanceof Error ? error : new Error(String(error)), { domain: domainName });
      throw error; // Re-throw to let caller handle
   }
};
