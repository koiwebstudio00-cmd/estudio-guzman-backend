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
| [Plan de implementación](docs/IMPLEMENTATION_PLAN.md) | iteraciones, dependencias, pruebas y criterios de salida |
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
- Docker/Compose y tests iniciales.

Próximo incremento: harness de integración/CI y autenticación por sesiones opacas, CSRF y RBAC.

## Inicio rápido

Requisitos: Node.js 22.20 o superior y PostgreSQL 17. Docker/Podman es opcional.

```bash
brew services start postgresql@17
createdb estudio_guzman
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

## Comprobación

```bash
npm run lint
npm run typecheck
npm test
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
