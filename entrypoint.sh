#!/bin/sh
set -eu
set -o pipefail 2>/dev/null || true

prepare_data_dir() {
  mkdir -p ./data
}

run_migrations() {
  echo "Running database migrations..."
  node <<'NODE'
const { Sequelize } = require('sequelize');
const { Umzug, SequelizeStorage } = require('umzug');
const sqliteDialect = require('./database/sqlite-dialect');

async function run() {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    dialectModule: sqliteDialect,
    storage: './data/database.sqlite',
    logging: false,
  });

  try {
    const umzug = new Umzug({
      migrations: { glob: 'database/migrations/*' },
      context: sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize }),
      logger: undefined,
    });

    await umzug.up();
  } finally {
    await sequelize.close();
  }
}

run().catch((error) => {
  console.error('Database migration failed:', error);
  process.exit(1);
});
NODE
}

# Runs the cron worker under a restart loop, so a crash does not silently stop scheduled scrapes and emails.
start_cron() {
  (
    while true; do
      echo "Starting background cron worker..."
      npx tsx ./cron.js || true
      echo "Cron worker exited; restarting in 10 seconds..." >&2
      sleep 10
    done
  ) &
}

prepare_data_dir
run_migrations
start_cron

echo "Starting application: $*"
exec "$@"
