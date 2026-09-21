# Fase 12 — Hardening y preparación de producción

Estado: **completada en desarrollo**

Fecha: 2026-09-19

Ramas locales: `fase-12` en backend y frontend, acumulativas desde `fase-11`. Sin push ni merge.

## Resultado

El repositorio queda preparado para revisión manual y posterior instalación en un VPS mediante un procedimiento repetible. El frontend productivo ya no incluye mocks ni persistencia funcional local.

## Seguridad y contratos

- endpoint protegido y paginado `GET /api/v1/audit-logs` con filtros por entidad, actor y rango;
- auditoría completa separada de `dashboard.activity`: el dashboard conserva sólo los 10
  movimientos relevantes, excluye `AUTH_*`/`USER_*` antes del límite y respeta el alcance por
  `audit.read`;
- headers Helmet comprobados, `x-powered-by` deshabilitado y errores RFC 7807;
- JSON malformado responde `400` y body superior a 1 MiB responde `413`, sin reflejar contenido;
- configuración de producción rechaza HTTP/comodines en CORS, logging debug/trace y credenciales de ejemplo;
- política de secretos y rotación documentada;
- checklist endpoint por endpoint para sesión, permiso, ownership, CSRF, Zod, locking, auditoría y DTO;
- cobertura consolidada de IDOR, CSRF, Origin, rate limit, path traversal, MIME, archivos infectados y autoescalada;
- benchmark Argon2 ejecutable; medición local de referencia: p50 91 ms, p95 108 ms con 64 MiB/timeCost 3;
- contrato OpenAPI 3.1 validado sintácticamente en `docs/openapi.yaml`;
- dependencias frontend sin uso retiradas y auditorías runtime limpias.

## Operación VPS

- units systemd separados para API y worker, con usuario sin privilegios y filesystem protegido;
- ejemplo Nginx TLS, HSTS, límite de upload, rate limit adicional y streaming sin buffering;
- runbook de deploy, rollback, API/worker/DB/storage caídos, disco lleno y malware;
- logs y alertas mínimas definidas;
- backup conjunto de PostgreSQL + archivos, checksums y cifrado `age`;
- restore destructivo protegido por frase explícita y pensado primero para staging;
- smoke script para health y, opcionalmente, login/dashboard/logout;
- migraciones como job único previo al restart, nunca al arrancar cada proceso.

## Frontend

- eliminados `AppProvider`, `src/store/AppContext.tsx`, `src/data/mockData.ts` y tipos legacy;
- eliminado cualquier uso funcional de `localStorage`;
- estado funcional servido exclusivamente por la API;
- documentación de stack y progreso actualizada;
- retiradas seis dependencias sin uso: `@google/genai`, `motion`, `date-fns`, `dotenv`, `express` y `@types/express`.

## Pruebas automáticas y verificaciones

### Backend

```text
Unitarios/API: 6 archivos, 20 tests aprobados
Integración PostgreSQL: 11 archivos, 60 tests aprobados
Prisma validate, ESLint, TypeScript y build: correctos
OpenAPI YAML y scripts shell: sintaxis correcta
Configuración sintética de producción: aceptada
Auditoría runtime: 0 vulnerabilidades
```

### Frontend

```text
Unitarios/componentes: 8 archivos, 11 tests aprobados
E2E Chromium: 11 tests aprobados
TypeScript y build: correctos
Guard contra reintroducción de mocks/localStorage: aprobado
Auditoría runtime: 0 vulnerabilidades
```

## Prueba manual local

### 1. Levantar la rama final

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-12
npm run db:deploy
npm run seed
npm run dev
```

En otra terminal:

```bash
npm run dev:worker
```

Frontend:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-12
npm run dev
```

### 2. Verificación final

1. Recorrer login, equipo/RBAC, contactos, alta y detalle de expediente.
2. Crear actuación/cuaderno, subir/versionar/descargar PDF y confirmar timeline.
3. Crear/asignar/mover/comentar/completar tarea y comprobar notificación.
4. Crear nota, buscar por texto sin tilde, revisar dashboard y métricas.
5. Enviar y resolver feedback; consultar auditoría con un administrador.
6. Confirmar que refresh conserva sesión y datos desde API, no desde `localStorage`.
7. Ejecutar los gates listados abajo.

### 3. Gates

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
npm run db:validate
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration
npm run audit:runtime
bash -n scripts/backup.sh scripts/restore.sh scripts/smoke.sh
```

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev --omit=optional
```

## Validación obligatoria antes del go-live

No puede simularse correctamente desde esta Mac: instalar staging con la topología del VPS, validar TLS/firewall/usuario/volúmenes, probar ClamAV real, ejecutar backup cifrado hacia un destino externo, restaurarlo en una DB/storage vacíos, comparar checksums y correr smoke/E2E. Registrar el ensayo siguiendo `docs/BACKUP_RESTORE.md`. Esto es un gate operativo del despliegue, no trabajo de código pendiente en la fase.

## Actualización 2026-09-21 — Dokploy y Vercel

- se agregó `docker-compose.prod.yml` para API, worker, job de migraciones, PostgreSQL 17 y ClamAV;
- PostgreSQL, documentos y firmas antivirus usan volúmenes nombrados aptos para los backups de Dokploy;
- API y worker conservan credenciales runtime; sólo el job `migrate` recibe la credencial migradora;
- el primer administrador se crea con variables efímeras durante el primer release;
- ClamAV quedó separado del runtime Node y recibe archivos por `INSTREAM` en la red privada;
- el frontend se prepara para Vercel en `guzman.koistudio.com.ar` y la API para Dokploy en `api-guzman.koistudio.com.ar`;
- las guías operativas están en `docs/DOKPLOY_DEPLOYMENT.md` y `front/docs/DEPLOYMENT.md`.

Resultados posteriores a esta actualización:

```text
Backend: ESLint y TypeScript correctos; 7 archivos/22 tests unitarios-API y 11 archivos/60 tests de integración aprobados; build correcto; auditoría runtime con 0 vulnerabilidades.
Frontend: TypeScript correcto; 8 archivos/11 tests aprobados; build correcto; 12 E2E Chromium aprobados.
Manifiestos: docker-compose.prod.yml es YAML válido; vercel.json es JSON válido.
```

El Compose productivo no pudo ejecutarse localmente porque esta Mac no tiene Docker. La construcción real de imágenes, el arranque de ClamAV y la inyección de dominio/Traefik se validan en el primer ambiente de staging de Dokploy antes de cargar datos reales.
