# Fase 3 — Autenticación, sesiones y protección HTTP

Estado: **completada**

Fecha: 2026-09-18

Ramas locales: `fase-3` en backend y frontend. Se crearon desde `fase-2`; no se realizó ningún push ni merge.

## Objetivo y resultado

La plataforma ya tiene autenticación real de extremo a extremo. Un administrador puede ingresar desde la SPA, refrescar sin perder la sesión, cerrar la sesión actual o todas sus sesiones. Una sesión vencida, inactiva o revocada deja de autorizar inmediatamente y devuelve al login.

La implementación no usa JWT ni guarda credenciales en `localStorage`. El navegador recibe una cookie opaca `HttpOnly`; PostgreSQL conserva únicamente hashes SHA-256 del token de sesión, del secreto CSRF y de los tokens de recuperación.

## Backend

- `PasswordService` con Argon2id configurable y rehash progresivo al iniciar sesión.
- `TokenService` con CSPRNG, SHA-256, comparación en tiempo constante y CSRF derivado de sesión.
- `SessionService` con expiración absoluta, expiración por inactividad, renovación de `lastSeenAt` y revocación.
- `AuthService` para login, logout, logout global, forgot y reset de un solo uso; un token nuevo invalida los anteriores.
- `AuthRepository` como único acceso Prisma del módulo, incluyendo incremento atómico de intentos fallidos.
- `AuditService` y `OutboxService` que escriben dentro de la transacción del caso de uso.
- validación común de body/params/query con Zod.
- middlewares de autenticación, CSRF/Origin y rate limit.
- cookie `HttpOnly`, `SameSite`, `Secure` configurable, path `/api/v1` y borrado con los mismos atributos.
- respuesta genérica para credenciales y recuperación, sin revelar existencia o estado de una cuenta.
- redacción comprobada de password, token, Authorization y cookie en logs.
- adapter de recuperación local fuera del webroot en `STORAGE_ROOT/.private/password-resets`; el token nunca entra en DB, auditoría ni outbox.

Rutas implementadas:

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
GET  /api/v1/auth/csrf
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

No fue necesaria una migración nueva: `User`, `Session`, `PasswordResetToken`, `AuditLog` y `OutboxEvent` ya formaban parte de la migración inicial de Fase 1.

## Frontend

- cliente HTTP central con `credentials: include`, problem details y token CSRF sólo en memoria;
- `AuthProvider` que restaura `/auth/me` y `/auth/csrf` al cargar;
- pantalla de login real con estados de espera, error y sesión expirada;
- protección global de rutas y redirección al login;
- usuario/rol de la sesión real en sidebar y header;
- cierre de sesión actual y global desde el header;
- proxy Vite `/api` hacia `http://127.0.0.1:3001`;
- E2E del login, refresh, rutas protegidas y logout mediante contrato HTTP simulado; el flujo backend real queda cubierto por integración PostgreSQL y por la prueba manual conjunta.

Los datos de expedientes, contactos, tareas y demás módulos continúan simulados hasta sus fases correspondientes. El usuario actual ya proviene del backend.

## Resultados automáticos

### Backend

| Comprobación | Resultado |
|---|---|
| ESLint | correcto |
| TypeScript | correcto |
| Build Node/TS | correcto |
| Unitarios + API | 5 archivos, 17 tests aprobados |
| Integración PostgreSQL | 2 archivos, 9 tests aprobados |
| Cobertura unitaria/API | 35,71 % statements; 37,27 % lines |
| Auditoría runtime | 0 vulnerabilidades |

Las integraciones verifican login correcto/incorrecto, rehash, cookie, hashes en DB, CSRF, Origin, rate limit, bloqueo, sesiones vencidas/inactivas/revocadas, anti-enumeración, reset de un solo uso, revocación y rollback conjunto de negocio/auditoría/outbox.

### Frontend

| Comprobación | Resultado |
|---|---|
| TypeScript | correcto |
| Build Vite | correcto |
| Unitarios/componentes | 4 archivos, 6 tests aprobados |
| E2E Chromium | 2 tests aprobados |
| Cobertura | 10,09 % statements; 10,53 % lines |
| Auditoría runtime | 0 vulnerabilidades |

El build conserva una advertencia no bloqueante por un chunk JS de aproximadamente 601 kB. La cobertura global sigue reflejando las pantallas heredadas con mocks; el slice nuevo tiene 65,51 % en `src/auth` y 88,88 % en el cliente HTTP.

## Prueba manual conjunta

### 1. Preparar backend y administrador

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-3
brew services start postgresql@17
npm ci
npm run db:generate
npm run db:deploy
npm run seed
```

Si la base aún no tiene usuarios, crear el primer administrador. La contraseña debe tener al menos 14 caracteres y no queda versionada:

```bash
export BOOTSTRAP_ADMIN_EMAIL=admin@estudioguzman.local
export BOOTSTRAP_ADMIN_NAME='Administrador local'
read -s 'BOOTSTRAP_ADMIN_PASSWORD?Contraseña inicial: '
export BOOTSTRAP_ADMIN_PASSWORD
npm run bootstrap:admin
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD
```

Iniciar la API y dejarla abierta:

```bash
npm run dev
```

Debe escuchar en `http://localhost:3001`. En `.env`, `CORS_ORIGIN` debe contener `http://localhost:3000`.

### 2. Iniciar frontend

En otra terminal:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-3
npm ci
npm run dev
```

Abrir `http://localhost:3000` y comprobar:

1. `/` redirige a `/login` sin sesión.
2. Una clave incorrecta muestra el error genérico.
3. Las credenciales correctas abren el dashboard con nombre, email y rol reales.
4. Refrescar conserva la sesión.
5. `Cerrar sesión` vuelve al login y el botón Atrás no recupera el dashboard autorizado.
6. Volver a ingresar y probar `Cerrar todas las sesiones`.

### 3. Recuperación local opcional

Solicitar recuperación sin exponer si el email existe:

```bash
curl -i -X POST http://localhost:3001/api/v1/auth/forgot-password \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  --data '{"email":"admin@estudioguzman.local"}'
```

Para una cuenta activa, el archivo privado más reciente estará en:

```text
backend/storage/.private/password-resets/<tokenId>.json
```

Copiar su campo `token` y consumirlo una sola vez:

```bash
curl -i -X POST http://localhost:3001/api/v1/auth/reset-password \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  --data '{"token":"PEGAR_TOKEN_LOCAL","password":"NuevaClaveSegura456"}'
```

Debe responder `204`; un segundo uso devuelve `400` y todas las sesiones anteriores quedan revocadas. El archivo local se elimina después del reset.

## Repetir validaciones automáticas

Backend (advertencia: integración trunca sólo `estudio_guzman_test`):

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
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
cd /Users/dev0/koi/clients/estudio-guzman/front
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:coverage
npm audit --omit=dev --omit=optional
```

## Limitaciones y siguiente fase

- El envío de email productivo y el worker de outbox siguen pendientes; desarrollo usa el adapter privado local.
- El rate limit actual vive en memoria del proceso; en el despliegue MVP de una sola instancia es consistente. La Fase 12 revisará un store compartido si se escala horizontalmente.
- La Fase 4 implementará CRUD de usuarios/roles, `requirePermission`, revocación por suspensión/cambio de rol y protección del último administrador.
