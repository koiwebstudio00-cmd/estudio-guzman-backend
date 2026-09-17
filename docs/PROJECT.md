# Descripción del proyecto

## Propósito

Este backend provee la API privada del sistema de gestión jurídica de Estudio Guzmán. Centraliza usuarios, contactos, expedientes, partes procesales, actuaciones, cuadernos, tareas, notas, documentos, auditoría, notificaciones y métricas que actualmente existen como datos locales o simulados en el frontend.

Es una aplicación **single-tenant**: existe una única organización y no se agrega `tenantId` ni RLS multi-tenant. El aislamiento se implementa con autenticación, RBAC, autorización por recurso, roles de PostgreSQL separados y pruebas contra acceso horizontal.

## Objetivos

- reemplazar los mocks y `localStorage` del frontend por una fuente de verdad transaccional;
- proteger información jurídica y documentos privados;
- mantener historial y auditoría de operaciones sensibles;
- permitir búsquedas, filtros, tableros y métricas sin duplicar lógica en el frontend;
- desplegar API, PostgreSQL, worker y archivos en un VPS;
- conservar una arquitectura que pueda migrar el storage a S3/MinIO sin reescribir el dominio.

## Usuarios y permisos iniciales

| Rol inicial | Alcance esperado |
|---|---|
| Jefe | administración completa, equipo, permisos, auditoría y catálogos |
| Socia | gestión jurídica y administrativa completa |
| Abogada | expedientes, partes, actuaciones, documentos, tareas y notas |
| Secretaria | contactos, actuaciones, documentos, tareas y operación diaria |

Los servicios no autorizan por el nombre del rol. Evalúan permisos atómicos como `cases.read`, `cases.write`, `documents.read` o `users.manage`. Los roles sólo agrupan permisos.

## Módulos de dominio

| Módulo | Responsabilidad | Estado |
|---|---|---|
| Health | liveness de proceso y readiness de DB/storage | implementado |
| Auth | login, logout, recuperación, CSRF y sesiones | diseñado |
| Users/RBAC | equipo, roles, permisos y estado de usuario | diseñado; seed inicial implementado |
| Contacts | personas/organizaciones, categorías, canales y domicilios | diseñado |
| Cases | expedientes, radicación, estado, partes y equipo interno | diseñado |
| Subcases | cuadernos de prueba e incidentes | diseñado |
| Actions | actuaciones y línea de tiempo | diseñado |
| Documents | metadatos, versiones, permisos y archivos privados | diseñado; adapter local base implementado |
| Tasks | tareas, asignaciones, estados, comentarios y vencimientos | diseñado |
| Notes | notas internas vinculadas a contexto | diseñado |
| Dashboard/Search | agregados, métricas y búsqueda autorizada | diseñado |
| Audit | registro append-only de cambios relevantes | esquema diseñado |
| Notifications | bandeja y preferencias por usuario | esquema diseñado |
| Feedback | sugerencias internas y resolución | esquema diseñado |
| Outbox/Worker | efectos asíncronos, reintentos y mantenimiento | esquema diseñado |

## Flujos principales

### Autenticación

1. El usuario envía email y contraseña.
2. Se normaliza el email, se controla el bloqueo y se verifica Argon2id.
3. Se genera un token opaco criptográficamente aleatorio.
4. PostgreSQL guarda sólo SHA-256 del token y la expiración.
5. El token se entrega en cookie `HttpOnly`, `Secure` en producción y `SameSite` configurable.
6. Las mutaciones validan sesión, origen y CSRF.
7. Logout, cambio de contraseña o cambio de privilegios revocan sesiones según la política definida.

No se usan JWT ni credenciales en `localStorage`.

### Alta de expediente

Una única transacción crea expediente, partes procesales, representaciones iniciales, responsable principal, historial de estado, auditoría y eventos outbox. Si una operación falla, no queda un expediente parcial.

### Actuaciones y documentos

Las actuaciones registran eventos jurídicos dentro de un expediente o cuaderno. Los bytes se almacenan fuera del webroot con una clave opaca; PostgreSQL conserva nombre original, MIME detectado, tamaño, SHA-256, versión y relaciones. La descarga siempre pasa por autorización.

### Tareas

Las transiciones de estado y reasignaciones se registran como historial. Las notificaciones se crean desde outbox, fuera de la transacción HTTP.

## Modelo de datos

El esquema canónico es `prisma/schema.prisma`. Sus grupos principales son:

- identidad: `User`, `Role`, `Permission`, `RolePermission`, `Session`, `PasswordResetToken`;
- contactos: `Contact`, `ContactCategory`, `ContactChannel`, `ContactAddress`;
- catálogos judiciales: `Court`, `ManagementOffice`, `CourtManagementOffice`;
- expedientes: `LegalCase`, `CaseParticipant`, `CaseRepresentation`, `CaseTeamMember`, `CaseStatusHistory`;
- operación jurídica: `SubCase`, `CaseAction`;
- tareas: `Task`, `TaskAssignment`, `TaskStatusHistory`, `TaskComment`;
- conocimiento interno: `Note`;
- archivos: `Document`, `DocumentVersion`;
- plataforma: `AuditLog`, `Notification`, `NotificationPreference`, `Feedback`, `OutboxEvent`.

### Convenciones de persistencia

- IDs UUID.
- Instantes en `timestamptz` y UTC.
- Fechas jurídicas sin hora en `date`.
- Campos públicos JSON en camelCase y columnas SQL en snake_case.
- Soft delete sólo donde existe una necesidad real de retención.
- Historial y auditoría no se sobrescriben.
- Entidades editables importantes incluyen `version` para optimistic locking.
- Email, documento, CUIT y campos de búsqueda se guardan además normalizados.

## Archivos en el VPS

- raíz productiva sugerida: `/srv/estudio-guzman/storage`;
- nunca se publica como directorio estático;
- clave opaca: `cases/<caseId>/<documentId>/<versionId>`;
- upload temporal, límite durante streaming, MIME real, checksum, escaneo y rename atómico;
- versiones inmutables y borrado físico diferido/auditado;
- para archivos grandes, Express autoriza y puede delegar la entrega a Nginx mediante `X-Accel-Redirect`.

## Procesos desplegables

| Proceso | Responsabilidad |
|---|---|
| API | HTTP, autenticación, autorización y reglas síncronas |
| Worker | outbox, notificaciones, vencimientos, limpieza y escaneo |
| PostgreSQL | datos relacionales y coordinación transaccional |
| Reverse proxy | TLS, frontend estático y proxy `/api` |
| Storage privado | documentos persistentes compartidos por API/worker |

El worker usará `FOR UPDATE SKIP LOCKED` para reclamar trabajos. No se inicia dentro del proceso HTTP.

## Estado actual

Implementado: scaffolding, configuración validada, servidor Express, logging, errores, health checks, conexión Prisma 7, esquema de datos, seed RBAC, adapter local base, Docker/Compose y tests iniciales.

Pendiente inmediato: primera migración revisada, autenticación, autorización, bootstrap del administrador, auditoría transaccional y pruebas de integración con PostgreSQL real.

## Documentos relacionados

- `ARCHITECTURE.md`: capas, estructura, middlewares y servicios.
- `API.md`: convenciones y catálogo de endpoints.
- `DEPENDENCIES.md`: paquetes, versiones, scripts y configuración.
- `IMPLEMENTATION_PLAN.md`: orden incremental, pruebas y criterios de salida.
