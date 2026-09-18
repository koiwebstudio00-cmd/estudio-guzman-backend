# Flujo de trabajo por fases

Este repositorio usa ramas acumulativas para desarrollar rápido, conservar puntos de prueba independientes y mantener `main` estable.

## Ramas principales

- `main`: versión estable aprobada. No se desarrolla directamente aquí.
- `dev`: integración de fases aprobadas o baseline vigente.
- `fase-N`: snapshot acumulativo al terminar una fase.

Las ramas de fase se apilan. Por ejemplo:

```text
main ── dev ── fase-2 ── fase-3 ── fase-4
```

`fase-3` contiene las fases 2 y 3; `fase-4` contiene todo hasta la fase 4. Para probar un corte anterior basta con cambiar a su rama y reconstruir una base local descartable.

## Desarrollo de una fase

1. Crear la rama desde la fase anterior. La primera pendiente parte de `dev`:

   ```bash
   git switch dev
   git switch -c fase-2
   ```

2. Implementar el alcance completo de la fase sin mezclar trabajo de la fase siguiente.
3. Crear `docs/phases/PHASE_02.md` con:
   - objetivo y alcance;
   - cambios de código, API, datos e infraestructura;
   - migraciones y variables nuevas;
   - resultados reales de los tests;
   - comandos y casos de prueba manual;
   - limitaciones o pendientes conocidos.
4. Ejecutar como mínimo:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   npm run audit:runtime
   ```

5. Ejecutar además las pruebas de migración/integración que correspondan a la fase.
6. Si algo falla, corregir y repetir la batería. No se crea el commit final con checks pendientes.
7. Con todo aprobado automáticamente, crear un único commit descriptivo de la fase.
8. Crear la fase siguiente desde ese commit:

   ```bash
   git switch -c fase-3
   ```

No se hace merge automático a `dev` ni `main`. El desarrollador primero prueba manualmente cada snapshot y comunica su aprobación.

## Prueba manual de una fase

```bash
git switch fase-2
npm install
npm run db:generate
```

Para evitar que una migración posterior contamine una rama anterior, usar una base descartable y vacía. Nunca ejecutar estos comandos sobre una base con información que deba conservarse:

```bash
dropdb --if-exists estudio_guzman_phase_test
createdb estudio_guzman_phase_test
```

Configurar temporalmente en `.env`:

```dotenv
DATABASE_URL=postgresql://localhost:5432/estudio_guzman_phase_test?schema=public
DATABASE_URL_MIGRATE=postgresql://localhost:5432/estudio_guzman_phase_test?schema=public
```

Después seguir los comandos específicos de `docs/phases/PHASE_XX.md`. La rama más nueva representa la prueba integrada de todas las fases acumuladas.

## Promoción después de la aprobación manual

Las fases se integran a `dev` en orden y sin commits de merge cuando el historial lo permite:

```bash
git switch dev
git merge --ff-only fase-2
git merge --ff-only fase-3
```

`main` se actualiza sólo cuando el conjunto que se desea publicar fue validado y aprobado expresamente.

## Responsabilidades

El agente:

- implementa, documenta, prueba y commitea cada fase;
- informa hash del commit, tests ejecutados y guía manual;
- conserva cambios no relacionados y no publica ni fusiona sin autorización.

El desarrollador:

- mantiene PostgreSQL local disponible;
- prueba las ramas entregadas y reporta resultados;
- aprueba correcciones, integración a `dev`, publicación remota y promoción a `main`.
