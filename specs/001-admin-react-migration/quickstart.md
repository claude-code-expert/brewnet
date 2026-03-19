# Quickstart: Admin UI React Migration

**Branch**: `001-admin-react-migration` | **Date**: 2026-03-18

---

## Prerequisites

- pnpm installed (`npm i -g pnpm`)
- Node.js 20+
- Brewnet project initialized (admin server can start)

---

## Development Setup

### 1. Install admin-ui dependencies (once)

```bash
pnpm install
# pnpm-workspace.yaml picks up packages/admin-ui automatically
```

### 2. Build admin-ui for production serving

```bash
pnpm --filter @brewnet/admin-ui build
# Output: packages/admin-ui/dist/
```

### 3. Start admin server (serves React build)

```bash
brewnet admin
# Opens http://localhost:8800
# React SPA loads from packages/admin-ui/dist/
```

### 4. Hot-reload development (admin-ui only)

```bash
# Terminal 1: admin server for API
brewnet admin

# Terminal 2: Vite dev server (hot module replacement)
pnpm --filter @brewnet/admin-ui dev
# Open http://localhost:5173 (Vite proxies /api/* to :8800)
```

---

## Full Build

```bash
npm run build
# Builds admin-ui first, then CLI
# Equivalent to:
# pnpm --filter @brewnet/admin-ui build && pnpm -r --filter !@brewnet/admin-ui build
```

---

## Verify Migration Success

After building and starting the admin server, verify each success criterion:

```bash
# SC-001: Pages load within 2 seconds
curl -s -o /dev/null -w "%{time_total}" http://localhost:8800/

# SC-003: Build completes
npm run build && echo "BUILD OK"

# SC-004: No BN502 toast (Gitea unreachable silent fallback)
# → Open http://localhost:8800/apps, confirm no error toast on load

# SC-005: No CDN dependencies
# → Open browser DevTools → Network → reload → confirm all assets from localhost:8800

# SC-006: CLI tests pass
npm test

# SC-007: Browser refresh works on all routes
curl -s -o /dev/null -w "%{http_code}" http://localhost:8800/apps
# → 200 (not 404)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8800/apps/myapp
# → 200 (not 404)
```

---

## Troubleshooting

### "Admin UI not built" (503 error)
```bash
pnpm --filter @brewnet/admin-ui build
```

### React app loads but /api/* returns 404
The admin server is not running or is on a different port. Check:
```bash
brewnet admin --port 8800
```

### Vite dev server can't proxy /api/*
Ensure admin server is running on port 8800 before starting `pnpm dev`.

### Type errors in admin-ui
The `packages/admin-ui/tsconfig.json` is independent of the root tsconfig. Run:
```bash
pnpm --filter @brewnet/admin-ui exec tsc --noEmit
```
