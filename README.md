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
| [Plan de implementación](docs/IMPLEMENTATION_PLAN.md) | iteraciones, dependencias, pruebas y criterios de salida |
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
- seed inicial de roles/permisos;
- Docker/Compose y tests iniciales.

Próximo incremento: migración inicial, autenticación por sesiones opacas, CSRF, RBAC y bootstrap seguro del primer administrador.

## Inicio rápido

Requisitos: Node.js 22.20 o superior y Docker/Podman para PostgreSQL local.

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:generate
npm run db:validate
npm run dev
```

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
