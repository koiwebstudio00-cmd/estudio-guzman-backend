# Fase 10 — Dashboard, búsqueda y métricas

Estado: **completada**

Fecha: 2026-09-19

Ramas locales: `fase-10` en backend y frontend, acumulativas desde `fase-9`. Sin push ni merge.

## Resultado

El inicio, la búsqueda global y las métricas de equipo consumen PostgreSQL y respetan permisos efectivos. Se eliminaron los cálculos del store mock del dashboard.

## Backend

- `GET /api/v1/dashboard?from=&to=` con KPIs actuales, tareas propias y actividad reciente;
- los KPIs de expedientes, tareas y clientes devuelven `null` si el usuario carece del permiso de lectura correspondiente;
- usuarios sin `audit.read` sólo reciben su propia actividad; administradores reciben actividad general;
- el rango opcional filtra actividad usando días UTC y límite superior exclusivo;
- `GET /api/v1/search?q=&types=&limit=` para expedientes, contactos y actuaciones;
- búsqueda parcial insensible a mayúsculas y acentos, además de número de expediente normalizado;
- tipos no autorizados se omiten sin filtrar datos ni revelar su existencia;
- query vacía o menor a dos caracteres retorna una colección vacía; límite máximo de 50;
- `GET /api/v1/team/metrics?from=&to=` con asignadas actuales, completadas en rango, vencidas actuales y causas como responsable;
- rango máximo de métricas de 366 días y fechas evaluadas en UTC;
- agregados en consultas acotadas, sin N+1 y con DTOs compactos;
- migración `20260919000100_search_indexes` que habilita `pg_trgm` y agrega índices GIN parciales para títulos de expedientes, contactos y actuaciones.

## Frontend

- dashboard real con skeleton inicial, error, estados vacíos, KPIs, tareas propias y actividad;
- búsqueda global con debounce, loading, vacío, error y navegación al resultado;
- vista de equipo con rango temporal y tabla de métricas;
- un error en métricas no bloquea usuarios ni roles;
- consultas cancelables lógicamente para evitar actualizar componentes desmontados;
- eliminación del uso de `AppContext` y datos mock en la pantalla de inicio.

## Pruebas automáticas

### Backend

```text
Unitarios/API: 5 archivos, 18 tests aprobados
Integración PostgreSQL: 9 archivos, 50 tests aprobados
Prisma validate/format, ESLint, TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

Los cuatro escenarios nuevos validan agregados con dataset conocido, aislamiento por permisos, actividad propia, métricas por rango UTC, máximo de rango, acentos/mayúsculas/términos parciales, número normalizado, tipos no autorizados, query vacía y límite.

### Frontend

```text
Unitarios/componentes: 7 archivos, 10 tests aprobados
E2E Chromium: 10 tests aprobados
TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

El E2E nuevo verifica KPIs, tarea y actividad reales, búsqueda navegable con acentos y actualización del rango de métricas. El warning no bloqueante del chunk principal queda en aproximadamente 535 kB.

## Prueba manual local

### 1. Aplicar migración y levantar la fase

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-10
npm run db:deploy
npm run seed
npm run dev
```

En otra terminal:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-10
npm run dev
```

### 2. Flujo funcional

1. Crear expedientes, contactos, actuaciones y tareas con fechas/responsables diferentes.
2. Abrir **Inicio** y contrastar los cinco KPIs con esos registros.
3. Confirmar que **Mis tareas** sólo incluye asignaciones propias abiertas.
4. Buscar desde el encabezado usando texto sin tildes para un registro con tildes, por ejemplo `sucesion nunez` para `Sucesión Núñez`.
5. Buscar por una parte del título, nombre y número de expediente.
6. Elegir un resultado y comprobar la navegación.
7. Abrir **Equipo**, modificar el rango y validar las tareas completadas.
8. Probar un perfil sin `team_metrics.read`: la sección no debe aparecer.

### 3. Prueba rápida por API

```bash
curl -s 'http://localhost:3001/api/v1/dashboard' \
  -H 'Cookie: eg_session=COOKIE'

curl -s 'http://localhost:3001/api/v1/search?q=sucesion%20nunez&types=CASE,ACTION&limit=10' \
  -H 'Cookie: eg_session=COOKIE'

curl -s 'http://localhost:3001/api/v1/team/metrics?from=2026-09-01&to=2026-09-30' \
  -H 'Cookie: eg_session=COOKIE'
```

### 4. Repetir gates

Backend:

```bash
npm run db:validate
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration
npm run audit:runtime
```

Frontend:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev --omit=optional
```

## Siguiente fase

Fase 11 incorpora notificaciones, preferencias, feedback y procesamiento general del outbox mediante worker independiente.
