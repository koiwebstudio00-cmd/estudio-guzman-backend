# Fase 4 — Usuarios, roles y autorización RBAC

Estado: **completada**

Fecha: 2026-09-18

Ramas locales: `fase-4` en backend y frontend, creadas desde los commits finales de `fase-3`. Sin push ni merge.

## Resultado

La administración del equipo ya usa PostgreSQL. La API aplica permisos atómicos aunque se construya un request manual, y la SPA refleja los permisos para navegación y acciones. Se pueden invitar usuarios, cambiar nombre/rol/estado, revocar sesiones, emitir recuperación, crear roles y reemplazar su matriz de permisos.

## Backend

- `AuthorizationService` y middleware `requirePermission`.
- módulos `users` y `roles` separados en rutas, schemas, servicios, repositorios y mappers DTO.
- listados y detalles sin hashes ni campos internos.
- invitación segura: password aleatorio no utilizable + token de recuperación hasheado + adapter local/outbox.
- optimistic locking de usuario con `version` y respuesta `409` ante edición obsoleta.
- email normalizado y conflictos únicos traducidos a problem details `409`.
- prohibición de cambiar el propio rol/estado o los permisos del propio rol.
- protección del último administrador efectivo (`users.manage` + `roles.manage`) serializada mediante advisory lock dentro de la transacción.
- revocación inmediata de sesiones al cambiar estado, rol o permisos.
- auditoría y outbox en la misma transacción de cada mutación crítica.

No se agregó migración: el modelo inicial ya contenía usuarios, roles, permisos, sesiones, auditoría y outbox.

## Frontend

- `can(permission)` central en el contexto de autenticación.
- navegación filtrada por permisos efectivos.
- pantalla Equipo conectada a `/users` y `/roles`, sin mocks para este módulo.
- alta por invitación y edición de nombre, rol y estado.
- creación de roles y reemplazo visual de permisos.
- controles administrativos ocultos cuando faltan permisos, sin tratarlos como control de seguridad suficiente.

## Pruebas automáticas

### Backend

```text
Unitarios/API: 5 archivos, 17 tests aprobados
Integración PostgreSQL: 3 archivos, 16 tests aprobados
ESLint, TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

La integración cubre `401`, `403` y éxito por permiso; DTOs sin secretos; invitación atómica; asignación de rol sin `roles.manage`; auto-degradación; último administrador; optimistic/session revocation; reemplazo de permisos, auditoría y outbox.

### Frontend

```text
Unitarios/componentes: 5 archivos, 7 tests aprobados
E2E Chromium: 3 tests aprobados
TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

## Prueba manual

### 1. Iniciar ambos procesos

Terminal backend:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-4
npm run db:deploy
npm run seed
npm run dev
```

Terminal frontend:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-4
npm run dev
```

Abrir `http://localhost:3000`, ingresar como Jefe/Socia y abrir **Equipo**.

### 2. Verificaciones

1. Crear un integrante con email sintético y asignarle rol Abogada o Secretaria.
2. Confirmar que aparece como activo y que en `backend/storage/.private/password-resets/` existe su invitación local.
3. Editar su rol o suspenderlo; cualquier sesión abierta de esa cuenta debe pasar a `401` y volver al login.
4. Crear un rol de prueba, elegir permisos y guardarlo.
5. Editar ese rol: sus usuarios deben perder la sesión para recargar permisos.
6. Confirmar que no aparece el botón para editar el rol propio ni para administrarse a uno mismo.
7. Intentar con curl quitar/suspender al único administrador efectivo: debe responder `409`.

Ejemplo manual autorizado (reemplazar UUID, cookie y CSRF obtenidos del navegador/curl):

```bash
curl -i -X PATCH http://localhost:3001/api/v1/users/UUID_ADMIN \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  --data '{"version":1,"status":"SUSPENDED"}'
```

### 3. Repetir gates

Backend (la integración borra sólo `estudio_guzman_test`):

```bash
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration
npm run test:coverage
npm run audit:runtime
```

Frontend:

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:coverage
npm audit --omit=dev --omit=optional
```

## Siguiente fase

Fase 5 reemplazará mocks de juzgados, oficinas y contactos con CRUD, normalización, búsqueda, filtros y baja lógica.
