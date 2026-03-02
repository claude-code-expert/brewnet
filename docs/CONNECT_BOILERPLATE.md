# CONNECT_BOILERPLATE.md

> **Brewnet CLI Integration Reference**
> This document is the single authoritative source for implementing `brewnet create-app`.
> Everything a Claude-powered CLI needs to pull, configure, run, and verify any Brewnet stack.

---

## 1. Repository

```
REPO_URL  = https://github.com/claude-code-expert/brewnet-boilerplate.git
REPO_ORG  = claude-code-expert
REPO_NAME = brewnet-boilerplate
LICENSE   = MIT
```

Each of the 16 stacks is published as an **independent orphan branch** named `stack/<STACK_ID>`.
The `develop` branch is the integration branch; `main` is the release branch.

---

## 2. Stack Catalog (16 stacks)

| Stack ID | Language | Framework | Version | ORM / DB Layer | isUnified | Branch |
|----------|----------|-----------|---------|----------------|-----------|--------|
| `go-gin` | Go | Gin | 1.22 | GORM | false | `stack/go-gin` |
| `go-echo` | Go | Echo v4 | 1.24 | GORM | false | `stack/go-echo` |
| `go-fiber` | Go | Fiber v3 | 1.25 | GORM | false | `stack/go-fiber` |
| `rust-actix-web` | Rust | Actix-web 4 | 1.88 | SQLx | false | `stack/rust-actix-web` |
| `rust-axum` | Rust | Axum 0.8 | 1.88 | SQLx | false | `stack/rust-axum` |
| `java-springboot` | Java | Spring Boot 3.3 | 21 | JPA / JDBC | false | `stack/java-springboot` |
| `java-spring` | Java | Spring Framework 6.2 | 21 | JDBC / HikariCP | false | `stack/java-spring` |
| `kotlin-ktor` | Kotlin | Ktor 3.1 | 2.1 | Exposed ORM | false | `stack/kotlin-ktor` |
| `kotlin-springboot` | Kotlin | Spring Boot 3.4 | 2.1 | JDBC / HikariCP | false | `stack/kotlin-springboot` |
| `nodejs-express` | Node.js | Express 5 | 22 | Prisma 6 | false | `stack/nodejs-express` |
| `nodejs-nestjs` | Node.js | NestJS 11 | 22 | Prisma 6 | false | `stack/nodejs-nestjs` |
| `nodejs-nextjs` | Node.js | Next.js 15 (API Routes) | 22 | Prisma 6 | **true** | `stack/nodejs-nextjs` |
| `nodejs-nextjs-full` | Node.js | Next.js 15 (Full-Stack) | 22 | Prisma 6 | **true** | `stack/nodejs-nextjs-full` |
| `python-fastapi` | Python | FastAPI | 3.12 | SQLAlchemy 2.0 (async) | false | `stack/python-fastapi` |
| `python-django` | Python | Django 6 | 3.13 | Django ORM | false | `stack/python-django` |
| `python-flask` | Python | Flask 3.1 | 3.13 | Flask-SQLAlchemy | false | `stack/python-flask` |

> **isUnified = true**: `nodejs-nextjs` / `nodejs-nextjs-full` — no separate frontend container.
> Next.js serves both the UI and API on a **single port 3000** (no port 8080).

---

## 3. Clone Command

### Pattern

```bash
git clone --depth=1 -b stack/<STACK_ID> \
  https://github.com/claude-code-expert/brewnet-boilerplate.git <PROJECT_DIR>
```

### All 16 clone commands

```bash
git clone --depth=1 -b stack/go-gin            https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/go-echo           https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/go-fiber          https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/rust-actix-web    https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/rust-axum         https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/java-springboot   https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/java-spring       https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/kotlin-ktor       https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/kotlin-springboot https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/nodejs-express    https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/nodejs-nestjs     https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/nodejs-nextjs     https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/nodejs-nextjs-full https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/python-fastapi    https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/python-django     https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
git clone --depth=1 -b stack/python-flask      https://github.com/claude-code-expert/brewnet-boilerplate.git <project>
```

> `--depth=1` is mandatory for CLI usage — it omits git history for fast download.

---

## 4. Post-Clone Setup Flow

This is the exact sequence `brewnet create-app` must execute after cloning:

```
1. git clone --depth=1 -b stack/<STACK_ID> <REPO_URL> <PROJECT_DIR>
2. cd <PROJECT_DIR>
3. Generate .env from .env.example (+ inject secure secrets)
4. docker compose up -d [--build]
5. Wait for /health → HTTP 200 (poll with timeout)
6. Verify /api/hello → HTTP 200
7. Open http://localhost:3000 (or 8080 for API-only)
```

### Step 3 — .env Generation (Fully Automated — No Manual Editing)

The CLI generates `.env` programmatically. **The user never touches the file.**

```typescript
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function randomSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

// Map user DB choice → Prisma provider string (Node.js stacks only)
const PRISMA_PROVIDER: Record<string, string> = {
  postgres: 'postgresql',
  mysql:    'mysql',
  sqlite3:  'sqlite',
};

// Map user DB choice → Prisma DATABASE_URL (container-internal)
function buildDatabaseUrl(dbDriver: string, password: string): string {
  switch (dbDriver) {
    case 'postgres': return `postgresql://brewnet:${password}@postgres:5432/brewnet_db`;
    case 'mysql':    return `mysql://brewnet:${password}@mysql:3306/brewnet_db`;
    default:         return 'file:/app/data/brewnet_db.db';
  }
}

function generateEnv(projectDir: string, stackId: string, dbDriver = 'sqlite3'): void {
  const examplePath = path.join(projectDir, '.env.example');
  const envPath     = path.join(projectDir, '.env');

  // 1. Read .env.example as base
  let content = fs.readFileSync(examplePath, 'utf-8');

  // 2. Generate secure secrets
  const dbPassword    = randomSecret();
  const mysqlPassword = randomSecret();
  const mysqlRoot     = randomSecret();

  // 3. Apply substitutions (regex line-by-line replacement)
  content = content
    .replace(/^DB_DRIVER=.*/m,            `DB_DRIVER=${dbDriver}`)
    .replace(/^DB_PASSWORD=.*/m,          `DB_PASSWORD=${dbPassword}`)
    .replace(/^MYSQL_PASSWORD=.*/m,       `MYSQL_PASSWORD=${mysqlPassword}`)
    .replace(/^MYSQL_ROOT_PASSWORD=.*/m,  `MYSQL_ROOT_PASSWORD=${mysqlRoot}`);

  // 4. Node.js stacks (Prisma): set PRISMA_DB_PROVIDER + DATABASE_URL
  const isNodeStack = stackId.startsWith('nodejs-');
  if (isNodeStack) {
    const provider    = PRISMA_PROVIDER[dbDriver] ?? 'sqlite';
    const databaseUrl = buildDatabaseUrl(dbDriver, dbPassword);
    content = content
      .replace(/^PRISMA_DB_PROVIDER=.*/m, `PRISMA_DB_PROVIDER=${provider}`)
      .replace(/^DATABASE_URL=.*/m,       `DATABASE_URL=${databaseUrl}`);
  }

  // 5. Write .env — never shown to user, never committed
  fs.writeFileSync(envPath, content, 'utf-8');
}
```

**What the CLI sets automatically:**

| Variable | Action |
|----------|--------|
| `DB_DRIVER` | Set from `--database` flag (default: `sqlite3`) |
| `DB_PASSWORD` | Auto-generated 64-char hex secret |
| `MYSQL_PASSWORD` | Auto-generated 64-char hex secret |
| `MYSQL_ROOT_PASSWORD` | Auto-generated 64-char hex secret |
| `PRISMA_DB_PROVIDER` | Set from DB_DRIVER map (Node.js stacks only) |
| `DATABASE_URL` | Built from DB_DRIVER + generated password (Node.js stacks only) |

Everything else (`BACKEND_PORT`, `FRONTEND_PORT`, `DB_HOST`, etc.) uses the default values already in `.env.example` — no change needed.

> **DB_DRIVER defaults to `sqlite3`** so the stack starts immediately with no external database container.
> The user can pass `--database postgres` or `--database mysql` to override.

### Step 4 — Start Containers

```bash
# Production / CI
docker compose up -d

# With rebuild (use when first-time or source changed)
docker compose up -d --build

# Foreground / development (shows all logs)
docker compose up --build
```

### Step 5-6 — Health Verification

Poll `GET /health` until HTTP 200, then verify `GET /api/hello`:

```bash
# Poll loop (timeout 120s)
BACKEND_URL="http://localhost:8080"

# ⚠️ For unified stacks (nodejs-nextjs*): use port 3000
# BACKEND_URL="http://localhost:3000"

for i in $(seq 1 120); do
  if curl -sf "${BACKEND_URL}/health" > /dev/null 2>&1; then
    echo "Backend healthy"
    break
  fi
  sleep 1
done

# Verify API
curl -sf "${BACKEND_URL}/api/hello" | jq .
```

The shared validation script is at `shared/scripts/validate.sh` and can be run as:
```bash
make validate
# equivalent to: bash ../../shared/scripts/validate.sh
```

Override the base URL for non-default ports:
```bash
BASE_URL=http://localhost:8081 bash shared/scripts/validate.sh
```

---

## 5. Port Conventions

| Service | Container Port | Default Host Port | Note |
|---------|---------------|-------------------|------|
| Backend | 8080 | `localhost:8080` | All non-unified stacks |
| Frontend | 5173 (dev) / 80 (nginx) | `localhost:3000` | nginx in Docker production |
| Next.js (unified) | 3000 | `localhost:3000` | `nodejs-nextjs*` — no port 8080 |
| PostgreSQL | 5432 | `localhost:5433` | Avoids conflict with local PG |
| MySQL | 3306 | `localhost:3307` | Avoids conflict with local MySQL |

### ⚠️ Unified Stack Exception

`nodejs-nextjs` and `nodejs-nextjs-full` use **port 3000 only**:
- No `backend/` or `frontend/` subdirectory
- No port 8080
- Health check: `GET http://localhost:3000/health`
- Hello: `GET http://localhost:3000/api/hello`
- All routes are Next.js App Router route handlers (`src/app/.../route.ts`)

---

## 6. API Contract (All 16 Stacks)

Every stack implements the same 4 endpoints. The CLI uses these for validation.

### GET /

```
Method : GET
Path   : /
Purpose: Service identity check
```

**Request:**
```bash
curl -s http://localhost:8080/
```

**Response (HTTP 200, application/json):**
```json
{
  "service": "<framework>-backend",
  "status": "running",
  "message": "Hello Brewnet (https://www.brewnet.dev)"
}
```

Validation rule: `response.status === "running"`

**`service` field values per stack:**

| Stack ID | service value |
|----------|---------------|
| `go-gin` | `gin-backend` |
| `go-echo` | `echo-backend` |
| `go-fiber` | `fiber-backend` |
| `rust-actix-web` | `actix-web-backend` |
| `rust-axum` | `axum-backend` |
| `java-springboot` | `springboot-backend` |
| `java-spring` | `spring-backend` |
| `kotlin-ktor` | `ktor-backend` |
| `kotlin-springboot` | `springboot-kt-backend` |
| `nodejs-express` | `express-backend` |
| `nodejs-nestjs` | `nestjs-backend` |
| `nodejs-nextjs` | `nextjs-backend` |
| `nodejs-nextjs-full` | `nextjs-backend` |
| `python-fastapi` | `fastapi-backend` |
| `python-django` | `django-backend` |
| `python-flask` | `flask-backend` |

---

### GET /health

```
Method : GET
Path   : /health
Purpose: Liveness + DB connectivity check
```

**Request:**
```bash
curl -s http://localhost:8080/health
```

**Response (HTTP 200, application/json):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-01T12:00:00.000Z",
  "db_connected": true
}
```

Validation rules:
- `response.status === "ok"` → PASS
- `response.db_connected === true` → PASS (connected)
- `response.db_connected === false` → WARN (DB not connected, but service alive)
- `response.db_connected` field missing → FAIL

> `timestamp` format varies by language (ISO 8601, RFC 3339). Do not validate the exact format.

---

### GET /api/hello

```
Method : GET
Path   : /api/hello
Purpose: Runtime language/version info
```

**Request:**
```bash
curl -s http://localhost:8080/api/hello
```

**Response (HTTP 200, application/json):**
```json
{
  "message": "Hello from <Framework>!",
  "lang": "<lang>",
  "version": "<runtime_version>"
}
```

Validation rule: `response.message` field exists

**`message` + `lang` values per stack:**

| Stack ID | message | lang |
|----------|---------|------|
| `go-gin` | `Hello from Gin!` | `go` |
| `go-echo` | `Hello from Echo!` | `go` |
| `go-fiber` | `Hello from Fiber!` | `go` |
| `rust-actix-web` | `Hello from Actix-web!` | `rust` |
| `rust-axum` | `Hello from Axum!` | `rust` |
| `java-springboot` | `Hello from Spring Boot!` | `java` |
| `java-spring` | `Hello from Spring Framework!` | `java` |
| `kotlin-ktor` | `Hello from Ktor!` | `kotlin` |
| `kotlin-springboot` | `Hello from Spring Boot (Kotlin)!` | `kotlin` |
| `nodejs-express` | `Hello from Express!` | `node` |
| `nodejs-nestjs` | `Hello from NestJS!` | `node` |
| `nodejs-nextjs` | `Hello from Next.js!` | `nodejs` |
| `nodejs-nextjs-full` | `Hello from Next.js!` | `nodejs` |
| `python-fastapi` | `Hello from FastAPI!` | `python` |
| `python-django` | `Hello from Django!` | `python` |
| `python-flask` | `Hello from Flask!` | `python` |

---

### POST /api/echo

```
Method       : POST
Path         : /api/echo
Content-Type : application/json
Purpose      : Echo back the request body as-is
```

**Request:**
```bash
curl -s -X POST http://localhost:8080/api/echo \
  -H "Content-Type: application/json" \
  -d '{"test":"brewnet","number":42}'
```

**Response (HTTP 200, application/json):**
```json
{
  "test": "brewnet",
  "number": 42
}
```

Validation rule: `response.test === "brewnet"`

---

## 7. Unified Validation Script Logic

The CLI should perform validation in this exact order:

```
1. Poll GET /health  (timeout: 120s, interval: 1s)
   → Pass if HTTP 200 AND body.status == "ok"
   → Timeout = FAIL

2. Check GET /  (no retry)
   → Pass if HTTP 200 AND body.status == "running"

3. Check GET /api/hello  (no retry)
   → Pass if HTTP 200 AND body.message exists

4. Check POST /api/echo  (no retry, body: {"test":"brewnet"})
   → Pass if HTTP 200 AND body.test == "brewnet"

5. (Optional) Check GET /  (frontend)
   → Pass if HTTP 200
```

For **unified stacks** (`isUnified = true`), use port 3000 for all checks.
For **standard stacks** (`isUnified = false`), use port 8080 for backend checks, port 3000 for frontend.

---

## 8. Database Configuration

### DB_DRIVER Values

```
DB_DRIVER=postgres   → PostgreSQL 16  (default in .env.example)
DB_DRIVER=mysql      → MySQL 8.4
DB_DRIVER=sqlite3    → SQLite3 (no external container needed)
```

> The CLI should default to `DB_DRIVER=sqlite3` for instant startup (no DB container needed).
> Users can override with `--database postgres` or `--database mysql`.

### Docker Compose DB Profiles

DB containers are defined as Docker Compose profiles. They start conditionally:
- `postgres` profile starts when `DB_DRIVER=postgres`
- `mysql` profile starts when `DB_DRIVER=mysql`
- `sqlite3` — no DB container, file-based (`/app/data/brewnet_db.db`)

The backend container reads `DB_DRIVER` at startup and connects to the appropriate DB.

### Connection URLs (per DB type)

| DB_DRIVER | Internal URL (container) | External URL (host) |
|-----------|--------------------------|---------------------|
| `postgres` | `postgresql://brewnet:password@postgres:5432/brewnet_db` | `postgresql://brewnet:password@localhost:5433/brewnet_db` |
| `mysql` | `mysql://brewnet:password@mysql:3306/brewnet_db` | `mysql://brewnet:password@localhost:3307/brewnet_db` |
| `sqlite3` | `file:/app/data/brewnet_db.db` | `file:./data/brewnet_db.db` |

### Node.js Stacks (Prisma) — Extra Variables

Prisma requires an additional variable alongside `DB_DRIVER`:

```bash
# PostgreSQL
PRISMA_DB_PROVIDER=postgresql
DATABASE_URL=postgresql://brewnet:password@postgres:5432/brewnet_db

# MySQL
PRISMA_DB_PROVIDER=mysql
DATABASE_URL=mysql://brewnet:password@mysql:3306/brewnet_db

# SQLite3
PRISMA_DB_PROVIDER=sqlite
DATABASE_URL=file:/app/data/brewnet_db.db
```

After changing `PRISMA_DB_PROVIDER`, Prisma client must be regenerated:
```bash
npx prisma generate
# (handled automatically during docker compose build)
```

### Java / Kotlin Stacks (Spring Boot) — Profile Mapping

Spring Boot maps `DB_DRIVER` → `spring.profiles.active` → loads `application-{profile}.yml`:
```
DB_DRIVER=postgres  → spring.profiles.active=postgres  → application-postgres.yml
DB_DRIVER=mysql     → spring.profiles.active=mysql     → application-mysql.yml
DB_DRIVER=sqlite3   → spring.profiles.active=sqlite3   → application-sqlite3.yml
```

### Python Stacks — Async Drivers

FastAPI (SQLAlchemy async) uses different drivers per DB:
```
postgres  → asyncpg    (postgresql+asyncpg://...)
mysql     → aiomysql   (mysql+aiomysql://...)
sqlite3   → aiosqlite  (sqlite+aiosqlite:///...)
```

---

## 9. Environment Variables (Complete List)

These variables exist in every stack's `.env.example`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_NAME` | `brewnet` | Docker Compose project name |
| `DOMAIN` | `localhost` | Application domain |
| `DB_DRIVER` | `sqlite3` | `postgres` \| `mysql` \| `sqlite3` |
| `BACKEND_PORT` | `8080` | Backend host port (nextjs stacks: `3000`) |
| `FRONTEND_PORT` | `3000` | Frontend host port |
| `TZ` | `Asia/Seoul` | Timezone |
| `STACK_LANG` | *(stack id)* | Stack identifier (e.g. `go-gin`) |
| `DB_HOST` | `postgres` | PostgreSQL hostname (Docker internal) |
| `DB_PORT` | `5432` | PostgreSQL container port |
| `DB_NAME` | `brewnet_db` | PostgreSQL database name |
| `DB_USER` | `brewnet` | PostgreSQL username |
| `DB_PASSWORD` | `password` | PostgreSQL password ← **must be replaced by CLI** |
| `MYSQL_HOST` | `mysql` | MySQL hostname (Docker internal) |
| `MYSQL_PORT` | `3306` | MySQL container port |
| `MYSQL_DATABASE` | `brewnet_db` | MySQL database name |
| `MYSQL_USER` | `brewnet` | MySQL username |
| `MYSQL_PASSWORD` | `password` | MySQL password ← **must be replaced by CLI** |
| `MYSQL_ROOT_PASSWORD` | `password` | MySQL root password ← **must be replaced by CLI** |
| `SQLITE_PATH` | `/app/data/brewnet_db.db` | SQLite3 file path (container path) |
| `VITE_API_URL` | `http://localhost:8080` | API URL for Vite frontend dev server |

**Node.js stacks only:**
| Variable | Default | Description |
|----------|---------|-------------|
| `PRISMA_DB_PROVIDER` | `postgresql` | `postgresql` \| `mysql` \| `sqlite` |
| `DATABASE_URL` | *(auto)* | Prisma connection URL |

---

## 10. Directory Structure (per stack)

### Standard Stack (isUnified = false)

```
stacks/<STACK_ID>/
├── backend/
│   ├── src/  (or cmd/, app/, etc.)    ← Language-specific source
│   ├── Dockerfile                      ← Multi-stage build
│   └── .dockerignore
├── frontend/                           ← React 19 + Vite 6 + TypeScript
│   ├── src/
│   │   ├── App.tsx                     ← Calls GET /api/hello, displays result
│   │   └── main.tsx
│   ├── nginx.conf                      ← Production: static + /api proxy to backend
│   ├── Dockerfile                      ← Multi-stage: node:22-alpine → nginx
│   └── .dockerignore
├── docker-compose.yml                  ← backend + frontend + postgres + mysql
├── Makefile                            ← dev, build, up, down, logs, test, clean, validate
├── .env.example                        ← Template with all variables
└── README.md
```

### Unified Stack (isUnified = true) — nodejs-nextjs / nodejs-nextjs-full

```
stacks/<STACK_ID>/
├── src/
│   ├── app/
│   │   ├── route.ts                   ← GET / (service info)
│   │   ├── health/route.ts            ← GET /health
│   │   ├── api/hello/route.ts         ← GET /api/hello
│   │   └── api/echo/route.ts          ← POST /api/echo
│   └── lib/
│       └── db.ts                      ← Prisma singleton + buildDatabaseUrl()
├── prisma/schema.prisma
├── Dockerfile                         ← 3-stage build (node:22-alpine, standalone output)
├── docker-compose.yml                 ← backend (Next.js) + postgres + mysql (NO frontend service)
├── Makefile
├── .env.example
└── README.md
```

---

## 11. Makefile Targets (Uniform Across All Stacks)

```makefile
make dev      # docker compose up --build        (foreground, hot reload)
make build    # docker compose build             (build images only)
make up       # docker compose up -d             (production, detached)
make down     # docker compose down              (stop + remove containers)
make logs     # docker compose logs -f           (follow logs)
make test     # docker compose run --rm backend <test_cmd>
make clean    # docker compose down -v --rmi local (remove containers + volumes + images)
make validate # bash ../../shared/scripts/validate.sh (API endpoint verification)
```

Language-specific `test` commands:
| Language | Test Command in Container |
|----------|--------------------------|
| Go | `go test ./...` |
| Rust | `cargo test` |
| Java | `./gradlew test` (springboot) / `mvn test` (spring) |
| Kotlin | `gradle test` |
| Node.js | `npm test` (Vitest) |
| Python | `pytest` |

---

## 12. Docker Architecture

### Standard Stack Network

```
host
├── localhost:3000  →  frontend (nginx:80)
│                         └── /api proxy → backend:8080
└── localhost:8080  →  backend (:8080)
                          └── brewnet-internal network
                               ├── postgres:5432
                               └── mysql:3306

localhost:5433 → postgres:5432  (host-mapped)
localhost:3307 → mysql:3306     (host-mapped)
```

### Unified Stack Network (nodejs-nextjs*)

```
host
└── localhost:3000  →  Next.js (:3000)  [UI + API in one process]
                          └── brewnet-internal network
                               ├── postgres:5432
                               └── mysql:3306
```

### Docker Networks

| Network | Type | Members |
|---------|------|---------|
| `brewnet` | bridge | backend, frontend |
| `brewnet-internal` | internal bridge | backend, postgres, mysql |

### Resource Limits

| Service | Memory | CPU |
|---------|--------|-----|
| backend | 512M | 1.0 |
| frontend | 128M | 0.5 |

### Multi-Stage Build Pattern

All Dockerfiles use multi-stage builds:

| Language | Builder Image | Runner Image |
|----------|--------------|--------------|
| Go | `golang:1.22-alpine` | `alpine` |
| Rust | `rust:1.88` | `debian:bookworm-slim` |
| Java (Spring Boot) | `gradle:8.5-jdk21` | `eclipse-temurin:21-jre-alpine` |
| Java (Spring) | `eclipse-temurin:21-jdk` + Maven | `eclipse-temurin:21-jre-alpine` |
| Kotlin | `gradle:8.12-jdk21` | `eclipse-temurin:21-jre-alpine` |
| Node.js | `node:22-alpine` | `node:22-alpine` (or `nginx`) |
| Python | `python:3.12-slim` / `python:3.13-slim` | same slim image |
| Frontend (React) | `node:22-alpine` | `nginx` |

---

## 13. Stack-Specific Build Notes

These are critical for the CLI to provide accurate status/ETA during `docker compose up --build`.

### Go (gin, echo, fiber)
- Build is fast (Go compilation ~10-30s in Docker)
- SQLite3 requires `CGO_ENABLED=1` (handled in Dockerfile with Alpine build tools)
- Local run: `DB_DRIVER=sqlite3 SQLITE_PATH=./data/brewnet_db.db go run ./cmd/server`

### Rust (actix-web, axum)
- **First build is slow** (3-10 minutes due to full Rust compilation)
- Subsequent builds use dependency caching via two-step Docker build
- CLI should display a warning: "Rust builds take 3-10 minutes on first run"
- Local run: `DB_DRIVER=sqlite3 SQLITE_PATH=./data/brewnet_db.db cargo run`

### Java (springboot, spring)
- `java-springboot` uses `gradle:8.5-jdk21` as builder (no gradle-wrapper.jar needed)
- `java-spring` uses Maven (`eclipse-temurin:21-jdk` + `apt-get install maven`)
- First build downloads Gradle/Maven dependencies (~2-5 min)
- Local run: `DB_DRIVER=sqlite3 ./gradlew bootRun` (springboot) / `mvn spring-boot:run` (spring)

### Kotlin (ktor, springboot)
- Both use `gradle:8.12-jdk21` as builder
- Similar build time to Java (~2-5 min first build)
- Local run: `DB_DRIVER=sqlite3 gradle run` (ktor) / `DB_DRIVER=sqlite3 gradle bootRun` (springboot)

### Node.js (express, nestjs)
- Fast build (~30-60s)
- Prisma requires `npx prisma generate` — handled automatically in Dockerfile
- After changing `PRISMA_DB_PROVIDER`, image rebuild is required
- Local run: `DB_DRIVER=sqlite3 DATABASE_URL="file:./data/brewnet_db.db" npm run dev`

### Node.js (nextjs, nextjs-full) — Unified
- Fast build (~30-60s)
- Uses `output: 'standalone'` in `next.config.ts` for optimized Docker output
- No separate frontend Dockerfile
- `BACKEND_PORT=3000`, `FRONTEND_PORT=3000` (both same)
- Local run: `DB_DRIVER=sqlite3 DATABASE_URL="file:./data/brewnet_db.db" npm run dev`

### Python (fastapi, django, flask)
- Fast build (~30-60s)
- Virtual environment (`venv`) is created inside container, not needed on host
- `python-fastapi`: FastAPI auto-docs at `/docs` (Swagger) and `/redoc` (ReDoc)
- Local run: `DB_DRIVER=sqlite3 uvicorn src.main:app --reload --port 8080` (fastapi)
- Local run: `DB_DRIVER=sqlite3 python manage.py runserver 8080` (django)
- Local run: `DB_DRIVER=sqlite3 flask run --port 8080` (flask)

---

## 14. CLI create-app — Complete Implementation Flow

```
brewnet create-app <project-name> [--stack <STACK_ID>] [--database <DB_DRIVER>] [--frontend none]
```

### Step-by-step

```
1. Resolve STACK_ID
   - If --stack provided: validate against the 16 known stack IDs
   - If not provided: show interactive prompt
     ├── Select language: Go / Rust / Java / Kotlin / Node.js / Python
     └── Select framework: (filtered by language)

2. Resolve PROJECT_DIR
   - Default: ./<project-name>
   - Fail if directory already exists

3. git clone
   git clone --depth=1 -b stack/<STACK_ID> <REPO_URL> <PROJECT_DIR>

4. cd <PROJECT_DIR>

5. Generate .env  ← FULLY AUTOMATED, no user interaction
   - Read .env.example
   - Replace DB_DRIVER with selected value (default: sqlite3)
   - Replace DB_PASSWORD / MYSQL_PASSWORD / MYSQL_ROOT_PASSWORD with crypto.randomBytes(32).toString('hex')
   - For nodejs-* stacks: replace PRISMA_DB_PROVIDER + DATABASE_URL matching DB_DRIVER
   - Write result to .env
   - Never open editor, never prompt for passwords

6. (Optional) Remove git history
   rm -rf .git
   git init
   git add -A
   git commit -m "chore: initial project from brewnet create-app"

7. Start containers
   docker compose up -d --build

8. Poll health (timeout 120s)
   GET http://localhost:<BACKEND_PORT>/health
   ├── BACKEND_PORT = 8080 for isUnified=false
   └── BACKEND_PORT = 3000 for isUnified=true (nodejs-nextjs*)

9. Verify API
   GET http://localhost:<BACKEND_PORT>/api/hello

10. Print success message
    ┌─────────────────────────────────────────┐
    │  ✅ my-project is ready!                │
    │                                         │
    │  Frontend  →  http://localhost:3000     │
    │  Backend   →  http://localhost:8080     │
    │  Stack     →  go-gin (Go · Gin · GORM)  │
    │                                         │
    │  cd my-project                          │
    │  make logs     # view container logs    │
    │  make down     # stop containers        │
    └─────────────────────────────────────────┘
```

> For **unified stacks** (`nodejs-nextjs*`), print only:
> `Frontend + Backend  →  http://localhost:3000`

---

## 15. Ping / Health Check Reference

The CLI must implement this polling logic for `--wait` or post-create verification:

```typescript
// TypeScript pseudocode
async function waitForHealth(baseUrl: string, timeoutSec = 120): Promise<boolean> {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'ok') return true;
      }
    } catch {
      // not ready yet, continue polling
    }
    await sleep(1000);
  }
  return false; // timeout
}

async function verifyStack(isUnified: boolean): Promise<void> {
  const backendUrl = isUnified ? 'http://localhost:3000' : 'http://localhost:8080';
  const frontendUrl = 'http://localhost:3000';

  // 1. Wait for backend health
  const healthy = await waitForHealth(backendUrl);
  if (!healthy) throw new Error('Stack did not become healthy within 120s');

  // 2. Verify GET /api/hello
  const hello = await fetch(`${backendUrl}/api/hello`);
  const helloBody = await hello.json();
  if (!helloBody.message) throw new Error('GET /api/hello returned unexpected response');

  // 3. Verify POST /api/echo
  const echo = await fetch(`${backendUrl}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test: 'brewnet' }),
  });
  const echoBody = await echo.json();
  if (echoBody.test !== 'brewnet') throw new Error('POST /api/echo failed');
}
```

---

## 16. HEALTHCHECK in Dockerfiles

All backend Dockerfiles include a Docker `HEALTHCHECK` directive. The CLI can also query Docker's health status:

```bash
docker inspect --format='{{.State.Health.Status}}' brewnet-<stack-id>-backend-1
# → "healthy" | "unhealthy" | "starting"
```

> **Alpine container note**: Use `127.0.0.1` instead of `localhost` in HEALTHCHECK commands.
> Alpine resolves `localhost` to IPv6 (`::1`), which causes health check failures on some setups.

```dockerfile
# Correct
HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

# Wrong (may fail on Alpine)
HEALTHCHECK CMD wget -q -O /dev/null http://localhost:8080/health || exit 1
```

---

## 17. Container Naming Convention

Docker Compose uses `--project-name` derived from the directory name or `PROJECT_NAME` in `.env`.

Default container names (with `PROJECT_NAME=brewnet`):
```
brewnet-backend-1     ← backend service
brewnet-frontend-1    ← frontend service
brewnet-postgres-1    ← postgres service
brewnet-mysql-1       ← mysql service
```

If using the dashboard with `--project-name brewnet-<stack>`:
```
brewnet-go-gin-backend-1
brewnet-go-gin-frontend-1
```

---

## 18. Error Handling Patterns

### docker compose up failures

| Error | Cause | Fix |
|-------|-------|-----|
| `port is already allocated` | Another process uses the target port | Free the port or use `BACKEND_PORT` / `FRONTEND_PORT` override |
| `exit code: 1` in build | Compilation error or missing dependency | Run `docker build --progress=plain` for full output |
| `gradle-wrapper.jar not found` | `.jar` in `.dockerignore` | Use `gradle:8.x-jdk21` builder image (no wrapper needed) |
| `DB connection refused` | DB container not ready when backend starts | Backend retries on startup; health check will eventually pass |
| `Cannot connect to Docker daemon` | Docker Desktop not running | Open Docker Desktop first |

### Health Check Timeout

If the stack doesn't become healthy in 120s:
1. Run `docker compose logs backend` to see startup errors
2. Check `docker ps` — is the container running?
3. Check if port 8080/3000 is available: `lsof -i :8080`
4. For Rust stacks: first build can take 3-10 min — increase timeout to 600s

---

## 19. Quick Reference Cheatsheet

```bash
# Clone any stack
git clone --depth=1 -b stack/go-gin \
  https://github.com/claude-code-expert/brewnet-boilerplate.git my-project

# Start with SQLite (fastest — no DB container)
cd my-project && cp .env.example .env
echo "DB_DRIVER=sqlite3" >> .env
docker compose up -d --build

# Health check
curl -sf http://localhost:8080/health | jq .
# → {"status":"ok","timestamp":"...","db_connected":false}

# API check
curl -s http://localhost:8080/api/hello | jq .
# → {"message":"Hello from Gin!","lang":"go","version":"1.22.x"}

# Echo check
curl -s -X POST http://localhost:8080/api/echo \
  -H "Content-Type: application/json" \
  -d '{"test":"brewnet"}' | jq .
# → {"test":"brewnet"}

# Full automated validation
make validate

# ---- Unified stack (nextjs) ----
curl -sf http://localhost:3000/health | jq .
curl -s http://localhost:3000/api/hello | jq .

# Logs
make logs

# Stop
make down

# Full cleanup
make clean
```

---

*Generated from: root README.md + 16 stack READMEs + dashboard/src/lib/stacks.ts + shared/scripts/validate.sh*
*Last updated: 2026-03-02*
