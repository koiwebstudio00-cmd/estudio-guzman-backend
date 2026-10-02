# Contrato HTTP

> Este documento es el inventario objetivo de la API. Sólo las rutas marcadas como **implementadas** existen hoy; el resto define el contrato a construir y puede ajustarse durante la validación funcional.

## Convenciones

- Base URL: `/api/v1`.
- JSON y query params en camelCase.
- IDs UUID.
- Fechas sin hora: `YYYY-MM-DD`; instantes: ISO 8601 UTC.
- Paginación por cursor: `?limit=25&cursor=...`, máximo 100.
- Colecciones: `{ "data": [], "meta": { "nextCursor": null } }`.
- Recurso: `{ "data": {} }`.
- Errores: `application/problem+json` con `type`, `title`, `status`, `detail`, `instance`, `requestId` y opcionalmente `errors`.
- Mutaciones críticas pueden exigir `Idempotency-Key`.
- Recursos con optimistic locking reciben `version`; una versión obsoleta responde `409`.
- Un endpoint de archivos nunca expone la ruta física.
- `DELETE` puede representar baja lógica/archivo según la política de retención.

## Health — implementado

| Método | Ruta | Auth | Uso |
|---|---|---|---|
| GET | `/health/live` | no | proceso vivo, sin consultar dependencias |
| GET | `/health/ready` | no | PostgreSQL y storage listos |

## Autenticación — implementado

| Método | Ruta | Uso |
|---|---|---|
| POST | `/auth/login` | validar credenciales y emitir cookie de sesión |
| POST | `/auth/logout` | revocar sesión actual y borrar cookie |
| POST | `/auth/logout-all` | revocar todas las sesiones propias |
| GET | `/auth/me` | usuario, rol y permisos efectivos |
| PATCH | `/auth/me` | editar nombre, email o avatar propios con `version` |
| GET | `/auth/csrf` | recuperar el token CSRF derivado de la sesión vigente |
| POST | `/auth/change-password` | cambiar la contraseña propia verificando la actual y revocar sesiones |
| POST | `/auth/forgot-password` | iniciar recuperación sin revelar existencia |
| POST | `/auth/reset-password` | consumir token, cambiar password y revocar sesiones |

Login y recuperación tienen rate limit. Las mutaciones autenticadas validan CSRF y `Origin`.

`POST /auth/login` recibe `{ "email": "...", "password": "..." }` y responde:

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "name": "Administración",
      "avatarUrl": null,
      "role": { "id": "uuid", "code": "HEAD", "name": "Jefe" },
      "permissions": ["dashboard.read"]
    },
    "csrfToken": "token-opaco"
  }
}
```

La sesión se entrega además en una cookie `HttpOnly` con path `/api/v1`; el cuerpo nunca contiene el token de sesión. `GET /auth/me` devuelve `user`, incluida su `version`, y `GET /auth/csrf` permite reconstruir el estado CSRF de la SPA después de un refresh. `PATCH /auth/me` acepta `{ "version", "name"?, "email"?, "avatarUrl"? }`, no permite modificar rol ni estado y registra `USER_PROFILE_UPDATED`. `POST /auth/change-password` acepta `{ "currentPassword", "newPassword" }`, exige la contraseña vigente, revoca todas las sesiones y responde `204`; la SPA debe solicitar un nuevo login. `POST /auth/logout`, `POST /auth/logout-all` y `POST /auth/reset-password` también responden `204`.

Las mutaciones autenticadas envían `x-csrf-token` y un `Origin` incluido en `CORS_ORIGIN`. Login, forgot y reset también exigen un origen permitido. Credenciales incorrectas, cuentas inexistentes, suspendidas o bloqueadas comparten la misma respuesta `401`.

`POST /auth/forgot-password` siempre responde `202` con el mismo mensaje. En desarrollo, la instrucción queda en `STORAGE_ROOT/.private/password-resets/<tokenId>.json` con permisos privados; en producción el futuro proveedor de email procesará el evento outbox. La DB y el outbox nunca contienen el token sin hash.
Al emitir un token nuevo se invalidan los anteriores; al completar el cambio se consumen todos los tokens pendientes y se revocan todas las sesiones del usuario.

## Dashboard y búsqueda — implementado

| Método | Ruta | Permiso/uso |
|---|---|---|
| GET | `/dashboard?from=&to=` | KPIs permitidos y tareas del usuario |
| GET | `/search?q=&types=&limit=` | búsqueda global autorizada |
| GET | `/team/metrics?from=&to=` | métricas del equipo con permiso administrativo |

`GET /dashboard` devuelve en `data.activity` únicamente los 10 movimientos relevantes más
recientes. Antes de ordenar y aplicar el límite excluye toda acción cuyo código comience con
`AUTH_` o `USER_`. Conserva la actividad de expedientes, tareas, contactos, actuaciones,
documentos, notas, cuadernos, feedback, roles, catálogos y preferencias. Un usuario con
`audit.read` ve movimientos relevantes de todo el equipo; sin ese permiso, sólo los realizados
por el usuario autenticado.

## Usuarios y RBAC — implementado

| Método | Ruta | Permiso/uso |
|---|---|---|
| GET | `/users?status=&roleId=&cursor=` | `users.read` |
| POST | `/users` | `users.manage`; crear con contraseña inicial |
| GET | `/users/:userId` | `users.read` |
| PATCH | `/users/:userId` | `users.manage`; perfil, rol, estado o contraseña de otro usuario |
| POST | `/users/:userId/reset-password` | recuperación administrativa auditada |
| POST | `/users/:userId/revoke-sessions` | revocar sesiones del usuario |
| GET | `/roles` | listar roles y permisos |
| POST | `/roles` | `roles.manage` |
| PATCH | `/roles/:roleId` | nombre/descripción |
| PATCH | `/roles/:roleId/permissions` | reemplazar matriz de permisos |

Todas las rutas requieren sesión. Las lecturas exigen `users.read` o `roles.read`; las mutaciones exigen `users.manage` o `roles.manage`, `Origin` permitido y CSRF. Crear un usuario requiere ambos permisos administrativos porque asigna un rol.

El alta exige una contraseña inicial de 8 a 200 caracteres definida por el administrador. Las contraseñas nuevas deben incluir mayúscula, minúscula y número. La API las procesa únicamente para generar su hash Argon2 y nunca las devuelve, registra ni incluye en auditoría u outbox. `PATCH /users/:userId` exige `version` para optimistic locking y permite el campo opcional `password` sólo para administrar a otro usuario. Cambiar contraseña, rol/estado o permisos revoca las sesiones afectadas inmediatamente. Un administrador cambia su propia contraseña únicamente mediante `/auth/change-password`, verificando la contraseña actual.

La API rechaza el cambio del propio rol/estado, la edición de permisos del propio rol y cualquier operación que deje cero usuarios activos con `users.manage` + `roles.manage`. La comprobación del último administrador se serializa con un advisory lock transaccional para evitar carreras.

## Contactos — implementado

Todas las rutas de esta sección están implementadas.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/contacts?q=&kind=&category=&cursor=` | directorio paginado |
| POST | `/contacts` | persona/organización con categorías y datos iniciales |
| GET | `/contacts/:contactId` | detalle y resumen de causas |
| PATCH | `/contacts/:contactId` | edición con `version` |
| DELETE | `/contacts/:contactId` | baja lógica restringida |
| GET | `/contacts/:contactId/cases` | participaciones en expedientes |
| POST | `/contacts/:contactId/channels` | agregar teléfono/email/etc. |
| PATCH | `/contacts/:contactId/channels/:channelId` | editar o definir principal |
| DELETE | `/contacts/:contactId/channels/:channelId` | quitar canal |
| POST | `/contacts/:contactId/addresses` | agregar domicilio |
| PATCH | `/contacts/:contactId/addresses/:addressId` | editar domicilio |
| DELETE | `/contacts/:contactId/addresses/:addressId` | quitar domicilio |

## Expedientes — implementado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/cases?q=&status=&type=&responsibleId=&courtId=&from=&to=&cursor=` | listado/filtros |
| POST | `/cases` | alta transaccional con partes y responsable |
| GET | `/cases/:caseId` | cabecera, partes, radicación y equipo |
| PATCH | `/cases/:caseId` | edición con optimistic locking |
| DELETE | `/cases/:caseId` | baja lógica altamente restringida |
| POST | `/cases/:caseId/status-transitions` | transición validada con motivo |
| GET | `/cases/:caseId/status-history` | historial de estado |
| GET | `/cases/:caseId/timeline?cursor=&limit=` | timeline unificado de actuaciones, estados y cuadernos |
| GET | `/cases/:caseId/summary` | conteos para tabs/tarjetas |

### Partes, representaciones y equipo

Estado: **implementado**.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/cases/:caseId/participants` | partes y representaciones |
| POST | `/cases/:caseId/participants` | agregar parte procesal |
| PATCH | `/cases/:caseId/participants/:participantId` | rol, lado, orden o notas |
| DELETE | `/cases/:caseId/participants/:participantId` | retirar participación |
| POST | `/cases/:caseId/participants/:participantId/representations` | agregar representación |
| DELETE | `/cases/:caseId/representations/:representationId` | finalizar representación |
| GET | `/cases/:caseId/team` | equipo actual e histórico |
| POST | `/cases/:caseId/team` | asignar responsable/colaborador |
| PATCH | `/cases/:caseId/team/:membershipId` | cambiar rol/finalizar asignación |

## Cuadernos e incidentes — implementado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/cases/:caseId/subcases?type=&status=` | listar cuadernos/incidentes |
| POST | `/cases/:caseId/subcases` | crear |
| GET | `/subcases/:subCaseId` | detalle y conteos |
| PATCH | `/subcases/:subCaseId` | editar metadatos con optimistic locking |
| POST | `/subcases/:subCaseId/status-transitions` | resolver, cerrar o reabrir mediante transición validada |
| DELETE | `/subcases/:subCaseId` | baja lógica restringida |
| GET | `/subcases/:subCaseId/timeline?cursor=` | contenido cronológico |

Un expediente archivado y un cuaderno cerrado son de sólo lectura. Reabrir un cuaderno cerrado requiere permiso administrativo. Las transiciones que resuelven, cierran o reabren requieren motivo y se incorporan al timeline desde el registro de auditoría.

## Actuaciones — implementado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/cases/:caseId/actions?subCaseId=&type=&from=&to=&cursor=` | línea de tiempo filtrable |
| POST | `/cases/:caseId/actions` | crear actuación en expediente/cuaderno |
| GET | `/actions/:actionId` | detalle y documentos |
| PATCH | `/actions/:actionId` | corregir metadatos con auditoría |
| DELETE | `/actions/:actionId` | baja lógica restringida; body `{ "reason": "..." }` |

Una actuación puede pertenecer al expediente principal o a un cuaderno del mismo expediente. `presentationAt` no puede ser anterior a `documentAt`. La corrección usa `version`; la baja y edición propia quedan limitadas por estado, autoría, permisos y documentos vinculados.

## Documentos — implementado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/documents?caseId=&actionId=&taskId=&cursor=` | metadatos autorizados |
| POST | `/documents` | multipart, documento y primera versión |
| GET | `/documents/:documentId` | metadatos y versiones |
| PATCH | `/documents/:documentId` | título/categoría |
| DELETE | `/documents/:documentId` | archivar según retención |
| POST | `/documents/:documentId/versions` | versión inmutable nueva |
| GET | `/documents/:documentId/download` | última versión autorizada |
| GET | `/documents/:documentId/versions/:versionId/download` | versión específica |

El servidor valida tamaño durante streaming, MIME real, extensión, checksum y permisos. Los vínculos admitidos son expediente, cuaderno, actuación, tarea o nota.

`POST /documents` usa `multipart/form-data`: un campo `file` y los campos `title`, `category`, `description` opcional y exactamente uno entre `caseId`, `subCaseId`, `actionId`, `taskId` o `noteId`. Sólo se admite PDF hasta `MAX_FILE_SIZE_MB`. `POST /documents/:documentId/versions` acepta únicamente `file`.

Las respuestas no incluyen `storageKey`. En desarrollo con `MALWARE_SCAN_MODE=skip`, la versión queda `SKIPPED`; en producción el modo `clamav` es obligatorio, la versión comienza `PENDING` y el worker habilita la descarga sólo al quedar `CLEAN`. `INFECTED`, `FAILED` y `PENDING` nunca entregan bytes.

## Tareas — implementado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/tasks?status=&priority=&assigneeId=&caseId=&dueFrom=&dueTo=&cursor=` | Kanban/listado |
| POST | `/tasks` | crear y asignar |
| GET | `/tasks/:taskId` | detalle, asignaciones, comentarios y adjuntos |
| PATCH | `/tasks/:taskId` | contenido, prioridad o vencimiento |
| DELETE | `/tasks/:taskId` | baja lógica |
| POST | `/tasks/:taskId/status-transitions` | transición e historial |
| POST | `/tasks/:taskId/assignments` | asignar/reasignar |
| GET | `/tasks/:taskId/status-history` | historial |
| GET | `/tasks/:taskId/comments` | comentarios |
| POST | `/tasks/:taskId/comments` | comentar |
| PATCH | `/tasks/:taskId/comments/:commentId` | editar según autor/permiso |
| DELETE | `/tasks/:taskId/comments/:commentId` | baja lógica |

## Notas — implementado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/notes?caseId=&subCaseId=&contactId=&cursor=` | listar por contexto |
| POST | `/notes` | crear nota interna |
| PATCH | `/notes/:noteId` | editar con auditoría |
| DELETE | `/notes/:noteId` | baja lógica |

## Catálogos judiciales — implementado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/catalogs` | enums y etiquetas para UI |
| GET | `/courts?q=&active=&cursor=` | listar juzgados |
| POST | `/courts` | crear juzgado |
| GET | `/courts/:courtId` | detalle |
| PATCH | `/courts/:courtId` | editar/desactivar |
| GET | `/management-offices?q=&active=&cursor=` | listar oficinas |
| POST | `/management-offices` | crear oficina |
| GET | `/management-offices/:officeId` | detalle |
| PATCH | `/management-offices/:officeId` | editar/desactivar |

## Auditoría, notificaciones y feedback

Auditoría, notificaciones, preferencias y feedback están **implementados**.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/audit-logs?entityType=&entityId=&actorId=&from=&to=&cursor=&limit=` | página “Actividad”; requiere `audit.read` |
| GET | `/notifications?unread=&cursor=` | bandeja propia |
| POST | `/notifications/:notificationId/read` | marcar leída |
| POST | `/notifications/read-all` | marcar todas leídas |
| GET | `/notification-preferences` | preferencias propias |
| PATCH | `/notification-preferences` | actualizar preferencias |
| POST | `/feedback` | enviar sugerencia |
| GET | `/feedback?status=&cursor=` | administración |
| PATCH | `/feedback/:feedbackId` | estado/resolución |

`GET /audit-logs` es la fuente completa de la página “Actividad” y no comparte el resumen del
dashboard. Usa cursor descendente, devuelve como máximo 100 registros por página y responde:

```json
{
  "data": [
    {
      "id": "123",
      "action": "CASE_CREATED",
      "entityType": "LegalCase",
      "entityId": "uuid",
      "actor": { "id": "uuid", "name": "Usuario", "email": "usuario@example.com", "avatarUrl": "https://example.com/avatar.webp" },
      "createdAt": "2026-09-20T15:30:00.000Z",
      "before": null,
      "after": { "status": "ACTIVE" },
      "metadata": null,
      "requestId": "uuid",
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0"
    }
  ],
  "meta": { "nextCursor": "122" }
}
```

Filtros disponibles:

- `entityType`: coincidencia exacta por tipo de entidad o módulo;
- `entityId`: filtro adicional conservado por compatibilidad;
- `actorId`: UUID del usuario que realizó el movimiento;
- `from`: día inicial `YYYY-MM-DD`, inclusivo en UTC;
- `to`: día final `YYYY-MM-DD`, inclusivo en UTC;
- `cursor`: ID decimal retornado en `meta.nextCursor`;
- `limit`: entre 1 y 100; por defecto 25.

La colección siempre conserva `data` y `meta.nextCursor`. No existe endpoint para modificar o
eliminar registros de auditoría.

Tanto los registros completos como `activity` de `GET /dashboard` incluyen `actor.avatarUrl`
(nullable) para representar al usuario; el cliente debe usar sus iniciales cuando no exista imagen.

## Contrato de creación de expediente

```json
{
  "caseNumber": "123456/2026",
  "title": "Díaz c/ Panini S.A.",
  "type": "LABOR",
  "status": "ACTIVE",
  "startDate": "2026-05-07",
  "courtName": "Juzgado Laboral N.º 3",
  "managementOfficeName": "Oficina 12",
  "participants": [
    { "contactId": "uuid", "role": "CLAIMANT", "side": "OUR_SIDE", "isClient": true },
    { "contactId": "uuid", "role": "DEFENDANT", "side": "COUNTERPART", "isClient": false }
  ],
  "primaryResponsibleId": "uuid"
}
```

El servicio crea expediente, partes, asignación, historial inicial, auditoría y outbox dentro de una única transacción.

## Contrato de transición de tarea

```json
{
  "toStatus": "COMPLETED",
  "reason": "Presentación realizada",
  "version": 3
}
```

Responde `200` con la tarea actualizada. Si `version` quedó obsoleta responde `409 Conflict`.
