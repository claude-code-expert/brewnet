# CLI Contract: brewnet create-app

**Type**: CLI command schema
**Version**: 1.0.0
**Date**: 2026-03-02

---

## Command Signature

```
brewnet create-app <project-name> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<project-name>` | Yes | Name of the project directory to create. Must not already exist. |

### Options

| Flag | Default | Valid Values | Description |
|------|---------|-------------|-------------|
| `--stack <STACK_ID>` | (interactive) | See 16 valid IDs below | Pre-select a boilerplate stack; skips interactive prompts |
| `--database <DB_DRIVER>` | `sqlite3` | `sqlite3`, `postgres`, `mysql` | Database driver to configure |
| `--help` | — | — | Display help for the command |

### Valid Stack IDs

```
go-gin           go-echo          go-fiber
rust-actix-web   rust-axum
java-springboot  java-spring
kotlin-ktor      kotlin-springboot
nodejs-express   nodejs-nestjs    nodejs-nextjs    nodejs-nextjs-full
python-fastapi   python-django    python-flask
```

---

## Exit Codes

| Code | Condition |
|------|-----------|
| `0` | Success — application scaffolded and running |
| `1` | Error — see stderr for details and error code |

---

## Standard Behavior

### Non-interactive mode (both flags provided)

```bash
brewnet create-app my-api --stack go-gin --database postgres
```

- No prompts shown
- Proceeds directly through all 10 steps
- Suitable for scripts and CI environments

### Interactive mode (no `--stack` flag)

```bash
brewnet create-app my-app
```

Presents two sequential prompts:
1. "Select a language" — 6 choices
2. "Select a framework" — choices filtered to selected language

### Mixed mode (`--database` provided, no `--stack`)

```bash
brewnet create-app my-app --database mysql
```

Interactive language/framework selection, but database is pre-configured.

---

## Execution Steps (observable behavior)

Each step displays a spinner with descriptive text:

| Step | Spinner Text | Action |
|------|-------------|--------|
| 1 | `Cloning stack/<id> from brewnet-boilerplate…` | git clone --depth=1 |
| 2 | `Generating .env with secure credentials…` | Read .env.example, write .env |
| 3 | `Initializing git repository…` | rm -rf .git; git init; git commit |
| 4 | `Building and starting containers…` | docker compose up -d --build |
| 5 | `Waiting for backend to become healthy… (Xs elapsed)` | Poll /health |
| 6 | `Verifying API endpoints…` | GET /api/hello + POST /api/echo |

---

## Success Output Format

```
┌─────────────────────────────────────────────────────┐
│  ✅ <project-name> is ready!                        │
│                                                     │
│  Frontend  →  http://localhost:3000                 │
│  Backend   →  http://localhost:8080                 │
│  Stack     →  go-gin (Go · Gin · GORM)              │
│  Database  →  sqlite3 (no external container)       │
│                                                     │
│  cd <project-name>                                  │
│  make logs     # view container logs                │
│  make down     # stop containers                    │
└─────────────────────────────────────────────────────┘
```

**Unified stack variant** (`nodejs-nextjs*`):
```
│  App (UI + API)  →  http://localhost:3000           │
```
(No separate Backend line)

---

## Error Output Format

All errors include:
- Error code (BN001–BN010 or descriptive name)
- Human-readable message
- Actionable remediation hint

### Error Examples

**BN001 — Docker not running**:
```
Error [BN001]: Docker daemon is not running

  Docker is required to scaffold applications. Please start Docker and try again.

  Fix:
    macOS:  Open Docker Desktop
    Linux:  sudo systemctl start docker
```

**Directory conflict**:
```
Error: Directory "my-api" already exists.

  Choose a different project name or remove the existing directory first.

  Fix:
    rm -rf my-api    # if you want to start fresh
    brewnet create-app my-api-v2  # use a different name
```

**Invalid stack ID**:
```
Error: Unknown stack ID "go-turbo".

  Valid stack IDs:
    go-gin, go-echo, go-fiber, rust-actix-web, rust-axum,
    java-springboot, java-spring, kotlin-ktor, kotlin-springboot,
    nodejs-express, nodejs-nestjs, nodejs-nextjs, nodejs-nextjs-full,
    python-fastapi, python-django, python-flask
```

**Health check timeout**:
```
Error: Stack did not become healthy within 120 seconds.

  To diagnose, run:
    cd my-api
    docker compose logs backend

  The containers are still running. Run "make down" to stop them.
```

---

## Port Conventions

| Stack Type | Backend URL | Frontend URL |
|-----------|------------|-------------|
| Standard (`isUnified = false`) | `http://localhost:8080` | `http://localhost:3000` |
| Unified (`isUnified = true`) | `http://localhost:3000` | (same) |

---

## Rust Stack Warning

Displayed before build starts when a Rust stack is selected:

```
⚠  Rust Warning: First build may take 3-10 minutes due to Rust compilation.
   Health check timeout extended to 10 minutes. Please be patient.
```

---

## Healthcheck Verification Contract

After containers start, the command verifies these endpoints in order:

| Step | Method | Path | Pass Condition |
|------|--------|------|---------------|
| 1 | GET | `/health` | HTTP 200 AND `body.status === "ok"` |
| 2 | GET | `/api/hello` | HTTP 200 AND `body.message` field exists |
| 3 | POST | `/api/echo` | HTTP 200 AND `body.test === "brewnet"` |
