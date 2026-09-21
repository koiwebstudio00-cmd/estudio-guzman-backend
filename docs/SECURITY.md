# Seguridad operativa

## Baseline

- sesión opaca en cookie `HttpOnly`, `Secure` en producción y `SameSite=lax`;
- CSRF de doble secreto para toda mutación autenticada y validación de `Origin`;
- RBAC por permiso en cada ruta y validación de recurso en servicios;
- Argon2id configurable, tokens aleatorios almacenados sólo como SHA-256 y revocación de sesiones;
- Helmet, CORS explícito, JSON máximo 1 MiB y PDFs limitados durante streaming;
- storage privado fuera del webroot, claves opacas y protección contra path traversal;
- PDFs validados por MIME, firma, EOF, cifrado y ClamAV en producción;
- errores RFC 7807 sin stack, secretos ni paths físicos; logs estructurados con redacción;
- rate limit de login y upload. El MVP usa una sola instancia; para escalar horizontalmente debe migrarse a un store compartido antes de agregar réplicas.

## Secretos

Los secretos viven sólo en `/etc/estudio-guzman/backend.env` con owner `root:estudio-guzman` y modo `0640`, o en un gestor equivalente. Nunca se versionan ni se copian a imágenes. Rotar inmediatamente ante exposición.

Rotación de DB: crear credencial nueva, actualizar el environment, reiniciar API/worker, verificar smoke y revocar la anterior. Rotación de bootstrap: borrar las variables después del primer administrador. Cambiar permisos/estado de un usuario revoca sus sesiones.

## Checklist de revisión por endpoint

1. `authenticate` en toda ruta privada.
2. `requirePermission` cuando accede a datos globales.
3. ownership/relación validado en servicio para recursos personales.
4. CSRF en POST/PATCH/DELETE autenticados.
5. params/query/body validados con Zod y límites explícitos.
6. optimistic locking en recursos editables.
7. auditoría/outbox en la misma transacción cuando hay efecto de negocio.
8. DTO explícito sin hashes, claves de storage ni campos internos.

La suite cubre autenticación, permisos, autoescalada, último administrador, IDOR de documentos/notificaciones, CSRF, Origin, rate limit, payloads, MIME y path traversal.

## Argon2 en el VPS

```bash
npm run security:benchmark-argon2 -- 7
```

Objetivo inicial: p95 entre 150 y 500 ms bajo carga representativa. Ajustar memoria antes que reducir `timeCost`; nunca bajar de los mínimos validados por configuración. Registrar fecha, CPU, memoria y resultado en el ticket de despliegue.
