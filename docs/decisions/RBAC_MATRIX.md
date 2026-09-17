# Matriz RBAC aprobada

Estado: **aprobada — baseline MVP**

## Principios

- Los roles agrupan permisos; el código nunca pregunta `role === "Jefe"` para autorizar.
- La ruta exige un permiso general y el servicio valida el recurso concreto.
- Todos los usuarios activos pueden leer los expedientes internos en el MVP. Si existen causas reservadas, deben modelarse explícitamente más adelante; no se simula confidencialidad sólo desde la UI.
- Las acciones propias como leer notificaciones personales o cerrar la sesión no requieren permisos globales adicionales.
- Jefe y Socia tienen el mismo acceso funcional inicial. La protección del último administrador efectivo evita perder acceso administrativo.
- Borrado, archivo, permisos y auditoría están separados de la escritura cotidiana.

## Leyenda

- **Sí**: permitido.
- **No**: denegado.
- **Limitado**: permitido con una regla adicional indicada debajo de la matriz.

## Matriz

| Permiso | Jefe | Socia | Abogada | Secretaria |
|---|:---:|:---:|:---:|:---:|
| `users.read` | Sí | Sí | Sí | Sí |
| `users.manage` | Sí | Sí | No | No |
| `roles.read` | Sí | Sí | Sí | Sí |
| `roles.manage` | Sí | Sí | No | No |
| `contacts.read` | Sí | Sí | Sí | Sí |
| `contacts.create` | Sí | Sí | Sí | Sí |
| `contacts.update` | Sí | Sí | Sí | Sí |
| `contacts.delete` | Sí | Sí | No | No |
| `catalogs.read` | Sí | Sí | Sí | Sí |
| `catalogs.manage` | Sí | Sí | No | No |
| `cases.read` | Sí | Sí | Sí | Sí |
| `cases.create` | Sí | Sí | Sí | No |
| `cases.update` | Sí | Sí | Sí | No |
| `cases.change_status` | Sí | Sí | Sí | No |
| `cases.assign` | Sí | Sí | Limitado | No |
| `cases.archive` | Sí | Sí | No | No |
| `cases.delete` | Sí | Sí | No | No |
| `participants.manage` | Sí | Sí | Sí | No |
| `subcases.manage` | Sí | Sí | Sí | No |
| `actions.read` | Sí | Sí | Sí | Sí |
| `actions.create` | Sí | Sí | Sí | Sí |
| `actions.update` | Sí | Sí | Sí | Limitado |
| `actions.delete` | Sí | Sí | Limitado | No |
| `documents.read` | Sí | Sí | Sí | Sí |
| `documents.create` | Sí | Sí | Sí | Sí |
| `documents.version` | Sí | Sí | Sí | Sí |
| `documents.archive` | Sí | Sí | Limitado | No |
| `tasks.read` | Sí | Sí | Sí | Sí |
| `tasks.create` | Sí | Sí | Sí | Sí |
| `tasks.update` | Sí | Sí | Sí | Limitado |
| `tasks.change_status` | Sí | Sí | Sí | Sí |
| `tasks.assign` | Sí | Sí | Sí | Limitado |
| `tasks.delete` | Sí | Sí | Limitado | No |
| `notes.read` | Sí | Sí | Sí | Sí |
| `notes.create` | Sí | Sí | Sí | Sí |
| `notes.moderate` | Sí | Sí | No | No |
| `dashboard.read` | Sí | Sí | Sí | Sí |
| `team_metrics.read` | Sí | Sí | Sí | No |
| `audit.read` | Sí | Sí | No | No |
| `feedback.create` | Sí | Sí | Sí | Sí |
| `feedback.manage` | Sí | Sí | No | No |

## Reglas para permisos limitados

### Abogada — `cases.assign`

Puede agregarse/quitarse a sí misma como colaboradora y reasignar tareas. Cambiar el responsable principal de un expediente requiere Jefe o Socia.

### Secretaria — actuaciones

Puede corregir metadatos de una actuación creada por ella mientras el expediente no esté cerrado/archivado. No puede cambiar el expediente/cuaderno de destino ni eliminar la actuación.

### Abogada — eliminación de actuaciones

Puede solicitar baja lógica de una actuación creada por error si no tiene documentos y registra un motivo. Si tiene documentos o el expediente está cerrado/archivado, requiere Jefe o Socia.

### Abogada — documentos

Puede archivar un documento sin vigencia jurídica sólo si no es la única versión asociada a una actuación. La eliminación física nunca depende de este permiso.

### Secretaria — tareas

Puede editar tareas creadas por ella o asignadas a ella, cambiar su estado y asignarlas a sí misma. Reasignar a otra persona o cambiar una tarea cerrada requiere Abogada, Socia o Jefe.

### Abogada — eliminación de tareas

Puede dar de baja lógicamente una tarea creada por error mientras no tenga comentarios/documentos. En los demás casos debe cancelarla o pedir intervención administrativa.

## Reglas independientes del rol

- Usuario `SUSPENDED` o `DISABLED`: ninguna sesión válida.
- Sólo Jefe/Socia pueden asignar o retirar `roles.manage` y `users.manage`.
- No se puede suspender, degradar ni eliminar al último usuario activo capaz de `users.manage` y `roles.manage`.
- Un usuario no modifica su propio rol, estado ni permisos.
- Cambiar roles/permisos revoca o rota sesiones para que el cambio sea inmediato.
- `audit.read` no permite alterar auditoría.
- Descarga de archivos exige `documents.read` y acceso al recurso relacionado.
- La visibilidad de una notificación se limita siempre a su `userId`.

## Permisos del seed productivo

El seed productivo sincroniza los 41 permisos atómicos de esta matriz. Jefe y Socia reciben los 41; Abogada 32; Secretaria 22. Las restricciones marcadas como **Limitado** se aplican en los servicios, no mediante nombres de rol dispersos en rutas.

## Tests derivados

Para cada ruta protegida se generará una tabla de casos:

1. sin sesión → `401`;
2. sesión sin permiso → `403`;
3. permiso general pero recurso no autorizado → `403` o `404` según política anti-enumeración;
4. permiso y recurso válido → éxito;
5. usuario suspendido/revocado → `401`;
6. intento de autoescalada o último administrador → conflicto/forbidden;
7. request manual produce el mismo resultado que la UI.

## Decisiones cerradas

- Secretaria opera sobre expedientes existentes y no los crea.
- Abogada no cambia al responsable principal.
- Todos los usuarios activos leen todas las causas en el MVP.
- Jefe y Socia tienen el mismo acceso administrativo inicial.
