# Preferans Online

An online implementation of the classic Preferans card game.

This project uses SvelteKit for the web app UI and Cloudflare platform services for deployment and runtime.

## Technology Stack

| Layer                                                | Technology                          |
| ---------------------------------------------------- | ----------------------------------- |
| Web application                                      | SvelteKit 2 + Svelte 5 (runes mode) |
| Primary deployment target                            | Cloudflare Pages                    |
| Realtime game rooms                                  | Cloudflare Durable Objects          |
| Game API runtime (local dev and legacy split deploy) | Cloudflare Workers                  |
| Database                                             | Cloudflare D1 (SQLite)              |
| Authentication                                       | Google OAuth 2.0                    |

## Repository Structure

```text
preferans/
|- src/                          # SvelteKit application
|  |- routes/                    # Pages, auth routes, game routes
|  |- lib/components/            # UI components
|  |- lib/stores/                # Client stores (auth, game websocket)
|  |- lib/types/                 # Shared TypeScript domain types
|  |- hooks.server.ts            # Session and locale middleware
|- worker/                       # Realtime/game worker code
|  |- src/
|  |  |- index.ts                # REST + websocket entry for worker runtime
|  |  |- gameEngine.ts           # Preferans rules engine
|  |  |- durable-objects/
|  |     |- GameRoom.ts          # Durable Object room state + websocket handling
|  |- migrations/                # D1 SQL migrations
|  |- wrangler.toml              # Worker runtime config (dev/split mode)
|- wrangler.toml                 # Cloudflare Pages project config (source of truth)
|- svelte.config.js
|- vite.config.ts
|- package.json
```

## Cloudflare Project Model

The project is now documented and configured with Cloudflare Pages as the primary project type:

- Root `wrangler.toml` is the source of truth for Cloudflare Pages settings.
- D1 migration scripts use `worker/wrangler.toml` because Pages config does not support migration settings.
- OAuth/session values are configured as Pages secrets via `wrangler pages secret put ... --project-name <your-pages-project-name>`.

The `worker/` directory is still used for local realtime API development and for legacy split deployments.

## Quick Start (Local Development)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure local environment variables

Create `.dev.vars` in the project root:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SESSION_SECRET=a_random_secret_at_least_32_chars
```

### 3. Create D1 database

```bash
# Create database
npx wrangler d1 create preferans-db

# Copy the returned database_id into:
# - wrangler.toml (root)
# - worker/wrangler.toml (only needed for worker:dev / worker:deploy flows)
```

### 4. Apply migrations

```bash
npm run db:migrate:local
```

### 5. Start development servers

Run these in separate terminals:

```bash
npm run worker:dev
npm run dev
```

Open http://localhost:5173

## Deploy to Cloudflare Pages

Before deployment, make sure the Pages project exists in your account and matches the `name` value in `wrangler.toml`.

```bash
# List existing Pages projects
npx wrangler pages project list

# If missing, create one (choose your own project name)
npx wrangler pages project create <your-pages-project-name>
```

If your real Pages project name is not `preferans`, update `name` in `wrangler.toml`.

### 1. Build and deploy

```bash
npm run pages:deploy
```

Alternative: connect the Git repository in Cloudflare Pages with:

- Build command: `npm run build`
- Build output directory: `.svelte-kit/cloudflare`

### 2. Set Pages secrets (important)

Use Pages-specific secret commands:

```bash
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <your-pages-project-name>
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name <your-pages-project-name>
npx wrangler pages secret put SESSION_SECRET --project-name <your-pages-project-name>
```

### 3. Run production migrations

```bash
npm run db:migrate
```

Note: migration commands are intentionally bound to `worker/wrangler.toml`.

## Preferans Rules (Game Summary)

The implemented variant is **Ленинградка** (Leningrad tournament conventions) — see [CONVENTIONS.md](CONVENTIONS.md) for the full convention list.

- Deck: 32 cards (7 through Ace); suits rank ♠ < ♣ < ♦ < ♥ < no-trump
- Players: exactly 3
- Deal: 10 cards per player + 2 cards in the widow (прикуп)
- Bidding: multi-round ascending auction from 6♠; misère may only be a player's first bid and is outbid only by nine-level contracts
- Widow: the auction winner takes the widow, discards two cards, and announces the final contract (not lower than the winning bid)
- Whisting: defenders declare вист / пас / полвиста; pass-pass throws the contract in, a lone whister may invite the passer's cards (gentleman's whist) and chooses light or open play
- Распасовка: if everyone passes, an all-pass round is played — widow cards dictate the first two lead suits, trick price grows 2 → 4 → 6 with consecutive all-pass rounds
- Play: trick-taking, must follow suit, must trump when void; misère and light play reveal hands after the first (dark) lead
- Scoring: пуля (pool), гора (mountain, doubled undertricks), and висты; the bullet closes when every player fills the pool, then scores settle via the standard mountain/pool/whist formula

## Table Governance

- A table auto-deals as soon as the third player joins; seating order is randomized at that moment.
- Leaving is only available while the table is still in `waiting`.
- During an active game, players can propose:
  - early finish (unanimous yes closes the table with current scores),
  - pause (fixed duration or indefinite, also unanimous).
- Admins can pin tables and manually deal out or dismiss tables from the lobby.
- Non-pinned stale tables are auto-closed:
  - incomplete waiting tables after 1 hour,
  - inactive active tables after 1 hour,
  - paused tables at pause deadline or after 1 week of inactivity.

## Development Commands

```bash
npm run check        # TypeScript + Svelte checks
npm run lint         # ESLint + Prettier checks
npm run format       # Format code
npm run db:migrate   # Apply D1 migrations to remote DB
npm run db:migrate:local  # Apply D1 migrations to local DB
```
