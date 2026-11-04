// Migration: notification emails are now taken only from each domain's notification_emails. Installs that
// relied on the global "notification_email" setting would stop receiving mail, so copy that address onto every
// domain that has none. The global value is left in settings.json (it is only read here).

const fs = require('fs');
const path = require('path');
const { logger } = require('../migrationLogger');

const settingsPath = () => path.join(process.cwd(), 'data', 'settings.json');

const readGlobalNotificationEmail = () => {
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const parsed = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
      const value = typeof parsed?.notification_email === 'string' ? parsed.notification_email.trim() : '';
      return value;
   } catch (_error) {
      return '';
   }
};

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='domain'",
            { transaction }
         );
         if (!tables || tables.length === 0) {
            logger.info('[MIGRATION] Skipping notification email copy - domain table does not exist yet');
            return;
         }

         const globalEmail = readGlobalNotificationEmail();
         if (!globalEmail) {
            return;
         }

         const [result] = await queryInterface.sequelize.query(
            "UPDATE domain SET notification_emails = :email WHERE notification_emails IS NULL OR TRIM(notification_emails) = ''",
            { transaction, replacements: { email: globalEmail } }
         );
         logger.info(`Copied the global notification email onto domains without one (${result?.changes ?? 'unknown number of'} row(s)).`);
      });
   },

   // Data-only migration: copied addresses are not removed on rollback
   down: async function down() {
      logger.info('[MIGRATION] Global notification email copy has no rollback.');
   },
};

module.exports.readGlobalNotificationEmail = readGlobalNotificationEmail;
