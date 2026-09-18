# Instrucciones del backend

## Contexto

API single-tenant para Estudio Guzmán. Administra información jurídica sensible, documentos privados, expedientes, partes, actuaciones, tareas, notas, usuarios y auditoría.

Antes de modificar contratos o estructura, leer `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DEPENDENCIES.md`, `docs/LOCAL_DATABASE.md`, `docs/DATABASE_OPERATIONS.md`, `docs/BRANCH_WORKFLOW.md`, `docs/IMPLEMENTATION_PLAN.md` y las decisiones vigentes en `docs/decisions/`. Estos documentos son canónicos dentro del backend.

## Reglas obligatorias

1. Estructura por módulo: `routes.ts` → `service.ts` → `repo.ts`. Las rutas traducen HTTP; los servicios contienen reglas/transacciones; los repositorios acceden a Prisma.
2. Validar body, params y query con Zod. No usar casts para aceptar input no validado.
3. No importar Prisma desde rutas. Las mutaciones críticas escriben negocio, historial, auditoría y outbox en la misma transacción.
4. Autenticación mediante token opaco en cookie HttpOnly; la base guarda solo SHA-256. No guardar tokens, passwords ni documentos en logs.
5. Autorización por permisos atómicos, no por nombres de rol dispersos.
6. Archivos fuera del webroot mediante `StorageService`; rutas opacas, MIME real, tamaño, checksum y versiones inmutables.
7. Código y nombres técnicos en inglés; mensajes visibles en español. Códigos de dominio estables en inglés y etiquetas localizadas en la API.
8. Fechas sin hora como `date`; eventos como `timestamptz` UTC.
9. No editar migraciones aplicadas. Crear con `prisma migrate dev --create-only`, revisar SQL y agregar constraints/índices no expresables por Prisma.
10. Producción usa un rol DB sin privilegios de owner. Las migraciones usan una credencial separada.
11. Efectos externos (correo, notificaciones futuras) salen por outbox/worker; no se ejecutan dentro de una transacción HTTP.
12. Nunca usar datos personales reales en seeds o tests.
13. Toda ruta, servicio, middleware, variable o dependencia nueva debe actualizar su documento canónico en el mismo cambio.

## Terminado

Ejecutar `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`. Cambios de contrato actualizan la documentación y tienen tests de validación/autorización.
