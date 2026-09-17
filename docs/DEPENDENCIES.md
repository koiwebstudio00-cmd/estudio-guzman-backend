# Dependencias, versiones y operación

`package.json` y `package-lock.json` son la fuente de verdad. Las versiones están fijadas exactamente para que desarrollo, CI y build sean reproducibles.

## Runtime y plataforma

| Componente | Versión/base | Uso |
|---|---:|---|
| Node.js | `>=22.20` | runtime ESM de la API/worker |
| PostgreSQL | 17 | base relacional |
| TypeScript output | ES2023 / NodeNext | JavaScript compilado para Node |
| Imagen base | `node:22-bookworm-slim` | build y runtime Docker |

## Dependencias de producción

| Paquete | Versión | Uso y decisión |
|---|---:|---|
| `express` | 5.2.1 | servidor HTTP y routers |
| `@prisma/client` | 7.10.0 | cliente tipado generado |
| `@prisma/adapter-pg` | 7.10.0 | adapter Prisma 7 para PostgreSQL |
| `pg` | 8.23.0 | driver PostgreSQL |
| `zod` | 4.6.5 | validación de entorno y contratos HTTP |
| `argon2` | 0.45.1 | hash Argon2id de contraseñas |
| `cookie-parser` | 1.4.7 | lectura de cookies de sesión/CSRF |
| `cors` | 2.8.6 | allowlist de orígenes y credenciales |
| `helmet` | 8.3.0 | headers de seguridad |
| `express-rate-limit` | 8.7.0 | límites de login, recuperación y uploads |
| `pino` | 10.3.1 | logger JSON estructurado |
| `pino-http` | 11.0.0 | request logger, duración y request ID |
| `dotenv` | 17.4.2 | carga local de `.env` |

### Argon2id en lugar de bcrypt

bcrypt continúa siendo válido cuando está actualizado y configurado correctamente. Para este proyecto nuevo se eligió Argon2id porque permite costo de memoria además de CPU y evita heredar el árbol nativo vulnerable observado en la versión del backend de referencia. La aplicación debe encapsular `hashPassword`/`verifyPassword`; así una migración de algoritmo no afecta los módulos.

El hash almacenado incluye algoritmo y parámetros. Si los parámetros se endurecen, un login correcto puede rehashear la contraseña de manera progresiva.

### Pino en lugar de Morgan

Morgan es adecuado para access logs textuales. Pino HTTP cubre el mismo evento y además provee JSON estructurado, request ID, serializers, niveles y redacción de secretos. Usar ambos duplicaría un log por solicitud. Si un proveedor futuro exige formato Combined/Apache, se puede agregar un destino específico sin reemplazar el logger de aplicación.

## Dependencias de desarrollo

| Paquete | Versión | Uso |
|---|---:|---|
| `typescript` | 5.9.3 | compilador estricto |
| `tsx` | 4.23.13 | desarrollo watch y scripts TS |
| `prisma` | 7.10.0 | format, generate, migrate y deploy |
| `vitest` | 5.0.1 | runner de tests |
| `supertest` | 7.2.2 | pruebas HTTP de Express |
| `eslint` | 10.10.0 | análisis estático |
| `@eslint/js` | 10.0.1 | reglas base ESLint |
| `typescript-eslint` | 8.70.0 | parser y reglas TypeScript |
| `@types/node` | 22.20.3 | tipos de Node 22 |
| `@types/express` | 5.0.6 | tipos Express |
| `@types/cookie-parser` | 1.4.10 | tipos del middleware |
| `@types/cors` | 2.8.19 | tipos CORS |
| `@types/pg` | 8.23.1 | tipos PostgreSQL |
| `@types/supertest` | 7.2.1 | tipos de pruebas HTTP |

No se incorpora una dependencia sólo por conveniencia si Node, Express, Prisma o Zod ya resuelven el caso de forma segura y legible.

## Scripts npm

| Script | Comando/propósito |
|---|---|
| `npm run dev` | API con `tsx watch` |
| `npm run build` | compilar `src/` a `dist/` |
| `npm start` | ejecutar `dist/server.js` |
| `npm run lint` | ESLint sobre el proyecto |
| `npm run typecheck` | TypeScript sin emitir archivos |
| `npm test` | suite Vitest una vez |
| `npm run test:watch` | Vitest interactivo |
| `npm run audit:runtime` | auditar sin dev ni optional |
| `npm run db:format` | formatear schema Prisma |
| `npm run db:validate` | validar schema/config |
| `npm run db:generate` | generar cliente Prisma |
| `npm run db:migrate` | crear/aplicar migración de desarrollo |
| `npm run db:migrate:create` | crear SQL sin aplicar, para revisión |
| `npm run db:deploy` | aplicar migraciones existentes en release |
| `npm run seed` | roles y permisos idempotentes |

## Variables de entorno

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test` o `production` |
| `HOST` | no | `0.0.0.0` | interfaz de escucha |
| `PORT` | no | `3001` | puerto HTTP |
| `LOG_LEVEL` | no | `info` | nivel Pino |
| `TRUST_PROXY` | no | `1` | cantidad de proxies confiables |
| `DATABASE_URL` | sí | — | conexión del rol de runtime |
| `DATABASE_URL_MIGRATE` | release | — | conexión owner/migrador; Prisma CLI la prioriza si existe |
| `DATABASE_URL_TEST` | integración | — | DB descartable exclusiva de tests |
| `CORS_ORIGIN` | producción | vacío | orígenes separados por coma |
| `COOKIE_SECURE` | producción | `false` | debe ser `true` bajo HTTPS |
| `COOKIE_SAMESITE` | no | `lax` | `lax`, `strict` o `none` |
| `COOKIE_DOMAIN` | no | host actual | dominio opcional de cookie |
| `SESSION_TTL_DAYS` | no | `30` | expiración absoluta, 1–90 |
| `SESSION_IDLE_MINUTES` | no | `480` | ventana inactiva, 15–43200 |
| `STORAGE_ROOT` | no | `./storage` | raíz privada; absoluta en producción |
| `MAX_FILE_SIZE_MB` | no | `50` | límite configurable, 1–500 |

La aplicación falla al arrancar si falta `DATABASE_URL`, si producción no define CORS, si las cookies no son seguras o si el storage productivo no es absoluto. `SameSite=None` exige `Secure`.

## Instalación y desarrollo

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:generate
npm run db:validate
npm run dev
```

Antes de integrar un cambio:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run audit:runtime
```

## Dependencias en Docker

El builder instala todo para generar Prisma y compilar. La etapa final ejecuta `npm prune --omit=dev --omit=optional`; por eso no contiene TypeScript, tests, Prisma CLI ni drivers opcionales. Sí contiene el cliente generado, adapter `pg` y dependencias reales de la API.

Las migraciones se ejecutan como job separado con el artefacto de build/release correspondiente. No se agrega el CLI a la API productiva para migrar al arrancar.

## Auditoría y actualizaciones

- `npm run audit:runtime` actualmente informa 0 vulnerabilidades.
- El árbol completo de desarrollo conserva alertas transitivas del CLI de Prisma 7; no forman parte de la imagen productiva.
- No se ejecuta `npm audit fix --force` automáticamente.
- Las actualizaciones mayores requieren changelog, regeneración de Prisma, build, tests e inspección del lockfile.
- Renovar imágenes base y PostgreSQL se trata como cambio operativo con backup y prueba de restauración.
