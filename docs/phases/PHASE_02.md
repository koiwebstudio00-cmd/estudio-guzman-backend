# Fase 2 — Harness de integración y CI

Estado: **completada**

Fecha: 2026-09-18

Ramas locales: `fase-2` en backend y frontend. No se realizó ningún push ni merge.

## Objetivo

Obtener una señal reproducible y bloqueante sobre instalación, tipos, migraciones, comportamiento, build y dependencias antes de implementar autenticación y módulos de negocio.

## Backend

- Se separaron tests unitarios (`test/unit`), HTTP (`test/api`) e integración (`test/integration`).
- Se agregó `prisma.test.config.ts`, que exige una `DATABASE_URL_TEST` exclusiva.
- La protección rechaza URLs ausentes, bases de sistema, nombres sin el segmento `test`, targets remotos no autorizados y coincidencias con `DATABASE_URL`.
- `npm run test:integration` aplica migraciones y ejecuta PostgreSQL real; nunca omite silenciosamente la suite.
- Cada test de integración trunca sólo tablas de aplicación y conserva `_prisma_migrations`.
- Se agregaron factories sintéticas para usuarios, contactos y expedientes. Todos los emails usan `example.com`.
- Se comprobaron migración desde cero, aislamiento, persistencia de agregados y unicidad parcial del número de expediente.
- Se incorporó cobertura V8/LCOV y una batería local reproducible con PostgreSQL 17.

No se agregó un bypass falso de autenticación. El helper para sesiones HTTP se incorporará en Fase 3 junto con la implementación real de Auth.

## Frontend

- Se incorporaron Vitest 5, Testing Library, jest-dom, user-event y jsdom.
- Se agregaron un test unitario de `cn` y un test de componente accesible para `Button`.
- Se incorporó cobertura V8/LCOV sin umbral artificial.
- Se preparó Playwright 1.63 y un smoke E2E del dashboard en Chromium.
- Se definió una batería local reproducible con TypeScript, tests, cobertura, build y E2E.
- Commit local del frontend: `8bc7371`.

## Scripts agregados

### Backend

```bash
npm run test:unit
npm run test:api
npm run test:db:migrate
npm run test:integration
npm run test:all
npm run test:coverage
```

### Frontend

```bash
npm test
npm run test:watch
npm run test:coverage
npm run test:e2e
```

## Resultados automáticos

### Backend

| Comprobación | Resultado |
|---|---|
| `npm ci` | correcto |
| Prisma generate/validate | correcto |
| Migración desde `estudio_guzman_test` vacía | 1 migración aplicada correctamente |
| Unitarios + API | 3 archivos, 13 tests aprobados |
| Integración PostgreSQL | 1 archivo, 3 tests aprobados |
| Integración sin `DATABASE_URL_TEST` | falla explícitamente antes de conectar, esperado |
| Integración apuntando a DB no-test | falla explícitamente antes de conectar, esperado |
| Cobertura de código fuente | 49,62 % statements; 52,89 % lines |
| ESLint | correcto |
| TypeScript | correcto |
| Build | correcto |
| Auditoría runtime | 0 vulnerabilidades |

El árbol completo conserva 4 alertas altas transitivas del CLI de Prisma de desarrollo (`deepmerge-ts`/`mysql2`). No forman parte del runtime; `npm audit --omit=dev --omit=optional` devuelve 0. No se fuerza el downgrade incompatible sugerido por npm.

### Frontend

| Comprobación | Resultado |
|---|---|
| `npm ci` | correcto |
| TypeScript | correcto |
| Unitarios/componentes | 2 archivos, 2 tests aprobados |
| Cobertura baseline | 0,57 % statements; 0,64 % lines |
| Build Vite | correcto |
| E2E Chromium | 1 test aprobado |
| Auditoría npm | 0 vulnerabilidades |

La cobertura frontend baja refleja el MVP heredado sin suite previa. Se registra como baseline y crecerá con cada slice funcional. El build mantiene una advertencia no bloqueante por un chunk JS de aproximadamente 636 kB; el code splitting se atenderá junto con la integración de rutas/API.

Los workflows CI quedaron versionados pero no se ejecutaron en GitHub porque el proyecto trabaja localmente y no publica ramas. La misma secuencia fue ejecutada localmente con éxito.

## Prueba manual

### 1. Backend

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-2
brew services start postgresql@17
createdb estudio_guzman_test
npm ci
npm run db:generate
npm run test:all
npm run test:coverage
npm run lint
npm run typecheck
npm run build
```

Si `createdb` informa que `estudio_guzman_test` ya existe, continuar. Confirmar antes que `.env` usa bases distintas:

```dotenv
DATABASE_URL=postgresql://<USUARIO_MAC>@localhost:5432/estudio_guzman?schema=public
DATABASE_URL_TEST=postgresql://<USUARIO_MAC>@localhost:5432/estudio_guzman_test?schema=public
```

Advertencia: `npm run test:integration` borra el contenido de `estudio_guzman_test`. Nunca apuntarlo a datos que se deban conservar.

### 2. Frontend

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-2
npm ci
npx playwright install chromium
npm run lint
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

El E2E inicia y detiene Vite automáticamente. Debe abrir el dashboard en Chromium headless y comprobar el logo y la tarjeta `Juicios Activos`.

### 3. Comprobación visual opcional

```bash
npm run dev
```

Abrir `http://localhost:3000` y confirmar que el dashboard se comporta igual que antes de la fase.

## Limitaciones y siguiente fase

- Todavía no hay autenticación real ni helpers de sesión.
- El frontend continúa usando mocks/localStorage.
- CI está preparado, pero no se ejecutará remotamente mientras las ramas permanezcan locales.
- La Fase 3 implementará auditoría/outbox transaccional, contraseñas, sesiones opacas, CSRF, rate limiting y recuperación de acceso.
