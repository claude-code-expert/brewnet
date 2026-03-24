# Quickstart: Testing brewnet create-app

**Date**: 2026-03-02
**Branch**: `001-create-app`

## Prerequisites

- Docker Desktop running (macOS) or Docker Engine (Linux)
- `brewnet` CLI built: `pnpm build` in `packages/cli`
- Internet connection (for boilerplate clone)

## Quick Test Cases

### 1. Minimum viable: SQLite + Go (fastest)

```bash
# Should complete in ~1 minute
brewnet create-app test-go --stack go-gin

# Expected output: success box with:
#   Frontend  →  http://localhost:3000
#   Backend   →  http://localhost:8080

# Verify manually
curl -s http://localhost:8080/health | python3 -m json.tool
# → {"status":"ok","timestamp":"...","db_connected":false}

curl -s http://localhost:8080/api/hello | python3 -m json.tool
# → {"message":"Hello from Gin!","lang":"go","version":"1.22.x"}

# Cleanup
cd test-go && make down && cd .. && rm -rf test-go
```

### 2. Interactive selection

```bash
brewnet create-app my-interactive-app
# → Prompt 1: Select language (Go / Rust / Java / Kotlin / Node.js / Python)
# → Prompt 2: Select framework (filtered by language)
# → Proceeds automatically after selection
```

### 3. With PostgreSQL database

```bash
brewnet create-app test-pg --stack nodejs-express --database postgres

# Verify DB connection
curl -s http://localhost:8080/health | python3 -m json.tool
# → db_connected should be true

# Cleanup
cd test-pg && make down && cd .. && rm -rf test-pg
```

### 4. Unified stack (Next.js)

```bash
brewnet create-app test-next --stack nodejs-nextjs

# Only port 3000 (no backend port)
curl -s http://localhost:3000/health | python3 -m json.tool
curl -s http://localhost:3000/api/hello | python3 -m json.tool

# Cleanup
cd test-next && make down && cd .. && rm -rf test-next
```

### 5. Rust stack (extended timeout)

```bash
# Expect: warning about 3-10 min build time + 600s health timeout
brewnet create-app test-rust --stack rust-actix-web --database sqlite3

# Cleanup
cd test-rust && make down && cd .. && rm -rf test-rust
```

---

## Error Test Cases

### Directory conflict

```bash
mkdir already-exists
brewnet create-app already-exists
# → Error: Directory "already-exists" already exists.
rmdir already-exists
```

### Invalid stack

```bash
brewnet create-app test-bad --stack invalid-stack
# → Error: Unknown stack ID "invalid-stack". Valid stack IDs: ...
```

### Invalid database

```bash
brewnet create-app test-bad --stack go-gin --database oracle
# → Error: Unknown database driver "oracle". Valid options: sqlite3, postgres, mysql
```

---

## Unit Test Execution

```bash
cd packages/cli

# Stack catalog tests
pnpm test tests/unit/create-app/stacks.test.ts

# Env generation tests
pnpm test tests/unit/create-app/env-generation.test.ts

# Health polling tests (mock server)
pnpm test tests/unit/create-app/health-polling.test.ts
```

---

## API Verification Cheatsheet

All 16 stacks implement the same 4 endpoints:

```bash
BASE="http://localhost:8080"   # or 3000 for unified stacks

# Health check
curl -s $BASE/health | python3 -m json.tool

# Root info
curl -s $BASE/ | python3 -m json.tool

# Hello endpoint
curl -s $BASE/api/hello | python3 -m json.tool

# Echo endpoint
curl -s -X POST $BASE/api/echo \
  -H "Content-Type: application/json" \
  -d '{"test":"brewnet"}' | python3 -m json.tool
# → {"test":"brewnet"}
```
