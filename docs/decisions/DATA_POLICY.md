# Política inicial de datos, archivos y recuperación

Estado: **aprobada — baseline MVP**

Esta política es una base técnica para el MVP. Los plazos legales definitivos deben validarse con el estudio antes de habilitar purga física automática.

## Clasificación

| Clase | Ejemplos | Tratamiento |
|---|---|---|
| Secreto | passwords, tokens, cookies, credenciales DB/SMTP | nunca logs/DB en claro; secretos fuera del repo |
| Jurídico sensible | expedientes, actuaciones, notas, documentos | acceso autenticado/autorizado, auditoría y backup cifrado |
| Personal | DNI, CUIT, email, teléfono, domicilio, IP | minimizar exposición, no registrar completo en logs |
| Operativo | métricas, estado de jobs, health | puede registrarse sin payload jurídico |
| Público técnico | versión de API, documentación sin datos | acceso según entorno |

## Ambientes

### Desarrollo

- únicamente fixtures sintéticas;
- documentos generados de prueba;
- `.env` local ignorado;
- DB y storage descartables;
- nunca copiar un dump productivo sin anonimización formal.

### Staging

- misma topología que producción;
- datos sintéticos representativos;
- secretos distintos de producción;
- destino de email controlado/sandbox;
- se usa para migraciones, E2E y restauraciones.

### Producción

- acceso limitado por necesidad operativa;
- rol DB runtime sin DDL;
- storage fuera del webroot;
- backups cifrados fuera del VPS;
- no usar datos ficticios mezclados con datos reales.

## Política de archivos MVP

### Formato y tamaño

- aceptar sólo PDF (`application/pdf`) durante el MVP;
- máximo inicial: 50 MB por versión;
- validar bytes/magic number, no confiar en extensión ni `Content-Type` del cliente;
- rechazar archivos cifrados o corruptos si el scanner/parser no puede verificarlos, salvo flujo administrativo explícito futuro;
- imágenes y Office quedan diferidos hasta confirmar una necesidad real.

### Persistencia

- upload por streaming a un archivo temporal;
- calcular SHA-256 mientras se recibe;
- verificar límite durante el stream;
- escanear antes de habilitar descarga;
- mover atómicamente a la clave definitiva;
- persistir metadata y relación transaccionalmente;
- cleanup de temporales/huérfanos mediante worker.

### Nombre y claves

- `originalName` se conserva sólo como metadata saneada para `Content-Disposition`;
- el nombre original nunca forma parte de una ruta confiada;
- clave opaca: `cases/<caseId>/<documentId>/<versionId>`;
- la API jamás devuelve `storageKey` o un path absoluto;
- la descarga exige sesión, `documents.read` y acceso al recurso relacionado.

### Versionado y eliminación

- versiones inmutables y numeradas;
- una nueva carga crea `DocumentVersion`, no reemplaza bytes;
- archivar un documento oculta su uso normal pero conserva metadata/versiones;
- en el MVP no hay purga física automática;
- una política futura definirá plazo legal, legal hold, aprobación y registro de purga;
- malware confirmado se aísla y no se entrega, pero se conserva evidencia/metadata según política de incidente.

## Retención propuesta

| Dato | MVP |
|---|---|
| Usuarios con actividad | conservar; desactivar |
| Expedientes/actuaciones/partes | conservar; archivar/baja lógica excepcional |
| Documentos/versiones | conservar sin purga automática |
| Notas/comentarios | conservar; ocultado lógico |
| Auditoría | conservar completa |
| Sesiones expiradas/revocadas | limpiar después de 90 días |
| Tokens de recuperación usados/expirados | limpiar después de 30 días |
| Notificaciones | conservar 1 año, sujeto a aprobación |
| Outbox procesado | conservar 90 días; fallidos hasta resolución |
| Temporales de upload | eliminar después de 24 horas si no están reclamados |

Los plazos operativos pueden implementarse después; sólo los datos jurídicos bloquean hard delete desde el comienzo.

## Logs y auditoría

### Logs operativos

Se permite registrar:

- request ID;
- método y ruta normalizada;
- status/duración;
- IDs internos necesarios para diagnóstico;
- tipo de error seguro;
- salud de dependencias y métricas.

No se registra:

- password o hash;
- token/cookie/Authorization;
- bodies completos;
- contenido de notas/documentos;
- DNI/CUIT, email o teléfono completos;
- URL/path interno del storage;
- secretos o connection strings.

### Auditoría funcional

- append-only;
- actor, acción, entidad, request ID, fecha y metadata mínima;
- before/after sólo para campos necesarios y sin secretos;
- misma transacción que la mutación;
- lectura restringida a `audit.read`;
- ninguna API permite editar o borrar auditoría.

## Recuperación de contraseña

- respuesta uniforme exista o no el email;
- token CSPRNG, hash SHA-256 en DB, expiración corta y un solo uso;
- enviar link por un adapter de email cuando exista proveedor;
- nunca registrar token/link completo;
- en desarrollo puede capturarse mediante un adapter de testing, no mediante logs normales;
- si producción inicia sin proveedor, sólo un administrador puede generar un flujo de recuperación y entregar el link por canal verificado fuera del sistema;
- reset exitoso revoca todas las sesiones anteriores y escribe auditoría.

No se envían contraseñas temporales en claro.

## Backups y recuperación

### Objetivos propuestos

- RPO: 24 horas;
- RTO: 4 horas;
- retención: 7 diarios, 4 semanales y 12 mensuales;
- restauración de prueba: trimestral;
- destino: fuera del VPS y cifrado antes de enviar.

### Consistencia

PostgreSQL y archivos deben respaldarse como una unidad recuperable. La ejecución registra una marca temporal/manifiesto con checksums. Una restauración valida:

- migraciones y schema;
- conteos principales;
- existencia y SHA-256 de archivos muestreados/totales según volumen;
- login administrativo y descarga autorizada;
- worker/outbox sin duplicar efectos ya procesados.

Guardar una copia sólo en el mismo VPS no cuenta como backup.

## Datos iniciales y migración desde el MVP

`front/src/data/mockData.ts` no se importa en producción. Contiene fixtures útiles para E2E, pero usa IDs ad hoc, relaciones simplificadas y archivos simulados.

Si posteriormente existen datos reales en `localStorage`, se tratarán como una migración separada:

1. exportar y congelar una copia;
2. clasificar real vs demo;
3. validar contactos duplicados e identidad;
4. transformar actor/demandado a participantes;
5. resolver responsables y catálogos;
6. importar en staging con reporte de errores;
7. aprobación humana;
8. importación productiva idempotente y auditada.

No se migran datos del navegador automáticamente al iniciar sesión.

## Incidentes

Ante sospecha de exposición:

1. preservar logs/auditoría y no borrar evidencia;
2. revocar sesiones/secretos afectados;
3. aislar archivo o servicio comprometido;
4. evaluar alcance por request IDs, actor y entidades;
5. restaurar sólo desde backup verificado si corresponde;
6. documentar causa, impacto y corrección;
7. notificar según obligaciones legales/contractuales aplicables.

## Decisiones cerradas y pendientes operativos

- El MVP acepta sólo PDF hasta 50 MB.
- No hay purga física automática de documentos ni información jurídica.
- Se aceptan RPO 24 h y RTO 4 h como objetivos iniciales.
- El destino externo de backups, antivirus y proveedor de email deben elegirse antes del despliegue productivo; no bloquean el modelo ni el desarrollo de módulos.
