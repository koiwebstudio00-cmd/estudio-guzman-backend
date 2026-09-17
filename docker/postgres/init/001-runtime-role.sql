-- Sólo para desarrollo local. Producción debe inyectar secretos distintos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'estudio_guzman_app') THEN
    CREATE ROLE estudio_guzman_app LOGIN PASSWORD 'change-me'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE estudio_guzman TO estudio_guzman_app;
GRANT USAGE ON SCHEMA public TO estudio_guzman_app;

ALTER ROLE estudio_guzman_app SET statement_timeout = '30s';
ALTER ROLE estudio_guzman_app SET idle_in_transaction_session_timeout = '30s';

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO estudio_guzman_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO estudio_guzman_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON TYPES TO estudio_guzman_app;
