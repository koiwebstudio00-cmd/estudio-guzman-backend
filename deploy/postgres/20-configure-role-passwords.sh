#!/bin/sh
set -eu

: "${MIGRATOR_DB_PASSWORD:?MIGRATOR_DB_PASSWORD es obligatoria}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD es obligatoria}"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=migrator_password="$MIGRATOR_DB_PASSWORD" \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
ALTER ROLE estudio_guzman_migrator LOGIN PASSWORD :'migrator_password';
ALTER ROLE estudio_guzman_app LOGIN PASSWORD :'app_password';
SQL
