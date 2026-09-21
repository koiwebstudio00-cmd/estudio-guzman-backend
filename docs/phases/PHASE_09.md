# Fase 9 — Tareas, comentarios y notas internas

Estado: **completada**

Fecha: 2026-09-19

Ramas locales: `fase-9` en backend y frontend, creadas desde los commits finales de `fase-8`. Sin push ni merge.

## Resultado

La plataforma cuenta con gestión real de tareas en tablero y lista, responsables múltiples, transiciones auditadas con control de concurrencia, comentarios y notas internas inmutables asociadas a expediente, cuaderno o contacto.

## Backend

- módulo `tasks` separado en rutas, schemas Zod, servicio, repositorio, mapper y cursor;
- CRUD funcional de creación, lectura y edición de tareas, con filtros por estado, prioridad, responsable, expediente y rango de vencimiento;
- paginación por cursor estable `updatedAt + id`;
- fechas de vencimiento interpretadas a medianoche UTC para evitar corrimientos por zona horaria;
- asignación múltiple con historial completo de altas y bajas lógicas;
- reglas diferenciadas para perfiles administrativos y usuarios que crean o tienen asignada una tarea;
- máquina de estados explícita y motivo obligatorio para cancelaciones, retrocesos y reaperturas;
- `completedAt` derivado del estado, historial en la misma transacción y optimistic locking por `version`;
- bloqueo de toda mutación cuando el expediente relacionado está archivado;
- comentarios con creación y edición/eliminación exclusiva del autor, salvo permiso de moderación;
- módulo `notes` con rutas, schemas, servicio, repositorio y DTO seguro;
- notas de sólo creación vinculadas exactamente a un expediente, cuaderno o contacto;
- el vínculo de un cuaderno deriva y persiste también su expediente padre;
- auditoría y outbox transaccionales para tareas, asignaciones, transiciones, comentarios y notas;
- ningún DTO expone identificadores internos de autor ni campos de borrado lógico.

No se agregó migración: tareas, asignaciones, historial, comentarios, notas, checks e índices ya estaban incluidos en la migración inicial.

## Frontend

- reemplazo del mock de tareas por consumo completo de la API;
- tablero Kanban con cuatro estados y drag & drop nativo;
- actualización optimista al mover tarjetas y rollback automático ante conflicto o error;
- vista de lista real;
- filtros locales por prioridad y responsable;
- alta de tareas con expediente opcional, vencimiento, prioridad y selección múltiple de responsables;
- detalle con transición de estado, responsables, comentarios e historial;
- pestaña **Notas** dentro del detalle del expediente;
- creación y listado de notas con autor y fecha, respetando permisos y modo de sólo lectura al archivar;
- carga inicial paralela de tareas, equipo y expedientes, con efecto cancelable y estado seleccionado derivado.

## Pruebas automáticas

### Backend

```text
Unitarios/API: 5 archivos, 18 tests aprobados
Integración PostgreSQL: 8 archivos, 46 tests aprobados
ESLint, TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

Los cinco escenarios nuevos cubren responsables múltiples, historial/auditoría/outbox, transiciones válidas e inválidas, motivos, optimistic locking, reapertura, reasignación, filtros, cursor, fechas UTC, autoría y moderación de comentarios, contextos de notas y bloqueo en expedientes archivados.

### Frontend

```text
Unitarios/componentes: 7 archivos, 10 tests aprobados
E2E Chromium: 9 tests aprobados
TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

Los dos E2E nuevos verifican el rollback visual de un movimiento Kanban ante un `409`, el movimiento posterior exitoso, la vista de lista y la creación de una nota desde el expediente. El build conserva un warning no bloqueante por el chunk principal de aproximadamente 560 kB.

## Prueba manual local

### 1. Levantar esta fase

Backend:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-9
npm run db:deploy
npm run seed
npm run dev
```

Frontend, en otra terminal:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-9
npm run dev
```

### 2. Probar tareas desde la UI

1. Iniciar sesión con permisos de tareas y abrir **Tareas**.
2. Crear una tarea con dos responsables, prioridad, vencimiento y expediente.
3. Verificarla en Kanban y alternar a lista.
4. Arrastrarla de **Pendientes** a **En progreso**.
5. Abrir el detalle, cambiar responsables y agregar un comentario.
6. Completarla y verificar `completedAt` indirectamente por el estado.
7. Reabrirla: la UI debe pedir un motivo.
8. Cancelarla: también debe exigir un motivo.
9. Probar filtros de responsable y prioridad.
10. Abrir la misma tarea en dos pestañas, modificarla en una y luego intentar cambiar el estado con la otra: la segunda debe informar conflicto y restaurar el estado visual.

### 3. Probar notas

1. Abrir un expediente activo y entrar en **Notas**.
2. Crear una nota y comprobar autor, fecha y texto.
3. Recargar: la nota debe persistir.
4. Archivar el expediente: la lista debe seguir visible, pero el formulario de alta debe desaparecer.

### 4. Prueba rápida por API

Crear tarea:

```bash
curl -i -X POST http://localhost:3001/api/v1/tasks \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  -H 'Content-Type: application/json' \
  --data '{"title":"Preparar audiencia","priority":"HIGH","dueDate":"2026-09-25","caseId":"CASE_UUID","assigneeIds":["USER_UUID"]}'
```

Cambiar estado usando la versión vigente:

```bash
curl -i -X POST http://localhost:3001/api/v1/tasks/TASK_UUID/status-transitions \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  -H 'Content-Type: application/json' \
  --data '{"version":1,"toStatus":"IN_PROGRESS"}'
```

Crear y listar notas:

```bash
curl -i -X POST http://localhost:3001/api/v1/notes \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  -H 'Content-Type: application/json' \
  --data '{"content":"Cliente confirmó audiencia","caseId":"CASE_UUID"}'

curl -i 'http://localhost:3001/api/v1/notes?caseId=CASE_UUID' \
  -H 'Cookie: eg_session=COOKIE'
```

### 5. Repetir gates

Backend:

```bash
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

Fase 10 incorpora un dashboard real con métricas y actividad calculadas desde PostgreSQL.
