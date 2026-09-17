-- Ejecutar una vez por base como administrador de PostgreSQL.
-- Los roles nacen sin LOGIN: el operador debe habilitarlos con secretos externos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'estudio_guzman_migrator'
  ) THEN
    CREATE ROLE estudio_guzman_migrator NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'estudio_guzman_app'
  ) THEN
    CREATE ROLE estudio_guzman_app NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END
$$;

ALTER ROLE estudio_guzman_migrator
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
ALTER ROLE estudio_guzman_app
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO estudio_guzman_migrator, estudio_guzman_app',
    current_database()
  );
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO estudio_guzman_migrator;
GRANT USAGE ON SCHEMA public TO estudio_guzman_app;

ALTER ROLE estudio_guzman_app SET statement_timeout = '30s';
ALTER ROLE estudio_guzman_app SET idle_in_transaction_session_timeout = '30s';

ALTER DEFAULT PRIVILEGES FOR ROLE estudio_guzman_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO estudio_guzman_app;
ALTER DEFAULT PRIVILEGES FOR ROLE estudio_guzman_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO estudio_guzman_app;
ALTER DEFAULT PRIVILEGES FOR ROLE estudio_guzman_migrator IN SCHEMA public
  GRANT USAGE ON TYPES TO estudio_guzman_app;
