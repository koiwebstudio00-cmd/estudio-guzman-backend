# Backend — Estudio Guzmán

API privada para la gestión jurídica de Estudio Guzmán. Es un monolito modular single-tenant construido con Node.js 22, TypeScript estricto, Express 5, Prisma 7 y PostgreSQL 17.

Administra autenticación/RBAC, equipo, contactos, expedientes, partes, actuaciones, cuadernos, documentos versionados, tareas, notas, auditoría, notificaciones, feedback y métricas. Los archivos se alojan de forma privada en el VPS detrás de un adapter intercambiable.

## Documentación canónica

| Documento | Contenido |
|---|---|
| [Descripción del proyecto](docs/PROJECT.md) | alcance, usuarios, módulos, flujos, datos, storage y estado |
| [Arquitectura](docs/ARCHITECTURE.md) | estructura, capas, middlewares, servicios, seguridad, worker y tests |
| [Contrato HTTP](docs/API.md) | convenciones y catálogo completo de rutas actuales/planificadas |
| [Dependencias y operación](docs/DEPENDENCIES.md) | paquetes/versiones, scripts, variables, Docker y auditoría |
| [Base de datos local](docs/LOCAL_DATABASE.md) | guía rápida para levantar PostgreSQL y preparar el entorno |
| [Operación de PostgreSQL](docs/DATABASE_OPERATIONS.md) | roles, provisión, migraciones, seed, bootstrap y restauración |
| [Despliegue con Dokploy](docs/DOKPLOY_DEPLOYMENT.md) | Compose productivo, secretos, dominio, primer deploy y verificación |
| [Plan de implementación](docs/IMPLEMENTATION_PLAN.md) | iteraciones, dependencias, pruebas y criterios de salida |
| [Flujo por fases](docs/BRANCH_WORKFLOW.md) | ramas acumulativas, commits, pruebas manuales y promoción |
| [Entrega de Fase 2](docs/phases/PHASE_02.md) | harness backend/frontend, resultados y prueba manual |
| [Entrega de Fase 3](docs/phases/PHASE_03.md) | auth, sesiones, seguridad HTTP, integración SPA y prueba manual |
| [Entrega de Fase 4](docs/phases/PHASE_04.md) | usuarios, roles, permisos, administración SPA y prueba manual |
| [Entrega de Fase 5](docs/phases/PHASE_05.md) | catálogos, contactos, normalización, SPA y prueba manual |
| [Entrega de Fase 6](docs/phases/PHASE_06.md) | expedientes, partes, equipo, estados, SPA y prueba manual |
| [Entrega de Fase 7](docs/phases/PHASE_07.md) | cuadernos, actuaciones, timeline jurídico, SPA y prueba manual |
| [Entrega de Fase 8](docs/phases/PHASE_08.md) | documentos PDF privados, versiones, worker antivirus y prueba manual |
| [Entrega de Fase 9](docs/phases/PHASE_09.md) | tareas, Kanban, comentarios, notas y prueba manual |
| [Entrega de Fase 10](docs/phases/PHASE_10.md) | dashboard, búsqueda, métricas e índices |
| [Entrega de Fase 11](docs/phases/PHASE_11.md) | notificaciones, preferencias, feedback y worker |
| [Entrega de Fase 12](docs/phases/PHASE_12.md) | hardening, OpenAPI, VPS, backup/restauración y cierre |
| [OpenAPI](docs/openapi.yaml) | contrato OpenAPI 3.1 publicable para el equipo |
| [Seguridad](docs/SECURITY.md) | baseline, secretos, checklist y benchmark Argon2 |
| [Runbook de producción](docs/PRODUCTION_RUNBOOK.md) | deploy, rollback, incidentes, logs y alertas |
| [Backup y restauración](docs/BACKUP_RESTORE.md) | política y ensayo controlado |
| [Decisiones de Fase 0](docs/decisions/PHASE_0.md) | baseline funcional aprobado y decisiones diferidas |
| [Matriz RBAC](docs/decisions/RBAC_MATRIX.md) | permisos por rol y restricciones adicionales |
| [Transiciones](docs/decisions/STATE_TRANSITIONS.md) | estados permitidos, efectos e invariantes |
| [Política de datos](docs/decisions/DATA_POLICY.md) | privacidad, archivos, retención, recuperación y backups |
| [Schema Prisma](prisma/schema.prisma) | fuente de verdad del modelo relacional |
| [Reglas para agentes](AGENTS.md) | restricciones obligatorias al modificar el backend |

Los documentos distinguen entre **implementado** y **diseñado**. Que una ruta figure en el contrato objetivo no implica que ya esté disponible.

## Estado actual

Implementado:

- configuración validada por entorno;
- Express con API `/api/v1`;
- logs JSON, request ID y redacción;
- Helmet, CORS, JSON limitado y cookies;
- errores RFC 7807;
- Prisma 7/PostgreSQL y schema completo inicial;
- liveness/readiness;
- graceful shutdown;
- storage local base con protección contra path traversal;
- migración inicial revisada y seed idempotente de roles/permisos;
- bootstrap seguro y de una sola ejecución para el primer administrador;
- harness unitario/API/integración reproducible localmente con PostgreSQL real;
- autenticación por sesión opaca, Argon2id, CSRF, rate limit y recuperación;
- login/logout real, bootstrap de sesión y rutas protegidas en la SPA;
- CRUD controlado de usuarios/roles, autorización por permiso y protección del último administrador;
- catálogos localizados, juzgados, oficinas y directorio real de contactos con normalización, búsqueda y optimistic locking;
- expedientes con alta atómica, múltiples partes, representaciones, equipo responsable e historial de estados;
- cuadernos e incidentes con transiciones, actuaciones y timeline jurídico unificado;
- documentos PDF privados con upload por streaming, versiones inmutables, descarga autorizada y worker ClamAV;
- notificaciones personales, preferencias, feedback y worker de outbox idempotente;
- dashboard/búsqueda/métricas reales, consulta de auditoría y contratos OpenAPI;
- scripts cifrados de backup/restauración, smoke checks y units systemd/Nginx;
- Docker/Compose y tests iniciales.

Desarrollo planificado completado hasta Fase 12. Pendiente: revisión manual por fase y validación del runbook sobre el VPS/staging real antes del go-live.

## Inicio rápido

Requisitos: Node.js 22.20 o superior y PostgreSQL 17. Docker/Podman es opcional.

```bash
brew services start postgresql@17
createdb estudio_guzman
createdb estudio_guzman_test
cp .env.example .env
npm install
npm run db:generate
npm run db:validate
npm run db:deploy
npm run seed
npm run dev
```

Antes de ejecutar Prisma, configurar en `.env` las URLs locales indicadas en [Base de datos local](docs/LOCAL_DATABASE.md). Para el entorno simplificado con Homebrew no se ejecuta `db:grant-runtime`.

API local: `http://localhost:3001/api/v1`.

Rutas disponibles hoy:

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET|POST /api/v1/users`
- `GET|PATCH /api/v1/users/:userId`
- `POST /api/v1/users/:userId/reset-password`
- `POST /api/v1/users/:userId/revoke-sessions`
- `GET|POST /api/v1/roles`
- `PATCH /api/v1/roles/:roleId`
- `PATCH /api/v1/roles/:roleId/permissions`
- `GET /api/v1/catalogs`
- `GET|POST /api/v1/courts` y `GET|PATCH /api/v1/courts/:courtId`
- `GET|POST /api/v1/management-offices` y `GET|PATCH /api/v1/management-offices/:officeId`
- `GET|POST /api/v1/contacts` y `GET|PATCH|DELETE /api/v1/contacts/:contactId`
- CRUD anidado de `/api/v1/contacts/:contactId/channels` y `addresses`
- `GET|POST /api/v1/cases` y `GET|PATCH|DELETE /api/v1/cases/:caseId`
- transiciones, historial, resumen y timeline unificado de expedientes
- rutas anidadas de participantes, representaciones y equipo interno
- CRUD y transiciones de cuadernos/incidentes
- CRUD de actuaciones vinculadas al expediente o a un cuaderno
- CRUD, versiones y descargas de `/api/v1/documents`

## Comprobación

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run audit:runtime
```

## Reglas operativas

- Producción usa `DATABASE_URL` con un rol sin privilegios de owner.
- `DATABASE_URL_MIGRATE` se usa sólo en un job único de release.
- Cada réplica de API nunca aplica migraciones al arrancar.
- La imagen final omite dependencias dev/opcionales y no contiene Prisma CLI.
- `STORAGE_ROOT` es privado, persistente y absoluto en producción.
- No se guardan passwords, tokens, contenido de documentos ni datos jurídicos sensibles en logs.
