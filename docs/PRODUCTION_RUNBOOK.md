# Runbook de producción en VPS

La instalación productiva elegida usa Dokploy y está documentada en `docs/DOKPLOY_DEPLOYMENT.md`. Las instrucciones de instalación directa de este runbook quedan como referencia de recuperación o despliegue sin Dokploy.

## Topología

Nginx termina TLS y sólo expone 80/443. API y worker corren con systemd como usuario sin login `estudio-guzman`; PostgreSQL escucha sólo en loopback/red privada. Los PDFs viven en `/var/lib/estudio-guzman/storage`, fuera del frontend y compartidos por API/worker.

## Preparación

1. Crear usuario/grupo sin privilegios y directorios `/opt/estudio-guzman`, `/var/lib/estudio-guzman/storage`, `/etc/estudio-guzman`.
2. Instalar Node 22 LTS, PostgreSQL 17, Nginx, Certbot, ClamAV/clamd, `age`, `jq` y cliente PostgreSQL.
3. Aplicar firewall: SSH desde IP administrativa y puertos 80/443 públicos; bloquear 3001/5432 externamente.
4. Instalar los units de `deploy/systemd/` y adaptar el host en `deploy/nginx/estudio-guzman.conf`.
5. Crear env `0640`; usar credenciales distintas para migración y runtime.

## Deploy repetible

1. Backup cifrado y verificación de espacio.
2. Instalar el artefacto en un directorio versionado y ejecutar el build en un host de construcción controlado.
3. Ejecutar una sola vez `npm run db:deploy` con rol migrador.
4. Cambiar symlink `current`, reiniciar worker y API, recargar Nginx.
5. Ejecutar `SMOKE_BASE_URL=... npm run smoke`.
6. Observar logs y `/health/worker` durante 10 minutos.

Nunca se ejecuta `prisma migrate dev` ni el seed automáticamente en producción.

## Rollback

El código vuelve cambiando el symlink al artefacto anterior y reiniciando servicios. Las migraciones son forward-only: si una migración no es compatible, detener el deploy y restaurar el backup en un entorno nuevo; no improvisar SQL inverso sobre producción.

## Incidentes

- API caída: `systemctl status`, `journalctl -u estudio-guzman-api`, health, DB y espacio.
- Worker detenido/estancado: revisar `health/worker`, logs, ClamAV y locks; reiniciar sólo después de entender el evento activo.
- Disco lleno: detener uploads, ampliar/limpiar temporales según retención; nunca borrar versiones documentales manualmente.
- PostgreSQL caído: mantener API fuera de rotación, recuperar DB y correr ready/smoke.
- Malware: bloquear descarga, conservar evidencia y revisar todos los archivos ingresados en la ventana afectada.

## Logs y alertas

Enviar journald/Nginx/PostgreSQL a un destino externo. Alertar por ready/worker 503, reinicios repetidos, disco >80%, backup ausente >26 h, certificados <21 días, eventos FAILED y errores 5xx sostenidos.
