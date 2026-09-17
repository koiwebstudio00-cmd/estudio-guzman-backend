# Catálogo de transiciones de estado

Estado: **aprobado — baseline MVP**

Toda transición se ejecuta mediante un endpoint explícito, no mediante un `PATCH status` genérico. Debe validar versión, permisos y reglas, actualizar la entidad y escribir historial/auditoría en la misma transacción.

## Expedientes

Estados:

- `PENDING`: alta/preparación todavía no activa;
- `ACTIVE`: tramitación activa;
- `SUSPENDED`: tramitación temporalmente suspendida;
- `CLOSED`: causa finalizada pero operativamente consultable;
- `ARCHIVED`: cierre administrativo y sólo lectura normal.

### Transiciones permitidas

| Desde | Hacia | Motivo obligatorio | Permiso mínimo | Efectos |
|---|---|:---:|---|---|
| creación | `PENDING` | no | `cases.create` | historial inicial |
| creación | `ACTIVE` | no | `cases.create` | historial inicial |
| `PENDING` | `ACTIVE` | no | `cases.change_status` | activar operación |
| `PENDING` | `CLOSED` | sí | `cases.change_status` | set `closedOn` |
| `ACTIVE` | `SUSPENDED` | sí | `cases.change_status` | mantiene asignaciones |
| `ACTIVE` | `CLOSED` | sí | `cases.change_status` | set `closedOn` |
| `SUSPENDED` | `ACTIVE` | sí | `cases.change_status` | retoma tramitación |
| `SUSPENDED` | `CLOSED` | sí | `cases.change_status` | set `closedOn` |
| `CLOSED` | `ACTIVE` | sí | `cases.change_status` + regla administrativa | limpia `closedOn` |
| `CLOSED` | `ARCHIVED` | no | `cases.archive` | set `archivedOn` |
| `ARCHIVED` | `CLOSED` | sí | `cases.archive` | limpia `archivedOn` |
| `ARCHIVED` | `ACTIVE` | sí | `cases.archive` | limpia archivo/cierre |

### Reglas

- `ARCHIVED` es sólo lectura salvo desarchivo.
- No se archiva una causa `ACTIVE`, `PENDING` o `SUSPENDED`: primero se cierra.
- Cerrar no cancela automáticamente tareas; el servicio devuelve las tareas abiertas y exige confirmación/estrategia explícita.
- Reabrir requiere optimistic locking y se audita con motivo.
- `closedOn` sólo existe en `CLOSED`/`ARCHIVED`; `archivedOn` sólo en `ARCHIVED`.
- Una baja lógica por alta errónea no es una transición de negocio y requiere `cases.delete`.

## Cuadernos e incidentes

Estados:

- `ACTIVE`: admite actuaciones/tareas/documentos;
- `RESOLVED`: resultado alcanzado, admite correcciones controladas;
- `CLOSED`: sólo lectura normal.

| Desde | Hacia | Motivo obligatorio | Permiso mínimo |
|---|---|:---:|---|
| creación | `ACTIVE` | no | `subcases.manage` |
| `ACTIVE` | `RESOLVED` | sí | `subcases.manage` |
| `ACTIVE` | `CLOSED` | sí | `cases.change_status` |
| `RESOLVED` | `ACTIVE` | sí | `cases.change_status` |
| `RESOLVED` | `CLOSED` | no | `cases.change_status` |
| `CLOSED` | `ACTIVE` | sí | Jefe/Socia con `cases.change_status` |

Reglas:

- un cuaderno no puede pertenecer a otro expediente durante una transición;
- cerrar el expediente exige cerrar o resolver sus cuadernos, o registrar una excepción explícita;
- `closedOn` se completa únicamente en `CLOSED`;
- la reapertura queda en historial/auditoría.

## Tareas

Estados:

- `PENDING`: todavía no iniciada;
- `IN_PROGRESS`: trabajo iniciado;
- `COMPLETED`: terminada;
- `CANCELLED`: ya no corresponde realizarla.

| Desde | Hacia | Motivo obligatorio | Efectos |
|---|---|:---:|---|
| creación | `PENDING` | no | historial inicial |
| creación | `IN_PROGRESS` | no | historial inicial |
| `PENDING` | `IN_PROGRESS` | no | — |
| `PENDING` | `COMPLETED` | no | set `completedAt` |
| `PENDING` | `CANCELLED` | sí | `completedAt = null` |
| `IN_PROGRESS` | `PENDING` | sí | — |
| `IN_PROGRESS` | `COMPLETED` | no | set `completedAt` |
| `IN_PROGRESS` | `CANCELLED` | sí | `completedAt = null` |
| `COMPLETED` | `IN_PROGRESS` | sí | limpia `completedAt` |
| `COMPLETED` | `PENDING` | sí | limpia `completedAt` |
| `CANCELLED` | `PENDING` | sí | reapertura |

Reglas:

- no hay transición directa `CANCELLED → COMPLETED`;
- una tarea de expediente archivado no se crea/reabre sin desarchivar el expediente;
- el cambio exige `tasks.change_status` y acceso a la tarea;
- el frontend puede hacer actualización optimista, pero revierte ante `409`/error;
- `completedAt` se deriva del estado y nunca lo define el cliente;
- todas las transiciones incrementan `version` y escriben historial.

## Usuarios

Estados: `ACTIVE`, `SUSPENDED`, `DISABLED`.

| Desde | Hacia | Uso |
|---|---|---|
| alta | `ACTIVE` | usuario habilitado después de completar alta |
| `ACTIVE` | `SUSPENDED` | bloqueo reversible; revoca sesiones |
| `SUSPENDED` | `ACTIVE` | rehabilitación |
| `ACTIVE` | `DISABLED` | baja administrativa; revoca sesiones |
| `SUSPENDED` | `DISABLED` | baja administrativa |
| `DISABLED` | `ACTIVE` | sólo recuperación administrativa excepcional |

No se permite dejar al sistema sin un administrador efectivo activo. Todo cambio requiere `users.manage` y no puede realizarse sobre el propio rol/estado si produce escalada o pérdida de acceso.

## Casos convertibles en tests

### Expedientes

- `ACTIVE → ARCHIVED` debe fallar.
- `CLOSED → ACTIVE` sin motivo debe fallar.
- dos transiciones con la misma `version`: una gana y la otra devuelve `409`.
- cerrar causa con tareas abiertas debe devolver el detalle definido por la política, no ignorarlas.
- transición correcta actualiza entidad, historial y auditoría atómicamente.

### Cuadernos

- agregar actuación a `CLOSED` debe fallar.
- reabrir sin rol autorizado debe devolver `403`.
- cerrar cuaderno actualiza `closedOn` y el timeline.

### Tareas

- `CANCELLED → COMPLETED` debe fallar.
- `COMPLETED → IN_PROGRESS` sin motivo debe fallar.
- completar fija `completedAt` del servidor.
- reabrir limpia `completedAt`.
- usuario sin acceso no puede inferir la tarea por UUID.

## Decisiones cerradas

- Sólo Jefe/Socia reabren o desarchivan causas cerradas/archivadas.
- Cerrar con tareas abiertas requiere una estrategia explícita; no se cancelan en silencio.
- `SUSPENDED` forma parte del ciclo de vida del MVP.
- Una tarea completada puede reabrirse a `PENDING` o `IN_PROGRESS`, siempre con motivo.
