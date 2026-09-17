# Arquitectura del backend

## Estilo arquitectónico

Monolito modular en Node.js. API y worker comparten modelos y servicios, pero se ejecutan como procesos independientes. No se incorporan microservicios, Redis ni una cola externa durante el MVP.

El flujo obligatorio dentro de un módulo es:

```text
HTTP request
  → middlewares globales
  → routes/controller
  → schemas Zod
  → service (reglas + transacción)
  → repository/Prisma y adapters
  → response DTO
```

Las rutas conocen HTTP; los servicios conocen el dominio; los repositorios conocen Prisma. Un repositorio se crea cuando aporta queries reutilizables o aislamiento, no como envoltorio mecánico de cada llamada.

## Estructura objetivo

```text
backend/
  docs/
    PROJECT.md
    ARCHITECTURE.md
    API.md
    DEPENDENCIES.md
  prisma/
    migrations/
    schema.prisma
    seed.ts
  src/
    app.ts
    server.ts
    worker.ts
    config.ts
    database/
      prisma.ts
    middleware/
      authenticate.ts
      authorize.ts
      csrf.ts
      error.ts
      rate-limit.ts
      validate.ts
    modules/
      health/
      auth/
      users/
      contacts/
      cases/
      catalogs/
      subcases/
      actions/
      documents/
      tasks/
      notes/
      dashboard/
      search/
      audit/
      notifications/
      feedback/
    shared/
      auth/
      crypto/
      http/
      logging/
      pagination/
      storage/
      validation/
    workers/
      outbox-worker.ts
  test/
    integration/
    fixtures/
```

Dentro de cada módulo se usa sólo lo necesario:

```text
modules/cases/
  routes.ts       # paths, métodos y composición de middlewares
  schemas.ts      # params/query/body y DTOs con Zod
  service.ts      # reglas, permisos de recurso y transacciones
  repository.ts   # queries Prisma/SQL específicas
  mapper.ts       # modelo interno → contrato público, si hace falta
  service.test.ts
  routes.test.ts
```

## Archivos base implementados

| Archivo | Responsabilidad |
|---|---|
| `src/config.ts` | cargar `.env`, validar tipos/defaults y fallar ante producción insegura |
| `src/app.ts` | construir Express, ordenar middlewares y montar `/api/v1` |
| `src/server.ts` | preparar storage, escuchar y ejecutar graceful shutdown |
| `src/database/prisma.ts` | crear una sola instancia lazy de Prisma con adapter `pg` |
| `src/middleware/error.ts` | 404 y transformación de errores a RFC 7807 |
| `src/shared/logging/logger.ts` | Pino JSON, request ID, serializers y redacción |
| `src/shared/http/errors.ts` | códigos y clase `ApiError` |
| `src/shared/storage/local-storage.ts` | raíz privada, readiness y resolución segura de claves |
| `src/modules/health/routes.ts` | liveness/readiness |

`src/generated/prisma/` es generado por Prisma y no se edita manualmente.

## Ciclo de una solicitud

1. El reverse proxy termina TLS y agrega cabeceras confiables.
2. Pino obtiene o genera un UUID `x-request-id` y crea el logger de la solicitud.
3. Helmet aplica cabeceras de seguridad.
4. CORS valida la allowlist configurada.
5. Express limita y parsea JSON; `cookie-parser` lee cookies.
6. La ruta aplica rate limit, autenticación, CSRF, autorización y validación según corresponda.
7. El controller invoca un servicio con datos ya tipados y contexto de actor.
8. El servicio ejecuta reglas y, cuando corresponde, una transacción que incluye historial, auditoría y outbox.
9. El mapper produce un DTO sin hashes, rutas físicas, secretos ni columnas internas.
10. La respuesta incluye `x-request-id`; los errores usan `application/problem+json`.

## Middlewares

### Implementados

| Middleware | Orden | Función |
|---|---:|---|
| `requestLogger()` | 1 | log JSON, duración, request ID y redacción |
| `helmet()` | 2 | headers HTTP defensivos |
| `cors()` | 3 | origen permitido y credenciales |
| `express.json()` | 4 | JSON con límite global de 1 MB |
| `cookieParser()` | 5 | lectura de cookie de sesión/CSRF |
| `notFoundHandler` | penúltimo | respuesta 404 uniforme |
| `errorHandler` | último | Zod, `ApiError` y errores inesperados |

### Planificados

| Middleware | Uso |
|---|---|
| `authenticate` | resolver cookie opaca, sesión vigente, usuario y permisos |
| `requirePermission(code)` | exigir permiso atómico antes del controller |
| `csrfProtection` | comparar token/cabecera y validar `Origin` en mutaciones |
| `validate({ params, query, body })` | producir input Zod tipado sin casts |
| `loginRateLimit` | limitar intentos por IP y clave normalizada sin filtrar existencia |
| `uploadRateLimit` | limitar concurrencia y frecuencia de archivos |
| `multipartUpload` | streaming con límite real de bytes; nunca buffer sin cota |

Los middlewares autentican y validan requisitos generales; la autorización sobre un recurso concreto permanece en el servicio.

## Servicios

| Servicio | Responsabilidad |
|---|---|
| `AuthService` | login, recuperación y cambio de contraseña |
| `SessionService` | emitir, hashear, renovar, revocar y limpiar sesiones opacas |
| `AuthorizationService` | resolver permisos y políticas sobre recursos |
| `UserService` | altas, estado, perfil, rol y protección del último administrador |
| `ContactService` | normalización, duplicados, categorías, canales y domicilios |
| `CaseService` | expediente, radicación, estado y transacciones principales |
| `ParticipantService` | partes procesales y representaciones |
| `CaseTeamService` | responsable principal, colaboradores e historial |
| `CatalogService` | juzgados, oficinas y etiquetas de enums |
| `SubCaseService` | cuadernos de prueba e incidentes |
| `ActionService` | actuaciones y línea de tiempo |
| `DocumentService` | metadatos, versiones, retención y autorización de descarga |
| `StorageService` | leer/escribir bytes por clave opaca sin exponer paths |
| `TaskService` | tareas, transiciones, asignaciones y comentarios |
| `NoteService` | notas internas contextualizadas |
| `DashboardService` | KPIs y agregados para el inicio |
| `SearchService` | búsqueda unificada, normalización y resultados autorizados |
| `AuditService` | eventos append-only dentro de la transacción de negocio |
| `NotificationService` | bandeja, preferencias y marcado de lectura |
| `FeedbackService` | recepción, clasificación y resolución de sugerencias |
| `OutboxService` | publicar eventos dentro de la transacción actual |

### Reglas para servicios

- no reciben `Request`/`Response`; reciben comandos tipados y `ActorContext`;
- no devuelven modelos Prisma completos;
- abren la transacción en el servicio que representa el caso de uso;
- no realizan SMTP, red, antivirus ni otro I/O externo dentro de una transacción DB;
- los errores esperados son `ApiError`/errores de dominio con códigos estables;
- una actualización con `version` debe fallar con `409 CONFLICT` si otro usuario modificó el recurso;
- toda mutación sensible escribe auditoría en la misma transacción.

## Repositorios y Prisma

- Prisma sólo se importa desde repositorios, servicios infraestructurales o scripts explícitos.
- Selects públicos declaran campos seguros; nunca se retorna `passwordHash`, `tokenHash` o `csrfSecretHash`.
- SQL manual se admite para búsqueda, agregados, locks y claims del outbox.
- `DATABASE_URL` pertenece al usuario de runtime con permisos mínimos.
- `DATABASE_URL_MIGRATE` pertenece al rol owner/migrador y sólo se usa en release/administración.
- Las migraciones aplicadas son inmutables. La SQL generada se revisa antes de aplicar.

## Autenticación y autorización

### Sesiones

- token aleatorio de alta entropía;
- sólo su SHA-256 se persiste;
- cookie `HttpOnly`; `Secure` obligatorio en producción;
- expiración absoluta más ventana de inactividad;
- rotación después de login o cambio de privilegios;
- revocación por logout, contraseña, suspensión y logout global.

### RBAC

`Role ↔ RolePermission ↔ Permission`. Las rutas exigen permisos básicos y el servicio valida el recurso. Conocer un UUID nunca concede acceso. Acciones destructivas o administrativas tienen permisos propios.

## Errores HTTP

Formato estándar:

```json
{
  "type": "https://api.estudioguzman.local/problems/validation-error",
  "title": "Datos inválidos",
  "status": 400,
  "detail": "Revisá los campos enviados.",
  "instance": "/api/v1/cases",
  "requestId": "uuid",
  "errors": [{ "field": "title", "message": "Required" }]
}
```

Códigos base: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` e `INTERNAL`.

No se devuelven stack traces, mensajes SQL, paths, nombres de buckets o detalles internos.

## Logging y observabilidad

- salida JSON a stdout/stderr;
- timestamp ISO, nivel, request ID, método, URL, status y duración;
- cookies, Authorization, API keys y tokens redactados;
- no registrar bodies jurídicos, documentos, passwords, DNI/CUIT completos ni contenido de notas;
- `/health/live` se excluye del access log normal;
- liveness no consulta dependencias; readiness consulta PostgreSQL y storage;
- futuras métricas: latencia, 5xx, sesiones, uploads, disco, conexiones y lag de outbox.

## Storage

La interfaz objetivo contiene operaciones equivalentes a `put`, `openReadStream`, `exists`, `delete` y `moveFromTemporary`. `LocalStorageService` es el adapter inicial. El dominio guarda claves opacas, nunca rutas absolutas.

Controles requeridos para uploads: nombre seguro para descarga, límite durante streaming, extensión, MIME detectado, SHA-256, archivo temporal, escaneo, persistencia atómica y cleanup ante fallos.

## Outbox y worker

La transacción de negocio crea `OutboxEvent`. El worker:

1. reclama un lote con `FOR UPDATE SKIP LOCKED`;
2. marca `PROCESSING` dentro de una transacción corta;
3. ejecuta el efecto fuera del lock;
4. marca `PROCESSED` o agenda reintento con backoff;
5. después de agotar intentos deja `FAILED` y genera alerta.

Los handlers deben ser idempotentes porque una entrega puede repetirse.

## Testing

- unitario: normalización, permisos, transiciones y claves de storage;
- API: contratos, Zod, errores, cookies, CSRF y rate limits;
- integración: PostgreSQL real con migraciones, transacciones y constraints;
- seguridad: IDOR, acceso horizontal, path traversal y enumeración;
- E2E: login → contacto → expediente → actuación/documento → tarea;
- recuperación: backup y restauración ensayados en staging.

No se usan datos personales reales en fixtures.

## Despliegue

La imagen final corre como usuario `node`, contiene sólo dependencias de runtime y no incluye Prisma CLI. Las migraciones se ejecutan una sola vez como job de release antes de actualizar API/worker. El arranque de cada réplica nunca aplica migraciones.

Secuencia de apagado: dejar de aceptar HTTP, completar solicitudes en curso, detener polling del worker, cerrar Prisma y salir. Existe un timeout de seguridad de 10 segundos en la API.
