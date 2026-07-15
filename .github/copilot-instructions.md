# Copilot Instructions for Preferans

## Project Overview
- This repository contains an online Preferans game.
- Frontend: SvelteKit 2 with Svelte 5 (runes mode) in `src/`.
- Primary deployment target: Cloudflare Pages (configured in root `wrangler.toml`).
- Realtime/game engine modules: Cloudflare Worker and Durable Objects in `worker/src/`.
- Database: Cloudflare D1 (SQLite) with migrations in `worker/migrations/`.

## Tech and Style Expectations
- Use TypeScript for all new logic unless a file is explicitly JavaScript/Svelte-only.
- Keep changes minimal and focused; avoid unrelated refactors.
- Reuse existing types from `src/lib/types/preferans.ts` where possible.
- Preserve existing naming and architecture patterns in routes, stores, and components.

## Documentation
- README should be revised and updated when new features are added or existing ones are changed.
- Obsolete sections should be removed.
- Documentation should be kept succinct and only include relevant information for developers and contributors.

## Frontend Guidelines (SvelteKit)
- Follow existing Svelte 5 runes patterns used in the codebase.
- Prefer strongly typed props and state.
- Keep UI components in `src/lib/components/` small and composable.
- Put client state/websocket interactions in stores under `src/lib/stores/`.
- Avoid introducing new dependencies unless necessary.
- All frontend changes should be tested in both desktop and mobile views. Responsive design is important for the game experience.

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
- For worker runtime changes, run `npm run worker:dev` when relevant.

## Deployment Context
- Primary deploy target: Cloudflare Pages.
- Pages deploy command: `npm run pages:deploy`.
- Pages secrets command pattern: `wrangler pages secret put <KEY> --project-name preferans`.
- D1 migration commands:
  - Local: `npm run db:migrate:local`
  - Production: `npm run db:migrate`

## What to Avoid
- Do not commit secrets or sample real credentials.
- Do not move business logic into UI components.
- Do not rewrite large sections when a targeted fix is enough.
