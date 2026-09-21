# Backup y restauración

El backup debe combinar el dump PostgreSQL y el storage de archivos del mismo corte operativo. `scripts/backup.sh` genera un bundle con checksums y lo cifra con `age`; `BACKUP_DIR` debe sincronizarse fuera del VPS.

## Política mínima

- backup diario cifrado, retención diaria 14 días, semanal 8 semanas y mensual 12 meses;
- copia externa/inmutable y monitoreo de antigüedad;
- clave privada de restauración fuera del VPS;
- ensayo trimestral de restauración completa en staging;
- RPO objetivo 24 h y RTO inicial 4 h, a revisar con el estudio.

## Restaurar en staging

1. Crear una DB vacía y un storage vacío; jamás apuntar primero a producción.
2. Configurar `BACKUP_FILE`, `AGE_IDENTITY_FILE`, `DATABASE_URL_MIGRATE` y `STORAGE_ROOT`.
3. Ejecutar con confirmación explícita:

```bash
CONFIRM_RESTORE=RESTORE_ESTUDIO_GUZMAN bash scripts/restore.sh
npm run db:deploy
```

4. Verificar `SHA256SUMS`, conteos, login, documentos descargables y checksums de una muestra.
5. Ejecutar smoke y E2E críticos.
6. Registrar fecha, backup, duración, resultado y responsable.

La restauración usa `pg_restore --clean`; es destructiva sobre la DB destino y por eso el script exige una frase de confirmación.
