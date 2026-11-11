#!/bin/sh
set -eu

# Cron fire times and "today" use CRON_TIMEZONE. Export it as TZ so Node and child processes use the same zone.
TZ="${CRON_TIMEZONE:-America/New_York}"
export TZ

APP_SUPERVISOR_PID=""
CRON_SUPERVISOR_PID=""
LAST_STARTED_PID=""
SIGNAL_RECEIVED=""
FIRST_EXIT=""
FIRST_STATUS=0
STATUS_DIR=""

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

# Starts one service in the background under a small supervisor subshell. The supervisor forwards SIGTERM to the
# service, waits for it to exit, and writes its exit status to $STATUS_DIR/<name>. The supervisor's PID is left
# in LAST_STARTED_PID.
start_service() {
  name="$1"
  shift
  (
    child=""
    trap 'if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null || true; fi' TERM INT
    "$@" &
    child=$!
    status=0
    wait "$child" || status=$?
    # wait returns early when a trapped signal arrives, so keep waiting until the service has really exited.
    while kill -0 "$child" 2>/dev/null; do
      wait "$child" || status=$?
    done
    printf '%s\n' "$status" > "$STATUS_DIR/$name.tmp" && mv "$STATUS_DIR/$name.tmp" "$STATUS_DIR/$name"
  ) &
  LAST_STARTED_PID=$!
}

# Sends SIGTERM to both supervisors. A supervisor that has already finished is harmless to signal.
stop_children() {
  if [ -n "$APP_SUPERVISOR_PID" ]; then kill -TERM "$APP_SUPERVISOR_PID" 2>/dev/null || true; fi
  if [ -n "$CRON_SUPERVISOR_PID" ]; then kill -TERM "$CRON_SUPERVISOR_PID" 2>/dev/null || true; fi
}

on_signal() {
  SIGNAL_RECEIVED=1
  echo "Shutdown signal received; stopping application and cron worker..." >&2
  stop_children
}

prepare_data_dir
run_migrations

STATUS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/serpbear-run.XXXXXX")"

# Forward signals only once the services are running, so a signal during migrations keeps the default behaviour.
start_service cron node --import tsx ./cron.js
CRON_SUPERVISOR_PID="$LAST_STARTED_PID"
echo "Started background cron worker."

echo "Starting application: $*"
start_service app "$@"
APP_SUPERVISOR_PID="$LAST_STARTED_PID"

trap on_signal TERM INT

# Wait until both services have exited. If one exits on its own, stop the other so the container exits and
# Docker's restart policy can bring it back up.
while [ ! -f "$STATUS_DIR/app" ] || [ ! -f "$STATUS_DIR/cron" ]; do
  if [ -z "$FIRST_EXIT" ] && { [ -f "$STATUS_DIR/app" ] || [ -f "$STATUS_DIR/cron" ]; }; then
    if [ -f "$STATUS_DIR/app" ]; then
      FIRST_EXIT=app
    else
      FIRST_EXIT=cron
    fi
    FIRST_STATUS="$(cat "$STATUS_DIR/$FIRST_EXIT")"
    if [ -z "$SIGNAL_RECEIVED" ]; then
      echo "The $FIRST_EXIT process exited with status $FIRST_STATUS; stopping the other process." >&2
    fi
    stop_children
  fi
  sleep 1
done

APP_STATUS="$(cat "$STATUS_DIR/app")"
rm -rf "$STATUS_DIR"

if [ -n "$SIGNAL_RECEIVED" ]; then
  echo "Shutdown complete (application status $APP_STATUS)." >&2
  exit "$APP_STATUS"
fi

echo "Exiting so Docker can restart the container." >&2
if [ "$FIRST_STATUS" -eq 0 ]; then
  exit 1
fi
exit "$FIRST_STATUS"
