#!/bin/sh
set -eu

SEED_FILE="${SEED_FILE:-/restore/langnation-capstone-sanitized.sql}"
EXPECTED_TABLE_COUNT="${EXPECTED_TABLE_COUNT:-58}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"
SLEEP_SECONDS="${SLEEP_SECONDS:-10}"

required_vars="DB_HOST DB_PORT DB_NAME DB_USERNAME DB_PASSWORD"

for var_name in $required_vars; do
  eval "value=\${$var_name:-}"
  if [ -z "$value" ]; then
    echo "ERROR: Required environment variable $var_name is not set." >&2
    exit 1
  fi
done

if [ ! -f "$SEED_FILE" ]; then
  echo "ERROR: Seed file not found: $SEED_FILE" >&2
  exit 1
fi

echo "LangNation database restore starting."
echo "Target host: $DB_HOST"
echo "Target port: $DB_PORT"
echo "Target database: $DB_NAME"
echo "Seed file: $SEED_FILE"

if command -v sha256sum >/dev/null 2>&1; then
  echo "Seed SHA256:"
  sha256sum "$SEED_FILE"
fi

CLIENT_CNF="/tmp/langnation-db-client.cnf"

cleanup() {
  rm -f "$CLIENT_CNF"
}
trap cleanup EXIT INT TERM

cat > "$CLIENT_CNF" <<EOF
[client]
user=$DB_USERNAME
password=$DB_PASSWORD
protocol=tcp
ssl
EOF

chmod 600 "$CLIENT_CNF"

attempt=1

while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "Database readiness check $attempt/$MAX_ATTEMPTS..."

  if mariadb-admin \
      --defaults-extra-file="$CLIENT_CNF" \
      --host="$DB_HOST" \
      --port="$DB_PORT" \
      ping \
      --silent >/dev/null 2>&1; then
    echo "Database is reachable."
    break
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "ERROR: Database did not become reachable after $MAX_ATTEMPTS attempts." >&2
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

echo "Restoring sanitized LangNation database..."

mariadb \
  --defaults-extra-file="$CLIENT_CNF" \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --database="$DB_NAME" \
  < "$SEED_FILE"

echo "Restore completed. Validating table count..."

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
  exit 1
fi

echo "Database validation passed."
echo "LangNation sanitized demo database is ready."
