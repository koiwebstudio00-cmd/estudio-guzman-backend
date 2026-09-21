# Fase 7 — Cuadernos, actuaciones y timeline

Estado: **completada**

Fecha: 2026-09-19

Ramas locales: `fase-7` en backend y frontend, creadas desde los commits finales de `fase-6`. Sin push ni merge.

## Resultado

El detalle del expediente ya permite trabajar con cuadernos de prueba, incidentes y actuaciones reales. La línea de tiempo combina actuaciones, cambios de estado del expediente, altas de cuadernos y transiciones de esos cuadernos, con paginación estable. Las pantallas de esta fase dejaron de usar datos simulados.

## Backend

- módulos `subcases` y `actions` con rutas, schemas Zod, servicios, repositorios y DTOs seguros;
- CRUD con baja lógica, permisos, CSRF y bloqueo de escritura sobre expedientes archivados;
- máquina de estados `ACTIVE`, `RESOLVED`, `CLOSED`, motivo obligatorio y reapertura administrativa;
- optimistic locking mediante `version` en ediciones y transiciones;
- actuaciones en expediente principal o cuaderno, impidiendo referencias entre expedientes;
- validación de autor, tipo y fechas: la presentación no puede preceder al documento;
- edición y baja restringidas por permiso, autoría, estado y documentos vinculados;
- auditoría y outbox en la misma transacción que cada mutación;
- timeline del expediente y del cuaderno con cursor estable por instante + clave de desempate;
- eventos de actuaciones, estados del expediente, altas y transiciones de cuadernos;
- conteos de actuaciones, tareas, notas y documentos en los DTOs de cuaderno.

No se agregó migración: `SubCase`, `CaseAction`, relaciones, índices y constraints ya formaban parte de la migración inicial.

## Frontend

- detalle del expediente cargado en paralelo desde API real;
- pestañas reales de timeline, pruebas, incidentes y partes/equipo;
- creación de cuadernos e incidentes y cierre con actualización de versión;
- registro de actuaciones en el expediente principal o en un cuaderno abierto;
- filtro por tipo de evento y carga de páginas adicionales;
- estados vacíos, error de carga y bloqueo de acciones sobre expedientes archivados;
- formularios con botones `submit` explícitos para compatibilidad con el primitive UI;
- pruebas actualizadas para la navegación por pestañas y consultas paralelas.

## Pruebas automáticas

### Backend

```text
Unitarios/API: 5 archivos, 17 tests aprobados
Integración PostgreSQL: 6 archivos, 34 tests aprobados
ESLint, TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

Los cinco casos nuevos cubren alta válida, auditoría/outbox, rechazo y rollback al mezclar expedientes, cierre y optimistic locking, bloqueo de actuaciones posteriores, transición visible en timeline, orden estable con empates y validación de fechas.

### Frontend

```text
Unitarios/componentes: 7 archivos, 10 tests aprobados
E2E Chromium: 6 tests aprobados
TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

La revisión React verificó carga paralela, limpieza del efecto asíncrono, estado derivado y componentes de diálogos declarados fuera del render principal. El build conserva un warning no bloqueante por el tamaño del chunk principal.

## Prueba manual

### 1. Levantar la fase

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-7
npm run db:deploy
npm run seed
npm run dev
```

En otra terminal:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-7
npm run dev
```

### 2. Flujo funcional

1. Iniciar sesión con un rol que tenga `cases.read`, `subcases.manage`, `actions.read` y `actions.create`.
2. Abrir un juicio activo y entrar en **Pruebas**.
3. Crear un cuaderno de prueba y comprobar que aparece en la pestaña y en el timeline.
4. Volver a **Timeline**, crear una actuación y asociarla al cuaderno.
5. Filtrar por **Actuaciones** y verificar título, autor, fecha y descripción.
6. Cerrar el cuaderno: sin motivo debe fallar; con motivo debe cambiar de estado y registrar el evento.
7. Intentar agregar otra actuación al cuaderno cerrado: la API debe responder `409`.
8. Crear un incidente y verificar que no aparece en la pestaña de pruebas.
9. Con una versión anterior, intentar editar/transicionar el cuaderno: debe responder `409`.
10. Archivar un expediente y confirmar que no ofrece altas ni edición de cuadernos/actuaciones.

### 3. Prueba rápida por API

Crear cuaderno:

```bash
curl -i -X POST http://localhost:3001/api/v1/cases/CASE_UUID/subcases \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  --data '{"type":"EVIDENCE","title":"Prueba documental","description":"Documentación ofrecida"}'
```

Crear actuación y consultar timeline:

```bash
curl -i -X POST http://localhost:3001/api/v1/cases/CASE_UUID/actions \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  --data '{"subCaseId":"SUBCASE_UUID","type":"FILING","title":"Ofrecimiento de prueba","documentAt":"2026-09-19T12:00:00.000Z"}'

curl -i 'http://localhost:3001/api/v1/cases/CASE_UUID/timeline?limit=25' \
  -H 'Cookie: eg_session=COOKIE'
```

Cerrar cuaderno:

```bash
curl -i -X POST http://localhost:3001/api/v1/subcases/SUBCASE_UUID/status-transitions \
  -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  --data '{"version":1,"toStatus":"CLOSED","reason":"Prueba producida"}'
```

### 4. Repetir gates

Backend:

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

Fase 8 incorpora documentos privados, versiones inmutables, upload seguro, descarga autorizada y storage local del VPS.
