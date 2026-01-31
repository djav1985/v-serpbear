/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import nodeMailer from 'nodemailer';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import generateEmail from '../../utils/generateEmail';
import parseKeywords from '../../utils/parseKeywords';
import getdomainStats from '../../utils/domains';
import verifyUser from '../../utils/verifyUser';
import { canSendEmail, recordEmailSent } from '../../utils/emailThrottle';
import { getAppSettings } from './settings';
import { trimStringProperties } from '../../utils/security';
import { getBranding } from '../../utils/branding';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import normalizeDomainBooleans from '../../utils/normalizeDomain';

type NotifyResponse = {
   success?: boolean
   error?: string|null,
}

const trimString = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

const sanitizeHostname = (host?: string | null): string => {
   const trimmed = trimString(host);
   return trimmed.replace(/\.+$/, '');
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ success: false, error: authorized });
   }
   if (req.method === 'POST') {
      return notify(req, res);
   }
   return res.status(405).json({ success: false, error: 'Invalid Method' });
}

export default withApiLogging(handler, { name: 'notify' });

const notify = async (req: NextApiRequest, res: NextApiResponse<NotifyResponse>) => {
   const reqDomain = req?.query?.domain as string || '';
   try {
      const settings = await getAppSettings();
      const normalizedSettings: SettingsType = trimStringProperties({ ...settings });

      const sanitizedHost = sanitizeHostname(normalizedSettings.smtp_server);
      const sanitizedPort = normalizedSettings.smtp_port;
      const sanitizedDefaultEmail = normalizedSettings.notification_email;

      normalizedSettings.smtp_server = sanitizedHost;
      normalizedSettings.smtp_port = sanitizedPort;
      normalizedSettings.notification_email = sanitizedDefaultEmail;
      normalizedSettings.smtp_tls_servername = sanitizeHostname(normalizedSettings.smtp_tls_servername);

      if (!sanitizedHost || !sanitizedPort || !sanitizedDefaultEmail) {
         return res.status(400).json({ success: false, error: 'SMTP has not been setup properly!' });
      }

      let successCount = 0;
      let attemptCount = 0;

      if (reqDomain) {
         const theDomain = await Domain.findOne({ where: { domain: reqDomain } });
         if (theDomain) {
            const domainPlain = theDomain.get({ plain: true }) as DomainType;
            const normalizedDomain = normalizeDomainBooleans(domainPlain);
            if (normalizedDomain.scrapeEnabled && normalizedDomain.notification) {
               attemptCount++;
               try {
                  await sendNotificationEmail(normalizedDomain, normalizedSettings);
                  successCount++;
               } catch (error) {
                  const domainName = normalizedDomain?.domain || 'unknown domain';
                  logger.error(`Failed to send notification for ${domainName}`, error instanceof Error ? error : new Error(String(error)));
               }
            }
         }
      } else {
         const allDomains: Domain[] = await Domain.findAll();
         if (allDomains && allDomains.length > 0) {
            const domains = allDomains.map((el) => normalizeDomainBooleans(el.get({ plain: true }) as DomainType));
            for (const domain of domains) {
               if (domain.scrapeEnabled && domain.notification) {
                  attemptCount++;
                  try {
                     await sendNotificationEmail(domain, normalizedSettings);
                     successCount++;
                  } catch (error) {
                     const domainName = domain?.domain || 'unknown domain';
                     logger.error(`Failed to send notification for ${domainName}`, error instanceof Error ? error : new Error(String(error)));
                  }
               }
            }
         }
      }

      // If we attempted to send emails but none succeeded, return an error
      if (attemptCount > 0 && successCount === 0) {
         return res.status(500).json({ success: false, error: 'All notification emails failed to send. Please check your SMTP configuration.' });
      }

      return res.status(200).json({ success: true, error: null });
   } catch (error) {
      logger.error('Error sending notification emails', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error && error.message ? error.message : 'Error Sending Notification Email.';
      const isConfigError = error instanceof Error && error.message === 'Invalid SMTP host configured.';
      return res.status(isConfigError ? 400 : 500).json({ success: false, error: message });
   }
};

const sendNotificationEmail = async (domain: DomainType | Domain, settings: SettingsType) => {
   const domainObj: DomainType = (domain as any).get ? (domain as any).get({ plain: true }) : domain as DomainType;
   const domainName = domainObj.domain;

   // Check email throttling
   const throttleCheck = await canSendEmail(domainName);
   if (!throttleCheck.canSend) {
      logger.info(`Skipping email for ${domainName}: ${throttleCheck.reason}`);
      return;
   }

   const { platformName } = getBranding();

   const {
      smtp_server = '',
      smtp_port = '',
      smtp_username = '',
      smtp_password = '',
      notification_email = '',
      notification_email_from = '',
      notification_email_from_name = platformName,
      smtp_tls_servername = '',
     } = settings;

   if (!smtp_server) {
      throw new Error('Invalid SMTP host configured.');
   }

   const tlsServername = sanitizeHostname(smtp_tls_servername);
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
      const domainsWithStats = await getdomainStats([domainObj]);
      const domainWithStats = domainsWithStats[0] || domainObj;
      
      const emailHTML = await generateEmail(domainWithStats, keywords, settings);

      const domainNotificationEmails = trimString(domain.notification_emails);
      const fallbackNotification = notification_email;

      await transporter.sendMail({
         from: fromEmail,
         to: domainNotificationEmails || fallbackNotification,
         subject: `[${domainName}] Keyword Positions Update`,
         html: emailHTML,
      });
      
      // Record successful email send
      await recordEmailSent(domainName);
      logger.info(`Successfully sent notification for ${domainName}`);
      
   } catch (error:any) {
      logger.error('Error sending notification email', error instanceof Error ? error : new Error(String(error)), { domain: domainName });
      throw error; // Re-throw to let caller handle
   }
};
