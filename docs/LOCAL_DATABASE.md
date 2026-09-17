# Levantar la base de datos local en macOS

La forma más sencilla es usar PostgreSQL 17 instalado con Homebrew. Docker no es obligatorio.

## 1. Verificar PostgreSQL

```bash
brew install postgresql@17
brew services start postgresql@17
psql --version
```

Si ya está instalado, Homebrew informará que no hay nada que actualizar. `psql --version` debe mostrar PostgreSQL 17.

## 2. Crear la base

```bash
createdb estudio_guzman
```

Si informa que la base ya existe, se puede continuar con el siguiente paso.

## 3. Configurar el backend

```bash
cd /Users/dev0/koi/clients/estudio-guzman/backend
cp .env.example .env
```

En `.env`, reemplazar las tres URLs de PostgreSQL por estas:

```dotenv
DATABASE_URL=postgresql://localhost:5432/estudio_guzman?schema=public
DATABASE_URL_MIGRATE=postgresql://localhost:5432/estudio_guzman?schema=public
DATABASE_URL_TEST=postgresql://localhost:5432/estudio_guzman_test?schema=public
```

Esta configuración usa el usuario actual de macOS y es sólo para desarrollo local.

## 4. Preparar el esquema y los datos iniciales

```bash
npm install
npm run db:generate
npm run db:deploy
npm run seed
```

No es necesario ejecutar `npm run db:grant-runtime` con esta configuración simplificada. Ese comando corresponde al esquema de roles separados usado por Docker y producción.

## 5. Crear el primer administrador

Agregar temporalmente al archivo `.env`:

```dotenv
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_NAME=Administrador
BOOTSTRAP_ADMIN_PASSWORD=UnaClaveLocalSegura2026
```

Ejecutar una sola vez:

```bash
npm run bootstrap:admin
```

Después, borrar `BOOTSTRAP_ADMIN_PASSWORD` de `.env`. El comando rechazará nuevas ejecuciones si ya existe un usuario.

## 6. Iniciar y comprobar el backend

```bash
npm run dev
```

En otra terminal:

```bash
curl http://localhost:3001/api/v1/health/live
curl http://localhost:3001/api/v1/health/ready
```

Ambas rutas deben responder correctamente. Por ahora sólo están implementados los endpoints de salud.

## Uso diario

PostgreSQL queda ejecutándose como servicio de macOS.

```bash
brew services list
brew services start postgresql@17
brew services stop postgresql@17
```

Abrir una consola SQL:

```bash
psql estudio_guzman
```

Aplicar migraciones nuevas:

```bash
npm run db:deploy
npm run db:generate
```

## Reiniciar completamente la base local

Sólo si no hay información que se deba conservar:

```bash
dropdb estudio_guzman
createdb estudio_guzman
npm run db:deploy
npm run seed
npm run bootstrap:admin
```

`dropdb` elimina definitivamente toda la base local.

## ¿Para qué queda Docker?

Docker es una alternativa opcional para:

- tener una base descartable y aislada;
- usar exactamente PostgreSQL 17 sin instalarlo en el sistema;
- probar la separación entre el rol migrador y el rol limitado de la aplicación;
- acercar el entorno local al despliegue del VPS.

No hace falta instalar Docker para desarrollar y probar el backend en esta Mac.
