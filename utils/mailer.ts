import nodeMailer from 'nodemailer';
import { trimString, sanitizeSmtpHost } from './security';
import { getBranding } from './branding';

export const DEFAULT_SMTP_PORT = 587;
export const DEFAULT_FROM_ADDRESS = 'no-reply@serpbear.com';

/**
 * Builds the nodemailer transporter and the formatted "From" header from the app SMTP settings.
 * Expects settings that were already passed through trimStringProperties; the host and TLS servername
 * are sanitized here as well. Does not validate the host: callers decide how to handle a missing server.
 */
export const buildMailer = (settings: SettingsType) => {
   const { platformName } = getBranding();

   const smtpHost = sanitizeSmtpHost(settings.smtp_server);
   const tlsServername = sanitizeSmtpHost(settings.smtp_tls_servername);
   const portNum = parseInt(String(settings.smtp_port ?? ''), 10);
   const validPort = isNaN(portNum) ? DEFAULT_SMTP_PORT : Math.max(1, Math.min(65535, portNum));

   const mailerSettings: any = { host: smtpHost, port: validPort };
   if (tlsServername) {
      mailerSettings.tls = { servername: tlsServername };
   }

   const user = trimString(settings.smtp_username);
   const pass = trimString(settings.smtp_password);
   if (user || pass) {
      mailerSettings.auth = {};
      if (user) mailerSettings.auth.user = user;
      if (pass) mailerSettings.auth.pass = pass;
   }

   const transporter = nodeMailer.createTransport(mailerSettings);

   const fromAddress = trimString(settings.notification_email_from) || DEFAULT_FROM_ADDRESS;
   const fromName = trimString(settings.notification_email_from_name) || platformName;
   const fromEmail = `${fromName} <${fromAddress}>`;

   return { transporter, fromEmail };
};

export default buildMailer;
