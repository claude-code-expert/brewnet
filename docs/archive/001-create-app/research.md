# Research: brewnet create-app

**Date**: 2026-03-02
**Branch**: `001-create-app`
**Status**: Complete — no NEEDS CLARIFICATION markers in spec

---

## 1. Stack Catalog Structure

**Decision**: New `packages/cli/src/config/stacks.ts` (not extending existing `frameworks.ts`)

**Rationale**: The existing `frameworks.ts` uses internal wizard IDs (`nextjs-app`, `springboot-kt`) that differ from the `brewnet-boilerplate` branch names (`nodejs-nextjs`, `kotlin-springboot`). Creating a separate catalog avoids polluting the wizard configuration and keeps a clean mapping from branch ID to stack metadata.

**Alternatives considered**:
- Extend `frameworks.ts` with boilerplate IDs → Rejected: confuses two different ID schemes
- Store catalog in `packages/shared/` → Rejected: boilerplate repo URL and branch names are CLI concerns, not shared

---

## 2. Health Polling Mechanism

**Decision**: Native `fetch()` API (Node.js 20+ built-in) with `AbortSignal.timeout(3000)` per attempt

**Rationale**:
- Node.js 20+ includes `fetch` as a global; no extra dependency needed
- `AbortSignal.timeout(3000)` provides clean per-request timeout
- The existing `health-checker.ts` uses Dockerode for container state polling, which is different from HTTP endpoint polling; no conflict
- `127.0.0.1` must be used instead of `localhost` because Alpine Linux resolves `localhost` to `::1` (IPv6) and backend containers typically listen on IPv4 only

**Alternatives considered**:
- Reuse `checkEndpointReachable()` from `health-checker.ts` → Insufficient: it does HEAD request without body parsing; we need to check `body.status === "ok"`
- `axios` or `node-fetch` → Unnecessary: `fetch` is available natively in Node.js 20+

---

## 3. Secret Generation

**Decision**: `crypto.randomBytes(32).toString('hex')` for all database passwords

**Rationale**:
- Produces 64-character hex strings — cryptographically random, maximum entropy
- Matches the exact pattern specified in `CONNECT_BOILERPLATE.md` Section 4 (authoritative source)
- Distinct from existing `generatePassword()` in `utils/password.ts` which uses a confusion-free charset for human-readable passwords; DB passwords never need to be human-readable

**Alternatives considered**:
- Reuse `generatePassword()` → Produces shorter, human-readable passwords; DB secrets should be maximum entropy hex

---

## 4. Env File Generation Approach

**Decision**: Regex line-by-line replacement on `.env.example` content (regex: `/^VARIABLE=.*/m`)

**Rationale**:
- Preserves all comments, blank lines, and formatting from `.env.example`
- Simple and predictable: replaces only the specific lines that need changing
- Matches the exact pattern in `CONNECT_BOILERPLATE.md` Section 4 (the authoritative TypeScript pseudocode)
- No YAML/TOML parser needed — `.env` files are simple `KEY=VALUE` format

**Alternatives considered**:
- Parse `.env` into an object, modify, serialize → Would lose comments and file structure
- Template-based generation → Would require maintaining 16 separate env templates; error-prone

---

## 5. Docker Pre-flight Check

**Decision**: Reuse `checkDocker()` from `packages/cli/src/services/system-checker.ts`

**Rationale**:
- `checkDocker()` already handles: binary existence check, daemon running check, Compose V2 check, version validation
- Returns a `CheckResult` with `status: 'fail'` and `remediation` if Docker is not running
- Avoids duplication of Docker validation logic

**Integration**: Call `checkDocker()`, check `result.status !== 'pass'`, throw `BrewnetError.dockerNotRunning()` (BN001)

---

## 6. Git Re-initialization

**Decision**: Run `rm -rf .git && git init && git add -A && git commit -m "chore: initial project from brewnet create-app"` via execa

**Rationale**:
- Severs the scaffolded project from the boilerplate git history
- Gives the developer a clean starting point for their own repository
- Follows the pattern specified in `CONNECT_BOILERPLATE.md` Step 6
- `execa` is already in the dependency tree and used throughout the codebase

**Note**: On Windows this would need `rmdir /s /q .git` but the target platforms are macOS and Linux only (per constitution)

---

## 7. Container Startup and Port Assignment

**Decision**: Use `docker compose up -d --build` via execa in the project directory

**Rationale**:
- `--build` ensures fresh images are built (required for first run)
- `-d` detaches (non-blocking); health polling handles readiness
- No need to pass `--project-name` explicitly; Docker Compose uses the directory name by default

**Port routing**:
- Standard stacks (`isUnified = false`): backend port 8080, frontend port 3000
- Unified stacks (`isUnified = true`, nodejs-nextjs*): single port 3000

**Timeout values** (from CONNECT_BOILERPLATE.md):
- Default (non-Rust): 120 seconds
- Rust stacks (`buildSlow = true`): 600 seconds

---

## 8. Interactive Stack Selection

**Decision**: Two-step `@inquirer/prompts select` prompt — language first, then framework

**Rationale**:
- `@inquirer/prompts` is already in the dependency tree and used in the wizard
- Two-step selection reduces choices per prompt (6 languages vs 16 stacks at once)
- Matches user mental model: "I know I want Go, then I'll choose Gin/Echo/Fiber"
- The `--stack` flag bypasses both prompts entirely for non-interactive use

---

## 9. Error Recovery on Partial Failure

**Decision**:
- Clone failure → remove partial directory, exit with error message
- Health timeout → leave containers running, print `docker compose logs` hint, exit with error
- Ctrl+C (SIGINT) → remove partial directory if clone not yet complete; leave project if containers are already running

**Rationale**:
- Clone failure: directory is empty/partial and useless; cleanup prevents confusion
- Health timeout: containers may have useful logs; developer needs them to diagnose; tearing down destroys evidence
- Ctrl+C after containers start: developer may want to inspect the partially-started environment

---

## 10. Codebase Compatibility Findings

| Area | Finding |
|------|---------|
| `frameworks.ts` | Existing wizard stack IDs differ from boilerplate branch IDs — do NOT extend |
| `health-checker.ts` | HTTP endpoint checking exists (`checkEndpointReachable`) but uses HEAD only; boilerplate check needs GET + body parse |
| `password.ts` | `generatePassword()` unsuitable for DB secrets (charset-based, shorter); use `crypto.randomBytes` directly |
| `system-checker.ts` | `checkDocker()` reusable as-is for pre-flight check |
| `utils/errors.ts` | BN001 (docker not running), BN006 (build failed), BN008 (resource not found) map to relevant error states |
| `index.ts` | 12 commands registered; `create-app` will be the 13th |
| ESM modules | All files use `.js` extension in imports (ESM requirement) |
