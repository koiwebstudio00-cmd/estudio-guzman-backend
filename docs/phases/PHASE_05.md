# Fase 5 — Catálogos y contactos

Estado: **completada**

Fecha: 2026-09-19

Ramas locales: `fase-5` en backend y frontend, creadas desde los commits finales de `fase-4`. Sin push ni merge.

## Resultado

El directorio dejó de usar mocks/localStorage. La SPA crea, busca, filtra, pagina, consulta, edita y da de baja contactos contra PostgreSQL. También quedaron disponibles los catálogos localizados y la administración de juzgados/oficinas que utilizará el alta de expedientes en la fase siguiente.

## Backend

- módulos `contacts` y `catalogs` separados en rutas, schemas Zod, servicios y repositorios;
- contactos persona/organización con categorías, canales y domicilios;
- normalización sin acentos/mayúsculas para búsqueda y normalización específica para DNI, CUIT, email y teléfono;
- conflictos `409` para DNI/CUIT/canales duplicados;
- un único canal y domicilio principal por tipo, garantizado por servicio y constraint parcial PostgreSQL;
- búsqueda por nombre, identificadores o canales, filtros y cursor estable por nombre normalizado + UUID;
- optimistic locking con `version` y baja lógica bloqueada si existen expedientes/representaciones;
- DTOs sin campos normalizados internos;
- enums localizados para UI y altas/ediciones de juzgados y oficinas;
- permisos, CSRF, auditoría y outbox transaccional en todas las mutaciones.

No se agregó migración: el schema y los constraints necesarios ya formaban parte de la migración inicial de Fase 1.

## Frontend

- pantalla Contactos conectada a la API, sin leer contactos/casos del store mock;
- búsqueda con debounce, filtros por tipo/categoría y carga incremental por cursor;
- alta de persona u organización, categorías y canales iniciales;
- detalle real, edición con versión y baja con confirmación;
- acciones visibles según permisos efectivos;
- `ContactSelector` reutilizable para expedientes y otros módulos;
- catálogos de labels obtenidos desde `GET /catalogs`;
- checklist React aplicado: requests independientes en paralelo, componentes fuera del render principal, estado derivado con `useMemo` y limpieza de efectos asíncronos.

## Pruebas automáticas

### Backend

```text
Unitarios/API: 5 archivos, 17 tests aprobados
Integración PostgreSQL: 4 archivos, 23 tests aprobados
ESLint, TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

La integración nueva cubre autenticación/permisos, persona/organización, campos requeridos, normalización y duplicados, principales únicos, búsqueda sin acentos, cursor estable, optimistic locking, restricción de baja, catálogos localizados, relaciones juzgado/oficina, auditoría y outbox.

### Frontend

```text
Unitarios/componentes: 6 archivos, 9 tests aprobados
E2E Chromium: 4 tests aprobados
TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

El build mantiene un warning no bloqueante por un chunk de aproximadamente 618 kB; se resolverá mediante code splitting en hardening.

## Prueba manual

### 1. Iniciar ambos procesos

Terminal backend:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-5
npm run db:deploy
npm run seed
npm run dev
```

Terminal frontend:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-5
npm run dev
```

Abrir `http://localhost:3000`, iniciar sesión con un usuario con permisos de contactos y abrir **Contactos**.

### 2. Flujo funcional

1. Crear una persona con DNI, email y teléfono; abrir su detalle.
2. Crear una organización con razón social y CUIT.
3. Buscar ambos registros ignorando mayúsculas y acentos.
4. Filtrar por persona/organización y categoría.
5. Editar un contacto y confirmar que la versión aumenta.
6. Intentar crear el mismo DNI/CUIT con otra puntuación: debe responder conflicto.
7. Dar de baja un contacto sin relaciones: debe desaparecer del listado.
8. Un contacto vinculado a un expediente no puede darse de baja y responde `409`.

### 3. Prueba rápida por API

Luego del login, copiar cookie y CSRF desde el navegador y reemplazar los valores:

```bash
curl -i -X POST http://localhost:3001/api/v1/contacts \\
  -H 'Origin: http://localhost:3000' \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: eg_session=COOKIE' \\
  -H 'x-csrf-token: CSRF' \\
  --data '{"kind":"PERSON","firstName":"Contacto","lastName":"Prueba","documentNumber":"99.999.999","categories":["CLIENT"],"channels":[{"type":"EMAIL","value":"contacto.prueba@example.com","isPrimary":true}]}'

curl -i 'http://localhost:3001/api/v1/contacts?q=CONTACTO&limit=10' \\
  -H 'Cookie: eg_session=COOKIE'
```

### 4. Repetir gates

Backend (la integración trunca sólo `estudio_guzman_test`):

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

Fase 6 incorpora expedientes, partes, representaciones, equipo responsable, transiciones de estado y reemplaza los mocks correspondientes en la SPA.
