#!/bin/sh
set -eu

SEED_FILE="${SEED_FILE:-/restore/langnation-capstone-sanitized.sql}"
EXPECTED_TABLE_COUNT="${EXPECTED_TABLE_COUNT:-58}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"
SLEEP_SECONDS="${SLEEP_SECONDS:-10}"

required_vars="DB_HOST DB_PORT DB_NAME DB_USERNAME DB_PASSWORD"

# ============================================================
# Validate required environment variables
# ============================================================

for var_name in $required_vars; do
  eval "value=\${$var_name:-}"

  if [ -z "$value" ]; then
    echo "ERROR: Required environment variable $var_name is not set." >&2
    exit 1
  fi
done


# ============================================================
# Validate seed file
# ============================================================

if [ ! -f "$SEED_FILE" ]; then
  echo "ERROR: Seed file not found: $SEED_FILE" >&2
  exit 1
fi


# ============================================================
# Restore information
# ============================================================

echo "LangNation database restore starting."
echo "Target host: $DB_HOST"
echo "Target port: $DB_PORT"
echo "Target database: $DB_NAME"
echo "Seed file: $SEED_FILE"

if command -v sha256sum >/dev/null 2>&1; then
  echo "Seed SHA256:"
  sha256sum "$SEED_FILE"
fi


# ============================================================
# Create temporary MariaDB client configuration
# ============================================================
#
# RDS Secrets Manager can generate passwords containing
# punctuation such as:
#
#   #
#   \
#   "
#
# Therefore the password is escaped and written inside
# double quotes in the MariaDB option file.
#
# This avoids exposing the password directly on the
# mariadb command line.
# ============================================================

CLIENT_CNF="/tmp/langnation-db-client.cnf"

cleanup() {
  rm -f "$CLIENT_CNF"
}

trap cleanup EXIT INT TERM


ESCAPED_DB_PASSWORD="$(
  printf '%s' "$DB_PASSWORD" |
    sed 's/\\/\\\\/g; s/"/\\"/g'
)"


cat > "$CLIENT_CNF" <<EOF
[client]
user="$DB_USERNAME"
password="$ESCAPED_DB_PASSWORD"
protocol=tcp
ssl
EOF


chmod 600 "$CLIENT_CNF"


# ============================================================
# Wait for database and validate credentials
# ============================================================
#
# We intentionally use:
#
#   SELECT 1;
#
# instead of mariadb-admin ping.
#
# mariadb-admin ping can report the database as reachable
# even when authentication fails.
#
# SELECT 1 verifies BOTH:
#
#   1. RDS network connectivity
#   2. Database credentials
# ============================================================

attempt=1

while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do

  echo "Database connection check $attempt/$MAX_ATTEMPTS..."

  if mariadb \
      --defaults-extra-file="$CLIENT_CNF" \
      --host="$DB_HOST" \
      --port="$DB_PORT" \
      --database="$DB_NAME" \
      --batch \
      --skip-column-names \
      -e "SELECT 1;" >/dev/null 2>&1; then

    echo "Database is reachable and credentials are valid."
    break
  fi


  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "ERROR: Could not connect to database with valid credentials after $MAX_ATTEMPTS attempts." >&2
    exit 1
  fi


  attempt=$((attempt + 1))

  sleep "$SLEEP_SECONDS"
done


# ============================================================
# Restore sanitized LangNation database
# ============================================================

echo "Restoring sanitized LangNation database..."

mariadb \
  --defaults-extra-file="$CLIENT_CNF" \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --database="$DB_NAME" \
  < "$SEED_FILE"


echo "Restore completed."


# ============================================================
# Validate restored database
# ============================================================

echo "Validating table count..."

ACTUAL_TABLE_COUNT="$(
  mariadb \
    --defaults-extra-file="$CLIENT_CNF" \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --database="$DB_NAME" \
    --batch \
    --skip-column-names \
    -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();"
)"


echo "Expected table count: $EXPECTED_TABLE_COUNT"
echo "Actual table count:   $ACTUAL_TABLE_COUNT"


if [ "$ACTUAL_TABLE_COUNT" != "$EXPECTED_TABLE_COUNT" ]; then

  echo "ERROR: Database validation failed." >&2
  echo "Expected $EXPECTED_TABLE_COUNT tables but found $ACTUAL_TABLE_COUNT." >&2

  exit 1
fi


# ============================================================
# Success
# ============================================================

echo "Database validation passed."
echo "LangNation sanitized demo database is ready."
