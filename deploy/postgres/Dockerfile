FROM postgres:17-alpine

COPY prisma/operations/001_create_roles.sql /docker-entrypoint-initdb.d/10-create-roles.sql
COPY deploy/postgres/20-configure-role-passwords.sh /docker-entrypoint-initdb.d/20-configure-role-passwords.sh

RUN chmod 0755 /docker-entrypoint-initdb.d/20-configure-role-passwords.sh
