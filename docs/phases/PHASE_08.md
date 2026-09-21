# Fase 8 — Documentos y storage privado

Estado: **completada**

Fecha: 2026-09-19

Ramas locales: `fase-8` en backend y frontend, creadas desde los commits finales de `fase-7`. Sin push ni merge.

## Resultado

La plataforma permite subir un PDF real desde un expediente o actuación, conservar versiones inmutables, listar metadata y descargar una versión autorizada sin exponer rutas físicas. Los bytes quedan fuera del webroot y la base sólo guarda metadata, checksum y una clave opaca.

## Backend

- módulo `documents` con contrato multipart, Zod, servicio, repositorio, DTO y cursor;
- upload a temporal por streaming mediante Busboy, con límite aplicado durante la recepción;
- rate limit de uploads por usuario antes de recibir el body;
- aceptación exclusiva de PDF: extensión, `Content-Type`, magic bytes, EOF y rechazo de cifrado;
- nombre original saneado, SHA-256 incremental y tamaño verificado;
- movimiento atómico desde `.tmp` y cleanup ante validación, rollback o upload interrumpido;
- documento y primera versión persistidos junto con auditoría/outbox en una transacción;
- versiones numeradas e inmutables bajo advisory lock para soportar concurrencia;
- vínculos validados con expediente, cuaderno, actuación, tarea o nota y caso padre derivado;
- bloqueo de escritura en expedientes archivados y cuadernos cerrados;
- listado por contexto, detalle, edición con `version`, archivo lógico y descarga de versión;
- respuesta pública sin `storageKey` ni path absoluto;
- descarga con `Content-Disposition`, `nosniff`, tamaño y digest;
- estado de scan: sólo `CLEAN` o `SKIPPED` pueden descargarse;
- worker independiente para `DOCUMENT_SCAN_REQUESTED`, claim con `FOR UPDATE SKIP LOCKED`, reintentos y estado terminal;
- adapter ClamAV ejecutado sin shell y sin interpolar nombres controlados por usuario;
- cleanup al arrancar de temporales con más de 24 horas.

No se agregó migración: documentos, versiones, checks, índices, estados de scan y outbox ya estaban presentes en la migración inicial.

## Frontend

- pestaña **Documentos** dentro del detalle del expediente;
- listado real de documentos y todas sus versiones;
- upload PDF con progreso real mediante `XMLHttpRequest` y cookies/CSRF;
- destino en expediente principal o actuación existente;
- nueva versión sin reemplazar ni ocultar las anteriores;
- descarga autenticada mediante blob local;
- estados visibles de análisis y descarga deshabilitada para estados no seguros;
- estados vacío, carga y error;
- permisos y estado archivado controlan las acciones disponibles.

El checklist React se aplicó al nuevo componente: consultas independientes en paralelo, efecto cancelable con `AbortController`, componentes de diálogo fuera del render principal y estado derivado sin efectos redundantes.

## Pruebas automáticas

### Backend

```text
Unitarios/API: 5 archivos, 18 tests aprobados
Integración PostgreSQL/storage: 7 archivos, 41 tests aprobados
ESLint, TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

Los siete casos nuevos cubren PDF real y checksum, vínculo a actuación, ausencia de paths públicos, descarga byte a byte, versiones concurrentes, MIME/magic/cifrado, acceso al recurso relacionado, estados de scan, límite durante streaming, archivo físico ausente, optimistic locking, archivo lógico sin purga y worker/reintentos sin doble claim.

### Frontend

```text
Unitarios/componentes: 7 archivos, 10 tests aprobados
E2E Chromium: 7 tests aprobados
TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

El E2E nuevo recorre upload asociado a una actuación, creación de segunda versión y descarga. El build mantiene un warning no bloqueante del chunk principal, ahora de aproximadamente 628 kB.

## Prueba manual local

### 1. Configurar storage sin antivirus local

En `.env`:

```dotenv
STORAGE_ROOT=/Users/dev0/koi/clients/estudio-guzman/backend/storage
MAX_FILE_SIZE_MB=50
MALWARE_SCAN_MODE=skip
```

Con `skip`, la UI muestra **Sin scanner local** y permite descargar. No usar este modo en producción.

### 2. Levantar la fase

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-8
npm run db:deploy
npm run seed
npm run dev
```

En otra terminal:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-8
npm run dev
```

### 3. Flujo funcional

1. Iniciar sesión con permisos de documentos y abrir un juicio activo con una actuación.
2. Entrar en **Documentos → Subir PDF**.
3. Elegir un PDF menor a 50 MB, asociarlo a la actuación y comprobar el progreso.
4. Confirmar título, categoría, tamaño, checksum abreviado y estado **Sin scanner local**.
5. Descargar la versión y comparar visualmente el archivo.
6. Crear una segunda versión; ambas deben seguir visibles y descargables.
7. Intentar subir `.txt`, un archivo renombrado a `.pdf`, un PDF truncado y uno cifrado: deben rechazarse.
8. Archivar el expediente y comprobar que desaparecen los botones de upload/versionado.
9. Verificar que ningún response contiene `storageKey` ni un path local.

### 4. Prueba rápida por API

```bash
curl -i -X POST http://localhost:3001/api/v1/documents \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  -F 'title=Demanda firmada' \
  -F 'category=PLEADING' \
  -F 'actionId=ACTION_UUID' \
  -F 'file=@/ruta/absoluta/demanda.pdf;type=application/pdf'

curl -L 'http://localhost:3001/api/v1/documents/DOCUMENT_UUID/download' \
  -H 'Cookie: eg_session=COOKIE' \
  --output descarga.pdf
```

Nueva versión:

```bash
curl -i -X POST http://localhost:3001/api/v1/documents/DOCUMENT_UUID/versions \
  -H 'Origin: http://localhost:3000' \
  -H 'Cookie: eg_session=COOKIE' \
  -H 'x-csrf-token: CSRF' \
  -F 'file=@/ruta/absoluta/demanda-v2.pdf;type=application/pdf'
```

### 5. Producción con ClamAV

La API y el worker deben compartir `STORAGE_ROOT`. Instalar/configurar `clamd` y su cliente, luego usar:

```dotenv
MALWARE_SCAN_MODE=clamav
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=120000
```

Ejecutar como proceso separado:

```bash
npm run start:worker
```

Mientras una versión esté `PENDING`, la descarga responde `409`. `INFECTED` responde `403` y `FAILED`, `503`.

### 6. Repetir gates

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

Fase 9 incorpora tareas, asignaciones, transiciones, comentarios y notas internas conectadas a sus contextos reales.
