/**
 * Migration-safe logger for database migration scripts.
 *
 * Tries to use the project's structured logger (utils/logger) first.
 * Falls back to a JSON-schema-compatible console wrapper when running
 * under plain Node.js (e.g. sequelize-cli, entrypoint.sh) where TypeScript
 * source files cannot be required directly.
 *
 * Output schema mirrors utils/logger's LogEntry:
 *   { timestamp, level, message, meta?, error? }
 */

/* eslint-disable no-console */
let _logger;
try {
  _logger = require('../utils/logger').logger;
} catch (_) {
  const mkEntry = (level, message, meta, error) => {
    const entry = { timestamp: new Date().toISOString(), level, message };
    if (meta) entry.meta = meta;
    if (error) {
      entry.error = { name: error.name, message: error.message, stack: error.stack };
    }
    return JSON.stringify(entry);
  };

  _logger = {
    info:  (msg, meta)      => console.log(mkEntry('INFO',  msg, meta)),
    warn:  (msg, meta)      => console.log(mkEntry('WARN',  msg, meta)),
    error: (msg, err, meta) => console.log(mkEntry('ERROR', msg, meta, err instanceof Error ? err : undefined)),
    debug: (msg, meta)      => console.log(mkEntry('DEBUG', msg, meta)),
  };
}
/* eslint-enable no-console */

module.exports = { logger: _logger };
