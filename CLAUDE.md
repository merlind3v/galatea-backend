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
- `OFICINA` / `TALLER` → pulls eligible Tareas for that `Contexto` (via `CONTEXTO_POR_TIPO_ACTIVIDAD`) and lays them out as a mini-schedule inside the block, starting at the block's own `horaInicio` and stacking each task's `Tiempo_Estimado`.

A task is "eligible" (`tareasElegibles`) if its `Estado` isn't `Completado` and everything in its `Depende_De` self-relation is already `Completado` — this models real task dependencies (can't do task B before task A it depends on).

If an activity matches none of these `Tipo_Actividad` values, its original Plantillas_Actividades name is used unchanged — this is a silent fallback by design, not a bug, so a wrong assumption about Notion property names shows up as "generic name instead of resolved content", not a thrown error.

### Not yet built

`ApiKeyGuard` (`src/common/guards/`) validates `x-api-key` against `WEBHOOK_SECRET` but isn't wired to any route — there are no HTTP controllers in this repo yet. It exists for a future webhook endpoint that an external system (n8n) would call into this service.
