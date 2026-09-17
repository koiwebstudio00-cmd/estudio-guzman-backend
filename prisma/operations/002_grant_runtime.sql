-- Ejecutar como estudio_guzman_migrator después de cada deploy de migraciones.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO estudio_guzman_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO estudio_guzman_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO estudio_guzman_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO estudio_guzman_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON TYPES TO estudio_guzman_app;

-- Runtime no debe conocer ni alterar el historial interno de Prisma.
REVOKE ALL ON TABLE public."_prisma_migrations" FROM estudio_guzman_app;

-- Historial y auditoría son append-only incluso para el rol de la aplicación.
REVOKE UPDATE, DELETE ON TABLE
  public.audit_logs,
  public.case_status_history,
  public.task_status_history
FROM estudio_guzman_app;
