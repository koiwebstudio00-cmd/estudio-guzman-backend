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

## Autenticación — diseñado

| Método | Ruta | Uso |
|---|---|---|
| POST | `/auth/login` | validar credenciales y emitir cookie de sesión |
| POST | `/auth/logout` | revocar sesión actual y borrar cookie |
| POST | `/auth/logout-all` | revocar todas las sesiones propias |
| GET | `/auth/me` | usuario, rol y permisos efectivos |
| GET | `/auth/csrf` | emitir/renovar token CSRF |
| POST | `/auth/forgot-password` | iniciar recuperación sin revelar existencia |
| POST | `/auth/reset-password` | consumir token, cambiar password y revocar sesiones |

Login y recuperación tienen rate limit. Las mutaciones autenticadas validan CSRF y `Origin`.

## Dashboard y búsqueda — diseñado

| Método | Ruta | Permiso/uso |
|---|---|---|
| GET | `/dashboard?from=&to=` | KPIs permitidos y tareas del usuario |
| GET | `/search?q=&types=&limit=` | búsqueda global autorizada |
| GET | `/team/metrics?from=&to=` | métricas del equipo con permiso administrativo |

## Usuarios y RBAC — diseñado

| Método | Ruta | Permiso/uso |
|---|---|---|
| GET | `/users?status=&roleId=&cursor=` | `users.read` |
| POST | `/users` | `users.manage`; crear/invitar |
| GET | `/users/:userId` | `users.read` |
| PATCH | `/users/:userId` | `users.manage`; perfil, rol o estado |
| POST | `/users/:userId/reset-password` | recuperación administrativa auditada |
| POST | `/users/:userId/revoke-sessions` | revocar sesiones del usuario |
| GET | `/roles` | listar roles y permisos |
| POST | `/roles` | `roles.manage` |
| PATCH | `/roles/:roleId` | nombre/descripción |
| PATCH | `/roles/:roleId/permissions` | reemplazar matriz de permisos |

## Contactos — diseñado

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

## Expedientes — diseñado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/cases?q=&status=&type=&responsibleId=&courtId=&from=&to=&cursor=` | listado/filtros |
| POST | `/cases` | alta transaccional con partes y responsable |
| GET | `/cases/:caseId` | cabecera, partes, radicación y equipo |
| PATCH | `/cases/:caseId` | edición con optimistic locking |
| DELETE | `/cases/:caseId` | baja lógica altamente restringida |
| POST | `/cases/:caseId/status-transitions` | transición validada con motivo |
| GET | `/cases/:caseId/status-history` | historial de estado |
| GET | `/cases/:caseId/timeline?cursor=` | actividad cronológica |
| GET | `/cases/:caseId/summary` | conteos para tabs/tarjetas |

### Partes, representaciones y equipo

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

## Cuadernos e incidentes — diseñado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/cases/:caseId/subcases?type=&status=` | listar cuadernos/incidentes |
| POST | `/cases/:caseId/subcases` | crear |
| GET | `/subcases/:subCaseId` | detalle y conteos |
| PATCH | `/subcases/:subCaseId` | editar o cerrar |
| DELETE | `/subcases/:subCaseId` | baja lógica restringida |
| GET | `/subcases/:subCaseId/timeline?cursor=` | contenido cronológico |

## Actuaciones — diseñado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/cases/:caseId/actions?subCaseId=&type=&from=&to=&cursor=` | línea de tiempo filtrable |
| POST | `/cases/:caseId/actions` | crear actuación en expediente/cuaderno |
| GET | `/actions/:actionId` | detalle y documentos |
| PATCH | `/actions/:actionId` | corregir metadatos con auditoría |
| DELETE | `/actions/:actionId` | baja lógica restringida |

## Documentos — diseñado

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

## Tareas — diseñado

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

## Notas — diseñado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/notes?caseId=&subCaseId=&contactId=&cursor=` | listar por contexto |
| POST | `/notes` | crear nota interna |
| PATCH | `/notes/:noteId` | editar con auditoría |
| DELETE | `/notes/:noteId` | baja lógica |

## Catálogos judiciales — diseñado

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

## Auditoría, notificaciones y feedback — diseñado

| Método | Ruta | Uso |
|---|---|---|
| GET | `/audit-logs?entityType=&entityId=&actorId=&from=&to=&cursor=` | auditoría restringida |
| GET | `/notifications?unread=&cursor=` | bandeja propia |
| POST | `/notifications/:notificationId/read` | marcar leída |
| POST | `/notifications/read-all` | marcar todas leídas |
| GET | `/notification-preferences` | preferencias propias |
| PATCH | `/notification-preferences` | actualizar preferencias |
| POST | `/feedback` | enviar sugerencia |
| GET | `/feedback?status=&cursor=` | administración |
| PATCH | `/feedback/:feedbackId` | estado/resolución |

## Contrato de creación de expediente

```json
{
  "caseNumber": "123456/2026",
  "title": "Díaz c/ Panini S.A.",
  "type": "LABOR",
  "status": "ACTIVE",
  "startDate": "2026-05-07",
  "courtId": "uuid",
  "managementOfficeId": "uuid",
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
