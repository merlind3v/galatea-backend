# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:dev        # run with watch mode (most common during development)
npm run build             # nest build
npm run lint               # eslint --fix over src/apps/libs/test
npm run test                # unit tests (jest, rootDir=src, matches *.spec.ts)
npx jest <name>            # run a single test file/pattern, e.g. npx jest app.controller
npm run test:e2e          # e2e tests (test/jest-e2e.json)
```

Env vars are validated with Joi in `src/app.module.ts` and loaded from `.env.${NODE_ENV}` (`.env.development`, `.env.production`, `.env.test`). `.env.example` documents every key; keep it in sync when adding new Notion database IDs.

## Architecture

This is the backend for "Galatea", a personal productivity system: Notion holds all data, this NestJS service is the Telegram bot that reads/writes it, and a separate n8n workflow (outside this repo) handles scheduling/orchestration. `galatea-backend` is a distinct project from `galatea-scheduler` — do not assume state from one applies to the other.

### Telegram module (`src/telegram/`)

- `TelegramUpdate` handles inbound Telegram updates via `nestjs-telegraf` decorators (`@Start`, `@Command`, `@Action`) — this is separate from NestJS's HTTP `@Controller` layer, which doesn't exist yet in this module.
- Callback buttons use **namespaced `callback_data`**: `"<flujo>:<valor>"` (e.g. `planificacion:<tipoDiaId>`, `confirmacion:confirmar`). Each flow gets its own `@Action(/^flujo:/)` handler instead of one generic `@On('callback_query')` — this is intentional so adding a new flow doesn't require touching existing ones. `handleSelectableCallback` is the shared helper that parses the value, edits the message with a ✅, and returns the extracted value to the caller.
- `TelegramService` builds the outbound messages/keyboards and depends on `NotionService` to populate them dynamically (day types, activity templates) rather than hardcoding options.

### Notion module (`src/notion/`)

- Uses the official `@notionhq/client` SDK, but on the **new Notion API version** that splits "databases" from "data sources" — there is no `databases.query` anymore. `NotionService.getDataSourceId()` resolves a `database_id` (from env) to its `data_source_id` via `databases.retrieve()`, and every query goes through `dataSources.query`.
- `NOTION_CLIENT` (the DI token for the raw `Client` instance) lives in its own file (`notion.constants.ts`), not in `notion.module.ts` — putting it in the module file caused a circular import (`module → service → module`) that left the token `undefined` at decoration time. Keep the token there.
- **DTO pattern per Notion entity**: `dto/input/<entidad>.input.dto.ts` describes the minimal raw page shape a mapper needs (decouples the rest of the app from the full `PageObjectResponse` SDK type), `dto/output/<entidad>.output.dto.ts` is the clean shape consumers use, and a private `toXxxDto()` method on `NotionService` converts between them. Follow this for any new Notion entity instead of consuming raw SDK types elsewhere.
- Notion property names are case-sensitive in filters and have repeatedly not matched guesses (e.g. `Tipo_Dia` not `tipo_dia`, `NOTION_DB_TIPO_ACTIVIDAD` singular not plural). Never guess a property/database name — confirm it against the actual Notion table before writing a filter.
- A newly created Notion database is **not** automatically visible to the integration — it must be explicitly shared via Notion's page "Connections" menu, or every request fails with `object_not_found`.

### Activity name resolution (the core business logic)

`getPlantillasActividades(tipoDiaId)` returns the schedule for a chosen day type, sorted by `horaInicio`. Each activity's displayed `nombre` isn't just the Plantillas_Actividades title — it's resolved dynamically in `resolverNombreActividad` based on the activity's `Tipo_Actividad` relation(s):

- `PREPARAR_DESAYUNO` / `PREPARAR_ALMUERZO` / `PREPARAR_CENA` → looks up today's dish in `Menu_Semana` (one row per weekday, fixed weekly menu) via `CONFIG_MENU_POR_TIPO_ACTIVIDAD`, prefixed with `"preparar: "`.
- `LIMPIEZA_MANTENIMIENTO` → same `Menu_Semana` row, `Limpieza` column, no prefix.
- `OFICINA` / `TALLER` → pulls eligible Tareas for that `Contexto` (via `CONTEXTO_POR_TIPO_ACTIVIDAD`) and lays them out as a mini-schedule inside the block (`PlantillaActividadOutputDto.tareas`), starting at the block's own `horaInicio`, stacking each task's `Tiempo_Estimado`, and capped at the block's real `horaFin` (`formatearTareasConHorario` — tasks that don't fit before the block ends are silently left for another day, not overflowed past midnight).

A task is "eligible" (`tareasElegibles`) if its `Estado` isn't `Completado` **and** every task in its `Depende_De` self-relation is resolvable today — either already `Completado`, or itself eligible and scheduled earlier in the same block (`puedeHacerseHoy` recurses through the chain; `ordenarPorDependencias` does a DFS topological sort so a dependency's row always lands before its dependent's). A task blocked on something outside today's eligible set is excluded entirely.

If an activity matches none of the `Tipo_Actividad` values above, its original Plantillas_Actividades name is used unchanged — this is a silent fallback by design, not a bug, so a wrong assumption about Notion property names shows up as "generic name instead of resolved content", not a thrown error.

### Writing back to Notion: Agenda and Bitácora

Validating a day (`Validar` button → `onValidacion`) doesn't just confirm — it materializes the resolved schedule into two more Notion databases that the user (not this app) created and whose schema was learned empirically per-table, not assumed:

- **`crearAgenda`**: writes one row per activity into `Agenda`. If an activity has `tareas` (an Oficina/Taller block), it's exploded into **one Agenda row per task** with that task's own start/end, instead of one row for the whole block — so downstream scheduling/reporting operates at the real granularity of what actually happens. Returns the created rows (with their real Notion page IDs) as `AgendaOutputDto[]`, which is what the scheduler consumes.
- **`registrarEventoBitacora`**: append-only — every state change (start confirmed, extended, completed) is a **new** Bitácora row, never an update to a previous one, so the full history survives for later analysis. Takes an optional `desvioMin` (signed minutes vs. the planned time; negative = finished early, positive = ran over/needed extension).
- **`getAgendaDeHoy`**: re-reads today's Agenda from Notion (filtered by `Fecha_Calendario`) — used by `/restartjob` to recover scheduler state without restarting the process, since nothing about "today's plan" lives only in memory.

Gotcha seen repeatedly while wiring these two tables: which property is the **title** vs. a plain **rich_text** column is not consistent across tables and cannot be assumed from the property's name — `Agenda` has `Fecha` as title and `Nombre` as rich_text (the opposite of what you'd guess), `Bitácora` the same. Always confirm per-table before writing `pages.create`.

### Scheduler module (`src/scheduler/`) — sequential handoff, not independent timers

`SchedulerService` runs the actual day: after validation, it does **not** schedule every Agenda row at its own fixed clock time. Only the first (chronologically) item gets an absolute timer (`arrancarPrimeraDeLaCola`, via `@nestjs/schedule`'s `SchedulerRegistry.addTimeout`); every subsequent item is a plain in-memory queue (`colaDelDia`) that only starts once the previous one is resolved. This is intentional: if an activity runs long, everything after it should slide later; if it finishes early, the next one should start immediately rather than idle until its "planned" time.

Per-activity lifecycle:
1. **Inicio**: at the scheduled time, sends "¿Arrancaste con: X?" (`inicioconfirm:<agendaId>`) — does **not** touch Bitácora yet, because arriving doesn't mean the user saw or started it. If unconfirmed, the same message is re-sent every `RETRY_INTERVAL_MIN` minutes (`programarRecordatorio`) until confirmed.
2. Confirming (`confirmarInicio`) writes the `'En Progreso'` Bitácora event and schedules the **fin** checkpoint at the activity's `horaFin`.
3. **Fin checkpoint**: sends "✅ Completado" / "⏱ Extender" (two-step: choosing Extender edits the message into a 15m/30m/1h submenu, `finextender:<agendaId>:<min>`). Completado logs `'Completado'` with the real deviation and immediately pulls the next item off `colaDelDia` (`arrancarSiguienteInmediato` — no delay). Extender reschedules the same checkpoint further out and logs an `'En Progreso'` event noting the extension; the queue does not advance.
4. **`/listo`** command: an escape hatch to mark the currently in-progress activity done from anywhere, without waiting for its checkpoint to fire — this is how "finished early" pulls the rest of the day backward.

State (`colaDelDia`, `proximaProgramada`, `pendienteInicio`, `pendienteFin`) lives **only in memory** — a process restart loses it. `programarJornada`/`reiniciarJornada` always start by discarding any Agenda item whose `horaInicio` has already passed (`descartarVencidas`, logged as a warning) rather than firing it immediately; this is deliberate so that `/restartjob` after a crash picks up from "now" instead of replaying the whole missed day. `/jobs` reports the full pipeline state (`activo` = timer running waiting for its clock time, `esperando que confirmes el inicio`, `en progreso`, `en cola`).

`TelegramModule` and `SchedulerModule` import each other (Telegram triggers scheduling after validation; the scheduler sends Telegram messages when jobs fire) — both `@Module()` declarations use `forwardRef()` to resolve this. This was verified by actually booting the app (`nest start`), not just `tsc`, since circular-module wiring mistakes only surface at runtime.

### Not yet built

`ApiKeyGuard` (`src/common/guards/`) validates `x-api-key` against `WEBHOOK_SECRET` but isn't wired to any route — there are no HTTP controllers in this repo yet. It exists for a future webhook endpoint that an external system (n8n) would call into this service.
