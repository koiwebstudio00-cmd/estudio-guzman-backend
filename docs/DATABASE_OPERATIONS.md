# Operación de PostgreSQL

Esta guía separa infraestructura, migraciones, datos estables y el primer usuario. Producción usa PostgreSQL 17 y dos credenciales distintas:

- `estudio_guzman_migrator`: crea y modifica objetos durante un release;
- `estudio_guzman_app`: ejecuta API/worker con DML, sin DDL ni acceso a `_prisma_migrations`.

Los secretos no se guardan en el repositorio, archivos de Compose ni historial de shell.

## Provisión inicial de producción

1. Crear la base vacía con locale, encoding y backups configurados.
2. Conectarse a esa base como administrador y ejecutar:

   ```bash
   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f prisma/operations/001_create_roles.sql
   ```

3. En una sesión administrativa de `psql`, habilitar `LOGIN` y asignar un secreto aleatorio diferente a cada rol mediante `\password estudio_guzman_migrator` y `\password estudio_guzman_app`. El gestor de secretos del VPS entrega las URLs a cada proceso.
4. Aplicar el release con la URL del migrador:

   ```bash
   DATABASE_URL_MIGRATE="$MIGRATOR_DATABASE_URL" npm run db:deploy
   DATABASE_URL_MIGRATE="$MIGRATOR_DATABASE_URL" npm run seed
   DATABASE_URL_MIGRATE="$MIGRATOR_DATABASE_URL" npm run db:grant-runtime
   ```

5. Configurar la API y el worker únicamente con `DATABASE_URL` del rol runtime.
6. Crear el primer administrador una sola vez, después del seed:

   ```bash
   export DATABASE_URL="$APP_DATABASE_URL"
   export BOOTSTRAP_ADMIN_EMAIL='direccion@example.com'
   export BOOTSTRAP_ADMIN_NAME='Administración'
   # El gestor de secretos inyecta BOOTSTRAP_ADMIN_PASSWORD sin escribirlo en el comando.
   npm run bootstrap:admin
   unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD
   ```

   El comando se serializa con un advisory lock, rechaza instalaciones con usuarios existentes y no imprime la contraseña. El secreto efímero debe retirarse del entorno al terminar y cambiarse en el primer acceso cuando exista el flujo de Auth.

## Release normal

Por cada versión:

1. backup verificable antes de cambios destructivos;
2. `npm ci` y `npm run db:generate` en build/CI;
3. `npm run db:deploy` con `DATABASE_URL_MIGRATE` en un único job;
4. `npm run seed` para sincronizar roles/permisos de sistema;
5. ejecutar `npm run db:grant-runtime` con la URL del migrador;
6. desplegar API/worker con `DATABASE_URL` runtime;
7. comprobar readiness y un flujo funcional;
8. conservar el artefacto y log del release sin connection strings.

Las réplicas de la API no aplican migraciones al arrancar. `migrate deploy` puede repetirse: una segunda ejecución no modifica una base ya actualizada.

## Desarrollo local

`docker compose up -d db` crea `estudio_guzman_app` sólo para desarrollo. El password `change-me` nunca es válido para producción. Después:

```bash
cp .env.example .env
npm run db:deploy
npm run seed
npm run db:grant-runtime
npm run bootstrap:admin
npm run dev
```

Las variables de bootstrap se aportan sólo al comando o temporalmente en `.env`; nunca se versionan.

## Rollback y correcciones

- No editar ni borrar una migración que haya sido aplicada.
- No ejecutar `prisma migrate reset` fuera de una DB descartable.
- Un fallo de aplicación se revierte desplegando el artefacto anterior sólo si su código es compatible con el schema nuevo.
- Un error de schema se corrige con una migración forward revisada.
- Un cambio destructivo usa expand/contract: agregar estructura compatible, migrar datos, desplegar consumidores y retirar lo viejo en otro release.
- La restauración desde backup es una operación de incidente, no el mecanismo normal de rollback.

## Restauración local de ensayo

Sobre una base vacía y exclusiva:

```bash
createdb estudio_guzman_restore_test
pg_restore --exit-on-error --clean --if-exists \
  --dbname="$RESTORE_DATABASE_URL" backup.dump
npm run db:deploy
```

Después se validan conteos, constraints, checksum de una muestra de archivos, login administrativo y descarga autorizada. PostgreSQL y `STORAGE_ROOT` deben provenir del mismo punto de recuperación/manifiesto.

## Verificación mínima de privilegios

Con el rol runtime:

```sql
SELECT current_user;
SELECT count(*) FROM users;
CREATE TABLE privilege_probe (id integer); -- debe fallar
SELECT * FROM "_prisma_migrations";         -- debe fallar
DELETE FROM audit_logs;                     -- debe fallar
```

Un release no se considera cerrado si cualquiera de las tres operaciones prohibidas tiene éxito.
