# Quickstart: App Deploy UI

**Branch**: `005-app-deploy-ui` | **Date**: 2026-03-16

## Prerequisites

- Brewnet wizard completed (`brewnet init`)
- Admin server running (started automatically by wizard)
- Gitea running (Docker container at `localhost:3000/git`)

## Accessing the App Deploy Page

```bash
# Option A: Via browser (admin server auto-starts on init)
open http://localhost:<adminPort>/apps

# Option B: Via static demo (UI reference only, no backend)
npx serve public/demo
open http://localhost:3000/brewnet-app-deploy.html
```

## Development Workflow

```bash
# Build CLI (runs tsup)
pnpm --filter @brewnet/cli build

# Watch mode for development
pnpm --filter @brewnet/cli build --watch

# Run tests
npm test

# Lint
npm run lint
```

## Key Files to Modify

```
packages/cli/src/services/apps-page.ts   ← HTML generator (primary change)
packages/cli/src/services/app-manager.ts ← Backend logic
packages/cli/src/services/admin-server.ts ← HTTP routes
```

## Testing the Page

```bash
# 1. Build
pnpm --filter @brewnet/cli build

# 2. Start admin server (needs a brewnet project)
brewnet init  # first-time setup

# 3. Open apps page in browser
open http://localhost:$(cat ~/.brewnet/config.json | jq -r '.adminPort')/apps
```

## Common Tasks

### Check current app list
```bash
cat ~/.brewnet/apps.json | jq '.'
```

### Clear app registry (dev/test)
```bash
echo '[]' > ~/.brewnet/apps.json
```

### Verify API routes
```bash
curl http://localhost:<adminPort>/api/apps | jq '.'
curl http://localhost:<adminPort>/api/git/repos | jq '.'
```
