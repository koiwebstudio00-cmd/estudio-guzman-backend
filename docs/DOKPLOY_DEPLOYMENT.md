# Despliegue del backend con Dokploy

Esta guía despliega desde GitHub una única aplicación Compose con API, worker, PostgreSQL 17, almacenamiento privado y ClamAV. El frontend se publica por separado en Vercel.

## Topología

| Servicio | Exposición | Persistencia |
|---|---|---|
| `api` | HTTPS mediante Dokploy/Traefik, puerto interno `3001` | volumen compartido de documentos |
| `worker` | sólo red interna | volumen compartido de documentos |
| `postgres` | sólo red interna, puerto `5432` | volumen `postgres_data` |
| `clamav` | sólo red interna, puerto `3310` | firmas en `clamav_database` |
| `migrate` | job de cada release; termina con código `0` | ninguna |

PostgreSQL y ClamAV no deben tener dominios ni puertos públicos. El worker transmite cada PDF a ClamAV mediante el protocolo `INSTREAM`; el antivirus no accede al volumen de documentos.

## 1. Preparar GitHub y DNS

1. Subir el backend a un repositorio privado de GitHub cuando la rama esté aprobada.
2. En el DNS de `koistudio.com.ar`, crear un registro `A` para `api-guzman` apuntando a la IP pública del VPS.
3. No crear un proxy Nginx manual: Dokploy administra Traefik y el certificado TLS.

## 2. Crear el Compose en Dokploy

1. Crear o abrir el proyecto de Estudio Guzmán y su ambiente de producción.
2. Crear un servicio de tipo **Docker Compose**.
3. Seleccionar GitHub como proveedor, autorizar el repositorio privado y elegir la rama aprobada.
4. Configurar como ruta de Compose `docker-compose.prod.yml` y como contexto la raíz del repositorio.
5. Habilitar **Isolated Deployments** para que Dokploy conecte el servicio publicado a su red de Traefik sin reemplazar la red interna del Compose.
6. No publicar manualmente `5432`, `3310` ni `3001` en la sección de puertos.

Dokploy toma las variables de su panel, pero Compose sólo las recibe porque `docker-compose.prod.yml` las referencia explícitamente. No subir un archivo `.env` productivo al repositorio.

## 3. Configurar variables

Generar tres secretos distintos y URL-safe. Una opción desde una terminal local es ejecutar tres veces:

```bash
openssl rand -hex 32
```

Guardar en Dokploy:

```dotenv
POSTGRES_DB=estudio_guzman
POSTGRES_PASSWORD=<secreto-administrador-postgres>
MIGRATOR_DB_PASSWORD=<secreto-rol-migraciones>
APP_DB_PASSWORD=<secreto-rol-runtime>

CORS_ORIGIN=https://guzman.koistudio.com.ar
COOKIE_SAMESITE=lax
LOG_LEVEL=info
TRUST_PROXY=1
MAX_FILE_SIZE_MB=50
CLAMAV_TIMEOUT_MS=120000
CLAMAV_STREAM_MAX_LENGTH=64M
WORKER_POLL_INTERVAL_MS=2000
```

`COOKIE_SECURE=true`, `STORAGE_ROOT=/data/storage`, `MALWARE_SCAN_MODE=clamav`, el host y el puerto de ClamAV ya están fijados de forma segura por Compose. No definir `COOKIE_DOMAIN` salvo que exista una necesidad concreta de compartir la cookie con otros hosts.

`CLAMAV_STREAM_MAX_LENGTH` debe ser mayor que `MAX_FILE_SIZE_MB`. Con el límite inicial de 50 MB, 64 MB permite transmitir el PDF completo sin abrir el máximo innecesariamente.

### Primer administrador

Sólo para el primer despliegue agregar:

```dotenv
RUN_BOOTSTRAP_ADMIN=true
BOOTSTRAP_ADMIN_EMAIL=admin@dominio-del-estudio.com
BOOTSTRAP_ADMIN_NAME=Administrador
BOOTSTRAP_ADMIN_PASSWORD=<clave-inicial-de-14-o-mas-caracteres>
```

El job `migrate` aplica migraciones, sincroniza RBAC, refresca privilegios y crea el usuario únicamente si la instalación todavía no tiene usuarios. Después del primer despliegue exitoso:

1. cambiar `RUN_BOOTSTRAP_ADMIN` a `false`;
2. eliminar las tres variables `BOOTSTRAP_ADMIN_*` de Dokploy;
3. desplegar nuevamente para retirar esos valores del entorno del job.

Si el bootstrap vuelve a ejecutarse cuando ya existen usuarios, falla deliberadamente y bloquea ese release.

## 4. Desplegar y publicar la API

1. Ejecutar **Deploy**.
2. Confirmar que `postgres` está healthy, `migrate` terminó con código `0`, y `api`, `worker` y `clamav` permanecen activos. La primera descarga de firmas de ClamAV puede tardar varios minutos; el worker espera su healthcheck.
3. En **Domains** del Compose, agregar:
   - servicio: `api`;
   - dominio: `api-guzman.koistudio.com.ar`;
   - puerto interno: `3001`;
   - HTTPS: habilitado.
4. Esperar la emisión del certificado y comprobar:

```bash
curl https://api-guzman.koistudio.com.ar/api/v1/health/live
curl https://api-guzman.koistudio.com.ar/api/v1/health/ready
```

El primero valida el proceso. El segundo valida PostgreSQL y el volumen de documentos.

## 5. Verificación funcional

Con el frontend ya desplegado:

1. iniciar sesión y confirmar que la cookie `eg_session` es `HttpOnly` y `Secure`;
2. crear y consultar una entidad de prueba sintética;
3. subir un PDF de prueba y esperar a que el worker lo marque como disponible;
4. confirmar en logs que API y worker no muestran URLs de base, cookies ni contenido jurídico;
5. revisar que PostgreSQL y ClamAV no respondan desde Internet.

Para validar el antivirus sin usar malware real puede emplearse el archivo de prueba EICAR únicamente en staging y siguiendo el procedimiento de seguridad del proveedor.

## 6. Backups obligatorios

Configurar backups de los volúmenes nombrados `postgres_data` y `document_storage` hacia un destino cifrado fuera del VPS. La copia de PostgreSQL y la de documentos deben corresponder al mismo punto temporal. `clamav_database` puede reconstruirse descargando nuevamente las firmas y no reemplaza los dos backups anteriores.

Antes de cargar datos reales, ejecutar y documentar una restauración completa siguiendo `docs/BACKUP_RESTORE.md`. El objetivo inicial es RPO de 24 horas y RTO de 4 horas.

## Actualizaciones y rollback

Cada despliegue vuelve a ejecutar el job idempotente `migrate`; la API y el worker sólo arrancan cuando ese job termina correctamente. Antes de migraciones destructivas se requiere backup verificado y estrategia expand/contract.

Para volver al código anterior, seleccionar en Dokploy el commit o deployment previo compatible con el schema ya aplicado. Las migraciones nunca se revierten editando archivos aplicados ni ejecutando `migrate reset` en producción.
