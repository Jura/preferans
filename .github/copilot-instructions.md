# Copilot Instructions for Preferans

## Project Overview
- This repository contains an online Preferans game.
- Frontend: SvelteKit 2 with Svelte 5 (runes mode) in `src/`.
- Backend/game engine: Cloudflare Worker and Durable Objects in `worker/src/`.
- Database: Cloudflare D1 (SQLite) with migrations in `worker/migrations/`.

## Tech and Style Expectations
- Use TypeScript for all new logic unless a file is explicitly JavaScript/Svelte-only.
- Keep changes minimal and focused; avoid unrelated refactors.
- Reuse existing types from `src/lib/types/preferans.ts` where possible.
- Preserve existing naming and architecture patterns in routes, stores, and components.

## Frontend Guidelines (SvelteKit)
- Follow existing Svelte 5 runes patterns used in the codebase.
- Prefer strongly typed props and state.
- Keep UI components in `src/lib/components/` small and composable.
- Put client state/websocket interactions in stores under `src/lib/stores/`.
- Avoid introducing new dependencies unless necessary.

## Worker and Game Engine Guidelines
- Keep game rule logic centralized in `worker/src/gameEngine.ts`.
- Keep room/session and websocket behavior in `worker/src/durable-objects/GameRoom.ts`.
- Keep REST and routing concerns in `worker/src/index.ts`.
- Do not duplicate game rule constants across files.

## Data and Migrations
- Any schema change must include a new migration file in `worker/migrations/`.
- Keep SQL migrations forward-only and idempotent when possible.

## Validation Before Finishing
When making code changes, run relevant checks:
- `npm run check`
- `npm run lint`
- For worker changes, run `npm run worker:dev` when relevant.

## Deployment Context
- Frontend deploy target: Cloudflare Pages.
- Worker deploy command: `npm run worker:deploy`.
- D1 migration commands:
  - Local: `npm run db:migrate:local`
  - Production: `npm run db:migrate`

## What to Avoid
- Do not commit secrets or sample real credentials.
- Do not move business logic into UI components.
- Do not rewrite large sections when a targeted fix is enough.
