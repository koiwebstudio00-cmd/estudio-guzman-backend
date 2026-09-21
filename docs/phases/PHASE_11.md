# Fase 11 — Notificaciones, feedback y worker

Estado: **completada**

Fecha: 2026-09-19

Ramas locales: `fase-11` en backend y frontend, acumulativas desde `fase-10`. Sin push ni merge.

## Resultado

Una asignación genera exactamente una notificación para su destinatario mediante el proceso worker separado. La plataforma incluye bandeja, contador, preferencias, vencimientos, alertas operativas y circuito de sugerencias.

## Backend

- bandeja propia paginada con filtro leído/no leído y contador;
- marcado individual y masivo, siempre acotado al `userId` autenticado;
- preferencias propias para asignación, próximo vencimiento, vencida, cambio de expediente y anticipación;
- feedback con creación general y administración protegida por `feedback.manage`;
- resolución o rechazo con explicación, responsable y timestamp;
- worker general de outbox independiente de la API y compatible con modo antivirus `skip` o `clamav`;
- claim atómico con `FOR UPDATE SKIP LOCKED` y recuperación de locks con más de 15 minutos;
- reintento exponencial, máximo de intentos, estado terminal y alerta a usuarios con `audit.read`;
- idempotencia persistida mediante `dedupeKey` único en outbox y notificaciones;
- generación horaria de eventos `TASK_DUE_SOON` y `TASK_OVERDUE` según preferencias;
- notificaciones de `TASK_ASSIGNED` y `CASE_STATUS_CHANGED`;
- housekeeping de sesiones expiradas/revocadas, tokens consumidos/expirados y outbox procesado antiguo;
- `GET /api/v1/health/worker` con eventos fallidos, locks estancados y último procesamiento;
- migración `20260919000200_notification_idempotency` para claves únicas;
- corrección del evento duplicado de reasignación: auditoría única y un evento dirigido por cada alta real.

## Frontend

- campana con contador no leído y refresco periódico;
- bandeja con estados leído/no leído y acción “marcar todas”;
- preferencias configurables desde la bandeja;
- formulario **Sugerir mejora** conectado a la API;
- pantalla administrativa con filtro, resolución y rechazo;
- identidad del sidebar tomada de la sesión real, no del store mock;
- errores de notificaciones aislados para no bloquear el encabezado ni la navegación.

## Pruebas automáticas

### Backend

```text
Unitarios/API: 5 archivos, 18 tests aprobados
Integración PostgreSQL: 10 archivos, 55 tests aprobados
Prisma, ESLint, TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

Los cinco escenarios nuevos cubren dos workers concurrentes, idempotencia, preferencias, scheduler sin duplicados, aislamiento/IDOR de bandeja, feedback y permisos, fallo terminal y alerta administrativa.

### Frontend

```text
Unitarios/componentes: 7 archivos, 10 tests aprobados
E2E Chromium: 11 tests aprobados
TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

El E2E nuevo recorre contador, lectura, preferencias, alta de sugerencia y resolución administrativa.

## Prueba manual local

### 1. Aplicar migración y levantar API, worker y frontend

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-11
npm run db:deploy
npm run seed
npm run dev
```

En una segunda terminal del backend:

```bash
npm run dev:worker
```

En una tercera terminal:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-11
npm run dev
```

En desarrollo puede usarse `MALWARE_SCAN_MODE=skip`; las notificaciones igualmente se procesan. Producción sigue exigiendo `clamav`.

### 2. Flujo funcional

1. Con dos usuarios, asignar una tarea del primero al segundo.
2. Esperar el polling del worker y abrir la campana del segundo.
3. Confirmar una sola notificación y marcarla como leída.
4. Desactivar **Tareas asignadas** en preferencias y repetir con otra tarea: no debe aparecer aviso.
5. Crear una tarea con vencimiento cercano y confirmar el aviso según días configurados.
6. Enviar una sugerencia desde el sidebar.
7. Ingresar con `feedback.manage`, abrir **Sugerencias** y resolverla.
8. Consultar `http://localhost:3001/api/v1/health/worker` y confirmar `stalled: 0`.

### 3. Prueba rápida por API

```bash
curl -s 'http://localhost:3001/api/v1/notifications?unread=true' \
  -H 'Cookie: eg_session=COOKIE'

curl -i -X PATCH http://localhost:3001/api/v1/notification-preferences \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  -H 'Content-Type: application/json' \
  --data '{"taskAssigned":true,"dueSoonLeadDays":2}'

curl -i -X POST http://localhost:3001/api/v1/feedback \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  -H 'Content-Type: application/json' \
  --data '{"message":"Agregar exportación de métricas"}'
```

## Siguiente fase

Fase 12 realiza hardening de seguridad, contratos, operación, backup/restauración y preparación repetible del VPS.
