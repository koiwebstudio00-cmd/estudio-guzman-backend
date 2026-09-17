# Fase 0 — Decisiones funcionales y baseline

Estado: **aprobada y cerrada**

Fecha de apertura: 2026-09-17

Fecha de aprobación: 2026-09-17

Próxima fase: PostgreSQL y migración inicial reproducible

## Propósito

Convertir supuestos del MVP en reglas explícitas antes de crear la primera migración. Las propuestas priorizan trazabilidad, recuperación y el menor riesgo de pérdida de información jurídica.

## Estados de decisión

| Estado | Significado |
|---|---|
| Confirmado | surge directamente del alcance ya aprobado o la arquitectura elegida |
| Inferido | existe en el frontend actual, pero requiere confirmación del estudio |
| Propuesto | recomendación para poder avanzar; todavía puede cambiar |
| Diferido | se decide en una iteración posterior sin bloquear la migración inicial |

## Registro de decisiones

| ID | Tema | Decisión/base propuesta | Estado | ¿Bloquea migración? |
|---|---|---|---|---|
| D-001 | Tenancy | una única instalación para Estudio Guzmán; sin `tenantId` ni RLS multi-tenant | Confirmado | no |
| D-002 | Roles iniciales | Jefe, Socia, Abogada y Secretaria | Confirmado | sí |
| D-003 | Autorización | RBAC con permisos atómicos; el servicio además valida acceso al recurso | Confirmado | no |
| D-004 | Número de expediente | normalizado y único entre expedientes no eliminados dentro del mismo juzgado; sin juzgado se evita duplicado global provisional | Confirmado | sí |
| D-005 | Partes | múltiples participantes y representantes; no conservar el límite actor/demandado del MVP | Confirmado | no |
| D-006 | Estados de expediente | `PENDING`, `ACTIVE`, `SUSPENDED`, `CLOSED`, `ARCHIVED` con transiciones controladas | Confirmado | sí |
| D-007 | Estados de cuaderno | `ACTIVE`, `RESOLVED`, `CLOSED` con reapertura auditada | Confirmado | sí |
| D-008 | Estados de tarea | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`; reapertura y cancelación con motivo | Confirmado | sí |
| D-009 | Eliminación | sin hard delete desde la API para información jurídica; baja lógica o archivo, siempre auditado | Confirmado | sí |
| D-010 | Notas | append-only para usuarios normales; corrección mediante nueva nota; ocultado sólo administrativo | Confirmado | no |
| D-011 | Comentarios | autor puede editar mientras la tarea está abierta; administradores pueden ocultar, nunca borrar físicamente | Confirmado | no |
| D-012 | Documentos MVP | PDF únicamente, máximo 50 MB, versiones inmutables y sin borrado físico automático | Confirmado | sí |
| D-013 | Recuperación | token de un solo uso; email será adapter; sin proveedor, entrega administrativa fuera de logs | Confirmado | no |
| D-014 | Backups | RPO objetivo 24 h, RTO objetivo 4 h, copia cifrada fuera del VPS y restauración trimestral | Confirmado | no |
| D-015 | Datos mock | no migrarlos a producción; sirven sólo como fixtures sintéticas y seudonimizadas | Confirmado | no |
| D-016 | Administrador inicial | comando bootstrap interactivo/por secreto efímero; nunca password por defecto o dentro del seed | Confirmado | no |
| D-017 | Fechas | fechas jurídicas sin hora en `date`; eventos/auditoría en UTC `timestamptz` | Confirmado | no |
| D-018 | Email de usuario | único después de trim + lowercase; conservar el valor visible por separado si fuera necesario | Confirmado | sí |
| D-019 | DNI/CUIT | únicos cuando estén informados y normalizados; permitir ausencia | Confirmado | sí |
| D-020 | Responsable de expediente | máximo un responsable `PRIMARY` vigente; puede quedar sin responsable durante alta/importación controlada | Confirmado | sí |

## Evidencia encontrada en el frontend

- Roles actuales: Jefe, Socia, Abogada y Secretaria.
- Fueros actuales: Laboral, Civil y Comercial, Penal y Familia.
- Expedientes actuales: Pendiente, Activo, Cerrado y Archivado.
- El backend agrega `SUSPENDED` para interrupciones temporales sin confundirlas con cierre.
- El frontend modela un único cliente y una única contraparte; la documentación ya reconoce que esto es insuficiente.
- Tareas actuales: Pendiente, En progreso y Completada; el backend agrega Cancelada.
- Cuadernos actuales: Activo, Resuelto y Cerrado.
- Las notas sólo se crean; no existe edición ni eliminación en el MVP.
- `hasFile` simula PDFs, por lo que no existe política real de MIME, versión o retención.
- Los mocks contienen nombres ficticios/de demostración y no constituyen un dataset productivo confiable.

## Roles procesales iniciales

El catálogo inicial propuesto es:

- `CLIENT`: cliente representado cuando no alcanza un rol procesal específico;
- `CLAIMANT`: actor/demandante;
- `DEFENDANT`: demandado;
- `THIRD_PARTY`: tercero;
- `COMPLAINANT`: denunciante/querellante según uso validado;
- `ACCUSED`: imputado/acusado;
- `VICTIM`: víctima;
- `EXPERT`: perito;
- `WITNESS`: testigo;
- `OTHER`: excepción con `label` obligatorio.

Cada participante tiene además un lado: `OUR_SIDE`, `COUNTERPART` o `NEUTRAL`, y `isClient` identifica a quién representa el estudio. Un contacto puede aparecer más de una vez sólo con roles diferentes.

Las representaciones se modelan aparte mediante `ATTORNEY`, `LEGAL_REPRESENTATIVE`, `POWER_OF_ATTORNEY` u `OTHER`, con vigencia y representante principal opcional.

## Número de expediente

### Normalización propuesta

1. trim;
2. uppercase;
3. eliminar espacios internos irrelevantes;
4. normalizar separadores equivalentes;
5. conservar el valor original para mostrar.

### Unicidad propuesta

- con juzgado: `(courtId, caseNumberNormalized)` único entre registros vigentes;
- sin juzgado: `caseNumberNormalized` único entre expedientes sin juzgado y vigentes;
- un expediente eliminado lógicamente no bloquea para siempre la corrección de un alta errónea;
- el backend responde `409 CONFLICT` y nunca fusiona expedientes automáticamente.

Esta decisión necesita validación porque distintas jurisdicciones pueden reutilizar numeración. Si el número incluye un identificador judicial universal, podría simplificarse a unicidad global.

## Borrado y corrección

| Entidad | Política propuesta |
|---|---|
| Usuario | suspender/desactivar; no borrar si tuvo actividad |
| Rol/permiso del sistema | no borrar; sólo roles custom pueden desactivarse en una fase futura |
| Contacto | baja lógica; conservar relaciones históricas |
| Expediente | archivar; baja lógica sólo para alta errónea y con permiso especial |
| Parte/representación | cerrar vigencia, no destruir historia |
| Cuaderno | cerrar; baja lógica sólo si fue creado por error |
| Actuación | baja lógica con motivo y auditoría |
| Documento | archivar metadata; versiones físicas sujetas a retención aprobada |
| Tarea | cancelar o baja lógica; conservar historial |
| Nota/comentario | ocultado lógico; contenido previo visible sólo en auditoría autorizada |
| Audit log | append-only; sin endpoint de eliminación |
| Outbox | housekeeping por antigüedad después de política operativa |

## Datos iniciales

### Producción

Se cargan únicamente:

- permisos y roles aprobados;
- catálogos estables aprobados;
- primer administrador mediante bootstrap seguro;
- juzgados/oficinas proporcionados y revisados por el estudio.

No se cargan usuarios, contactos, expedientes, notas, tareas ni documentos desde `mockData.ts`.

### Desarrollo y tests

- fixtures enteramente sintéticas;
- emails reservados (`example.com`);
- DNI/CUIT obviamente ficticios y válidos sólo si el test requiere formato;
- documentos generados sin información jurídica real;
- una factory por agregado, sin depender del seed productivo.

## Decisiones diferidas que no bloquean la primera migración

- proveedor SMTP/email definitivo;
- antivirus elegido para VPS;
- delegación de downloads con Nginx `X-Accel-Redirect`;
- tipos Office/imágenes adicionales;
- roles personalizados creados por usuarios;
- segundo factor de autenticación;
- integración con sistemas judiciales externos;
- política final de purga física después del plazo legal.

## Entregables de la fase

- [x] registro de decisiones y evidencia del MVP;
- [x] propuesta de roles procesales y unicidad;
- [x] matriz RBAC versionada;
- [x] catálogo de transiciones;
- [x] política de datos, archivos y recuperación;
- [x] ejemplos convertibles en tests;
- [x] aprobación de decisiones bloqueantes;
- [x] reflejar ajustes aprobados en schema, seed y contrato API;

## Cierre

El baseline fue aprobado el 2026-09-17. Los proveedores concretos de email, antivirus y backup externo siguen diferidos, pero no modifican el modelo inicial ni bloquean la Iteración 1.
