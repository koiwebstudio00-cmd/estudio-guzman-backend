#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL_MIGRATE:?Defina DATABASE_URL_MIGRATE para la base destino}"
: "${STORAGE_ROOT:?Defina STORAGE_ROOT destino}"
: "${BACKUP_FILE:?Defina BACKUP_FILE}"
: "${AGE_IDENTITY_FILE:?Defina AGE_IDENTITY_FILE}"
[[ "${CONFIRM_RESTORE:-}" == "RESTORE_ESTUDIO_GUZMAN" ]] || { echo "Abortado: defina CONFIRM_RESTORE=RESTORE_ESTUDIO_GUZMAN" >&2; exit 2; }
restore_tmp="$(mktemp -d)"; trap 'rm -rf "${restore_tmp}"' EXIT
age -d -i "${AGE_IDENTITY_FILE}" "${BACKUP_FILE}" | tar -C "${restore_tmp}" -xf -
(cd "${restore_tmp}" && sha256sum -c SHA256SUMS)
pg_restore --clean --if-exists --no-owner --no-acl --dbname="${DATABASE_URL_MIGRATE}" "${restore_tmp}/database.dump"
mkdir -p "${STORAGE_ROOT}"
tar -C "${STORAGE_ROOT}" -xzf "${restore_tmp}/storage.tar.gz"
echo "Restauración completada. Ejecute migraciones y smoke tests."
