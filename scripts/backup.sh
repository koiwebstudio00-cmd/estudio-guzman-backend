#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL_MIGRATE:?Defina DATABASE_URL_MIGRATE}"
: "${STORAGE_ROOT:?Defina STORAGE_ROOT}"
: "${BACKUP_DIR:?Defina BACKUP_DIR fuera del VPS o en un volumen sincronizado}"
: "${BACKUP_AGE_RECIPIENT:?Defina BACKUP_AGE_RECIPIENT}"
test -d "${STORAGE_ROOT}"
mkdir -p "${BACKUP_DIR}"
backup_tmp="$(mktemp -d)"; trap 'rm -rf "${backup_tmp}"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"; bundle="estudio-guzman-${stamp}"
pg_dump --format=custom --no-owner --no-acl --file="${backup_tmp}/database.dump" "${DATABASE_URL_MIGRATE}"
tar -C "${STORAGE_ROOT}" -czf "${backup_tmp}/storage.tar.gz" .
sha256sum "${backup_tmp}/database.dump" "${backup_tmp}/storage.tar.gz" > "${backup_tmp}/SHA256SUMS"
tar -C "${backup_tmp}" -cf - database.dump storage.tar.gz SHA256SUMS | age -r "${BACKUP_AGE_RECIPIENT}" -o "${BACKUP_DIR}/${bundle}.tar.age.tmp"
mv "${BACKUP_DIR}/${bundle}.tar.age.tmp" "${BACKUP_DIR}/${bundle}.tar.age"
echo "Backup cifrado creado: ${BACKUP_DIR}/${bundle}.tar.age"
