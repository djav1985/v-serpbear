import type { NextApiRequest, NextApiResponse } from 'next';
import nodeMailer from 'nodemailer';
import db from '../../../database/database';
import Domain from '../../../database/models/domain';
import verifyUser from '../../../utils/verifyUser';
import { getAppSettings } from '../settings';
import { trimStringProperties } from '../../../utils/security';
import normalizeDomainBooleans from '../../../utils/normalizeDomain';
import generateKeywordIdeasEmail, { KeywordIdeasEmailKeyword } from '../../../utils/generateKeywordIdeasEmail';
import { getBranding } from '../../../utils/branding';
import { logger } from '../../../utils/logger';

type EmailKeywordIdeasRequest = {
   domain?: string;
   keywords?: KeywordIdeasEmailKeyword[];
};

type EmailKeywordIdeasResponse = {
   success?: boolean;
   error?: string | null;
};

const trimString = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

const sanitizeHostname = (host?: string | null): string => {
   const trimmed = trimString(host);
   return trimmed.replace(/\.+$/, '');
};

const normalizeKeywords = (keywords: KeywordIdeasEmailKeyword[] = []): KeywordIdeasEmailKeyword[] => keywords.map((keyword) => {
   const monthlyVolumes: Record<string, number> = {};
   const sourceVolumes = keyword.monthlySearchVolumes || {};
   Object.entries(sourceVolumes).forEach(([period, value]) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      if (typeof numeric === 'number' && Number.isFinite(numeric)) {
         monthlyVolumes[period] = numeric;
      }
   });
   const parsedCompetitionIndex = typeof keyword.competitionIndex === 'number'
      ? keyword.competitionIndex
      : (keyword.competitionIndex !== undefined && keyword.competitionIndex !== null && keyword.competitionIndex !== ''
         ? Number(keyword.competitionIndex)
         : undefined);
   const normalizedCompetitionIndex = typeof parsedCompetitionIndex === 'number' && Number.isFinite(parsedCompetitionIndex)
      ? parsedCompetitionIndex
      : undefined;
   return {
      keyword: trimString(keyword.keyword),
      avgMonthlySearches: typeof keyword.avgMonthlySearches === 'number'
         ? keyword.avgMonthlySearches
         : (Number.isFinite(Number(keyword.avgMonthlySearches)) ? Number(keyword.avgMonthlySearches) : undefined),
      monthlySearchVolumes: monthlyVolumes,
      competition: trimString(keyword.competition) || undefined,
      competitionIndex: normalizedCompetitionIndex,
   };
});

export default async function handler(req: NextApiRequest, res: NextApiResponse<EmailKeywordIdeasResponse>) {
   await db.sync();
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ success: false, error: authorized });
   }

   if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Invalid Method' });
   }

   return emailKeywordIdeas(req, res);
}

const emailKeywordIdeas = async (req: NextApiRequest, res: NextApiResponse<EmailKeywordIdeasResponse>) => {
   const body = (req.body || {}) as EmailKeywordIdeasRequest;
   const { platformName } = getBranding();
   const targetDomain = trimString(body.domain);
   if (!targetDomain) {
      return res.status(400).json({ success: false, error: 'A domain is required to email keyword ideas.' });
   }

   if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
      return res.status(400).json({ success: false, error: 'Select at least one keyword idea to email.' });
   }

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

      const domainRecord = await Domain.findOne({ where: { domain: targetDomain } })
         || await Domain.findOne({ where: { slug: targetDomain } });

      if (!domainRecord) {
         return res.status(404).json({ success: false, error: 'Domain not found.' });
      }

      const domainPlain = (domainRecord as any).get({ plain: true }) as DomainType;
      const normalizedDomain = normalizeDomainBooleans(domainPlain);

      const notificationEmails = trimString(normalizedDomain.notification_emails);
      if (!notificationEmails) {
         return res.status(400).json({ success: false, error: 'Notification email not configured for this domain.' });
      }

      const {
         smtp_server = '',
         smtp_port = '',
         smtp_username = '',
         smtp_password = '',
         notification_email_from = '',
         notification_email_from_name = platformName,
         smtp_tls_servername = '',
      } = normalizedSettings;

      if (!smtp_server) {
         return res.status(400).json({ success: false, error: 'SMTP has not been setup properly!' });
      }

      const mailerSettings: any = {
         host: smtp_server,
         port: (() => {
            const portNum = parseInt(smtp_port, 10);
            if (Number.isFinite(portNum)) {
               return Math.max(1, Math.min(65535, portNum));
            }
            return 587;
         })(),
      };

      const tlsServername = sanitizeHostname(smtp_tls_servername);
      if (tlsServername) {
         mailerSettings.tls = { servername: tlsServername };
      }

      const sanitizedUser = trimString(smtp_username);
      const sanitizedPass = trimString(smtp_password);
      if (sanitizedUser || sanitizedPass) {
         mailerSettings.auth = {};
         if (sanitizedUser) mailerSettings.auth.user = sanitizedUser;
         if (sanitizedPass) mailerSettings.auth.pass = sanitizedPass;
      }

      const transporter = nodeMailer.createTransport(mailerSettings);
      const normalizedKeywords = normalizeKeywords(body.keywords);
      const emailHTML = generateKeywordIdeasEmail({
         domain: normalizedDomain.domain,
         keywords: normalizedKeywords,
         platformName,
      });

      const fromAddress = trimString(notification_email_from) || 'no-reply@serpbear.com';
      const fromName = trimString(notification_email_from_name) || platformName;
      const fromEmail = `${fromName} <${fromAddress}>`;

      await transporter.sendMail({
         from: fromEmail,
         to: notificationEmails,
       subject: `[${normalizedDomain.domain}] Keyword Ideas`,
         html: emailHTML,
      });

      logger.info(`Sent keyword ideas email for ${normalizedDomain.domain}`);
      return res.status(200).json({ success: true, error: null });
   } catch (error) {
      logger.error('Error sending keyword ideas email', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error && error.message ? error.message : 'Error sending keyword ideas email.';
      return res.status(500).json({ success: false, error: message });
   }
};
