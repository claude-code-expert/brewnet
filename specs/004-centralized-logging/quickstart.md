# Quickstart: Centralized Logging System

**Feature**: 004-centralized-logging

## Build & Test

```bash
# Install dependencies
pnpm install

# Build shared package first (types dependency)
pnpm -C packages/shared build

# Build CLI
pnpm -C packages/cli build

# Run all tests
npm test

# Run specific test files
npx jest tests/unit/cli/utils/log-aggregator.test.ts
npx jest tests/unit/cli/utils/log-rotation.test.ts
npx jest tests/unit/cli/services/compose-generator.test.ts

# Lint
npm run lint
```

## Verification Steps

### 1. Docker Log Configuration

```bash
# Generate a compose config and verify logging field
node -e "
const { generateComposeConfig } = require('./packages/cli/dist/services/compose-generator.js');
const config = generateComposeConfig(state);
const svc = config.services['traefik'];
console.log('logging:', JSON.stringify(svc.logging, null, 2));
console.log('volumes:', svc.volumes);
console.log('command:', svc.command);
"
```

Expected:
- Every service has `logging.driver: 'json-file'`
- Traefik volumes include `./logs:/logs`
- Traefik command includes `--accesslog=true`

### 2. CLI Backward Compatibility

```bash
# Existing behavior (should work unchanged)
brewnet logs
brewnet logs -f
brewnet logs gitea
brewnet logs -n 50

# New aggregator behavior
brewnet logs --all
brewnet logs --source access --level error
brewnet logs --since 1h --json
```

### 3. Admin Panel API

```bash
# Start admin server, then test endpoints
curl http://localhost:8088/api/logs
curl http://localhost:8088/api/logs?source=access&level=error&limit=10
curl http://localhost:8088/api/logs/stats
```

### 4. Log Rotation

```bash
# Verify CLI log cleanup (30-day retention)
ls ~/.brewnet/logs/brewnet-*.log

# Verify rotation constants are exported
node -e "
const { DOCKER_LOG_MAX_SIZE, CLI_LOG_RETENTION_DAYS } = require('@brewnet/shared');
console.log(DOCKER_LOG_MAX_SIZE, CLI_LOG_RETENTION_DAYS);
"
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/logging.ts` | Shared types (UnifiedLogEntry, LogQuery, etc.) |
| `packages/shared/src/utils/constants.ts` | Logging constants |
| `packages/cli/src/utils/log-aggregator.ts` | Core aggregation module |
| `packages/cli/src/utils/log-rotation.ts` | File rotation |
| `packages/cli/src/commands/logs.ts` | CLI command |
| `packages/cli/src/services/compose-generator.ts` | Docker logging config |
| `packages/cli/src/services/admin-server.ts` | API endpoints + UI |
