# Fase 6 — Expedientes, partes y equipo

Estado: **completada**

Fecha: 2026-09-19

Ramas locales: `fase-6` en backend y frontend, creadas desde los commits finales de `fase-5`. Sin push ni merge.

## Resultado

Los juicios dejaron de depender del store mock. La aplicación permite crear un expediente completo en una sola transacción, listarlo con filtros/paginación, consultar su cabecera, partes, representaciones, equipo, resumen e historial, editarlo con optimistic locking y cambiar su estado sólo mediante transiciones autorizadas.

## Backend

- módulo `cases` con rutas, Zod, servicio, repositorio, mapper y cursor;
- alta atómica de expediente + partes múltiples + representaciones + equipo + historial + auditoría + outbox;
- regla de número único por juzgado, o global cuando no hay juzgado, respaldada por índices parciales existentes;
- una o más partes cliente y exactamente un responsable principal activo;
- radicación validada: juzgado/oficina activos y relación consistente;
- listado con búsqueda, estado, fuero, responsable, juzgado, fechas y cursor estable;
- edición con `version`, DTO seguro y bloqueo de edición normal al archivar;
- transiciones explícitas, motivos obligatorios, permisos administrativos para archivo/reapertura y fechas derivadas en servidor;
- cierre con tareas abiertas exige estrategia explícita `KEEP`;
- historial append-only, resumen de relaciones y timeline base de cambios de estado;
- gestión anidada de partes, representaciones y equipo;
- baja lógica sólo para altas erróneas sin actividad relacionada;
- `GET /contacts/:contactId/cases` implementado;
- restricciones limitadas de `cases.assign`: un usuario no administrativo sólo se asigna a sí mismo según las reglas documentadas.

No se agregó migración: las tablas, constraints e índices parciales ya estaban en la migración inicial.

## Frontend

- listado de juicios conectado a `GET /cases`, con búsqueda, filtros y cursor;
- alta real con múltiples partes mediante `ContactSelector`, radicación y responsable principal;
- detalle real con cabecera, partes, representaciones, equipo, conteos e historial;
- edición de número/carátula con versión;
- diálogo de transiciones de estado;
- permisos efectivos controlan alta, edición y cambio de estado;
- se eliminaron de estas tres pantallas las lecturas de `cases`, contactos, usuarios, juzgados y oficinas del store mock.

## Pruebas automáticas

### Backend

```text
Unitarios/API: 5 archivos, 17 tests aprobados
Integración PostgreSQL: 5 archivos, 29 tests aprobados
ESLint, TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

Los seis casos nuevos cubren autenticación, rollback por referencias inválidas, responsable único, unicidad del número, transición prohibida, motivo requerido, historial, optimistic locking, búsqueda/filtros/cursor, asignación limitada, cliente mínimo y baja con actividad.

### Frontend

```text
Unitarios/componentes: 7 archivos, 10 tests aprobados
E2E Chromium: 5 tests aprobados
TypeScript y build: correctos
Auditoría runtime: 0 vulnerabilidades
```

El checklist React se aplicó nuevamente: carga paralela de recursos independientes, efectos cancelables, estado derivado sin efectos y componentes de formularios fuera del render principal. El warning no bloqueante del chunk principal bajó a aproximadamente 597 kB.

## Prueba manual

### 1. Levantar la fase

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
git switch fase-6
npm run db:deploy
npm run seed
npm run dev
```

En otra terminal:

```bash
cd /Users/dev0/koi/clients/estudio-guzman/front
git switch fase-6
npm run dev
```

### 2. Flujo funcional

1. Crear al menos dos contactos en **Contactos**.
2. Abrir **Juicios → Nuevo juicio**.
3. Completar carátula/número, seleccionar dos partes, marcar al menos una como cliente y elegir responsable.
4. Si se eligen juzgado y oficina, comprobar que la oficina pertenece al juzgado.
5. Guardar y verificar el detalle, las partes, el responsable y el historial de alta.
6. Editar número/carátula y confirmar incremento de versión.
7. Cambiar `ACTIVE → SUSPENDED`: sin motivo debe fallar; con motivo debe quedar en historial.
8. Intentar `ACTIVE → ARCHIVED`: debe responder `409`.
9. Cerrar una causa con tareas abiertas sin estrategia mediante API: debe responder `409`.
10. Con rol Abogada, intentar asignar a otra persona como responsable principal: debe responder `403`.

### 3. Prueba rápida por API

```bash
curl -i 'http://localhost:3001/api/v1/cases?status=ACTIVE&limit=10' \\
  -H 'Cookie: eg_session=COOKIE'

curl -i -X POST http://localhost:3001/api/v1/cases/UUID/status-transitions \\
  -H 'Origin: http://localhost:3000' \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: eg_session=COOKIE' \\
  -H 'x-csrf-token: CSRF' \\
  --data '{"version":1,"toStatus":"SUSPENDED","reason":"Medida judicial"}'
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

Fase 7 incorpora cuadernos/incidentes, actuaciones y el timeline unificado del expediente.
