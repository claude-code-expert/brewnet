# Data Model: brewnet create-app

**Date**: 2026-03-02
**Branch**: `001-create-app`

---

## Core Entities

### StackEntry

Represents one of the 16 pre-built boilerplate stacks available for scaffolding.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier matching the boilerplate branch name (e.g., `go-gin`) |
| `language` | `string` | Display name for the programming language (e.g., `Go`) |
| `framework` | `string` | Display name for the framework (e.g., `Gin`) |
| `version` | `string` | Runtime version string (e.g., `1.22`) |
| `orm` | `string` | ORM or DB layer used (e.g., `GORM`, `Prisma 6`, `SQLx`) |
| `isUnified` | `boolean` | `true` for stacks with a single port (nodejs-nextjs*); affects port routing |
| `buildSlow` | `boolean` | `true` for Rust stacks; triggers extended timeout (600s) and build warning |

**Constraints**:
- `id` must match `stack/<id>` branch in `brewnet-boilerplate` repository exactly
- Exactly 16 entries; any mismatch is a catalog error
- If `isUnified = true`, backend port is 3000; if false, backend port is 8080

**State**: Read-only catalog — no mutations

---

### CreateAppOptions

Parsed command-line options for the `create-app` command.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `projectName` | `string` | (required) | Directory name and project identifier |
| `stack` | `string \| undefined` | `undefined` | Stack ID from `--stack` flag; triggers interactive selection if absent |
| `database` | `'sqlite3' \| 'postgres' \| 'mysql'` | `'sqlite3'` | Database driver from `--database` flag |

**Validation rules**:
- `projectName`: non-empty, valid directory name characters (no path separators)
- `stack`: must be one of the 16 valid stack IDs if provided
- `database`: must be exactly `sqlite3`, `postgres`, or `mysql`

---

### StackHealthResult

Result of health endpoint polling and API verification.

| Field | Type | Description |
|-------|------|-------------|
| `healthy` | `boolean` | `true` if health endpoint returned `status: "ok"` within timeout |
| `elapsedMs` | `number` | Total time spent polling in milliseconds |
| `dbConnected` | `boolean \| undefined` | Value of `db_connected` from `/health` response |
| `error` | `string \| undefined` | Error message if polling timed out or failed |

---

### EnvSubstitutionMap

Internal representation of environment variable replacements applied to `.env.example`.

| Variable | Value Source |
|----------|-------------|
| `DB_DRIVER` | From `CreateAppOptions.database` |
| `DB_PASSWORD` | `crypto.randomBytes(32).toString('hex')` |
| `MYSQL_PASSWORD` | `crypto.randomBytes(32).toString('hex')` |
| `MYSQL_ROOT_PASSWORD` | `crypto.randomBytes(32).toString('hex')` |
| `PRISMA_DB_PROVIDER` | Derived from `DB_DRIVER` map (Node.js stacks only) |
| `DATABASE_URL` | Built from `DB_DRIVER` + generated password (Node.js stacks only) |

**Derivation table** (Node.js stacks):
| `DB_DRIVER` | `PRISMA_DB_PROVIDER` | `DATABASE_URL` |
|-------------|---------------------|----------------|
| `sqlite3` | `sqlite` | `file:/app/data/brewnet_db.db` |
| `postgres` | `postgresql` | `postgresql://brewnet:<password>@postgres:5432/brewnet_db` |
| `mysql` | `mysql` | `mysql://brewnet:<password>@mysql:3306/brewnet_db` |

---

## State Transitions

### create-app execution lifecycle

```
IDLE
  │  brewnet create-app <name> [--stack <id>] [--database <driver>]
  ▼
PRE_FLIGHT                    ← checkDocker(); check dir exists
  │  pass
  ▼
STACK_RESOLVED                ← --stack validated OR interactive selection complete
  │  valid stack selected
  ▼
CLONING                       ← git clone --depth=1 in progress
  │  success                  ← on failure: cleanup partial dir, exit BN006
  ▼
ENV_GENERATED                 ← .env written from .env.example
  │
  ▼
GIT_REINIT                    ← rm -rf .git; git init; git commit
  │
  ▼
CONTAINERS_STARTING           ← docker compose up -d --build
  │  command launched
  ▼
HEALTH_POLLING                ← GET http://127.0.0.1:<port>/health (loop, 1s interval)
  │  status=="ok"             ← on timeout: leave containers, print debug hint, exit
  ▼
ENDPOINTS_VERIFIED            ← GET /api/hello + POST /api/echo
  │  pass
  ▼
SUCCESS                       ← print success box, exit 0
```

---

## Catalog: Complete 16 Stack Entries

| ID | Language | Framework | Version | ORM | isUnified | buildSlow |
|----|----------|-----------|---------|-----|-----------|-----------|
| `go-gin` | Go | Gin | 1.22 | GORM | false | false |
| `go-echo` | Go | Echo v4 | 1.24 | GORM | false | false |
| `go-fiber` | Go | Fiber v3 | 1.25 | GORM | false | false |
| `rust-actix-web` | Rust | Actix-web 4 | 1.88 | SQLx | false | **true** |
| `rust-axum` | Rust | Axum 0.8 | 1.88 | SQLx | false | **true** |
| `java-springboot` | Java | Spring Boot 3.3 | 21 | JPA / JDBC | false | false |
| `java-spring` | Java | Spring Framework 6.2 | 21 | JDBC | false | false |
| `kotlin-ktor` | Kotlin | Ktor 3.1 | 2.1 | Exposed ORM | false | false |
| `kotlin-springboot` | Kotlin | Spring Boot 3.4 | 2.1 | JDBC / HikariCP | false | false |
| `nodejs-express` | Node.js | Express 5 | 22 | Prisma 6 | false | false |
| `nodejs-nestjs` | Node.js | NestJS 11 | 22 | Prisma 6 | false | false |
| `nodejs-nextjs` | Node.js | Next.js 15 (API Routes) | 22 | Prisma 6 | **true** | false |
| `nodejs-nextjs-full` | Node.js | Next.js 15 (Full-Stack) | 22 | Prisma 6 | **true** | false |
| `python-fastapi` | Python | FastAPI | 3.12 | SQLAlchemy 2.0 | false | false |
| `python-django` | Python | Django 6 | 3.13 | Django ORM | false | false |
| `python-flask` | Python | Flask 3.1 | 3.13 | Flask-SQLAlchemy | false | false |
