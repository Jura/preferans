# Preferans Online

An online implementation of the classic Preferans card game.

This project uses SvelteKit for the web app UI and Cloudflare platform services for deployment and runtime.

## Technology Stack

| Layer | Technology |
|---|---|
| Web application | SvelteKit 2 + Svelte 5 (runes mode) |
| Primary deployment target | Cloudflare Pages |
| Realtime game rooms | Cloudflare Durable Objects |
| Game API runtime (local dev and legacy split deploy) | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Authentication | Google OAuth 2.0 |

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

- Deck: 32 cards (7 through Ace)
- Players: exactly 3
- Deal: 10 cards per player + 2 cards in the kitty
- Bidding: ascending contracts
- Contracts: 6-10 tricks in suit, no-trump, misere, grand
- Kitty: bidding winner takes kitty and discards
- Play: trick-taking with declared trump mode
- Scoring: based on contract result

## Development Commands

```bash
npm run check        # TypeScript + Svelte checks
npm run lint         # ESLint + Prettier checks
npm run format       # Format code
npm run db:migrate   # Apply D1 migrations to remote DB
npm run db:migrate:local  # Apply D1 migrations to local DB
```
