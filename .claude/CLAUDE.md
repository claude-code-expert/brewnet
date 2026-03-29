# CLAUDE.md — Brewnet Project

> Self-hosted home server management platform.
> "Your Home Server, Brewed Fresh"
> This is a public open-source project. Every decision must meet production quality standards.

---

## ⚠️ MANDATORY — Every Session, Every Response

1. **Source first**: Never answer questions about paths, config values, or runtime behavior
   without reading the actual source code. No guessing, no assumptions.

2. **After /compact**: Re-read this file in full before continuing any work.

3. **Korean summary required**: Every completed task must end with a Korean summary:
   - 무엇을 변경했는지
   - 왜 그렇게 했는지
   - 주의할 점이 있는지

4. **No partial completion**: If a task cannot be completed fully, stop and report
   what is blocking — never commit or leave code in a half-finished state.

5. **New bug pattern discovered**: Add it to `.claude/rules/gotchas.md` immediately.
   Do not assume it will be remembered.

---

## Project Overview

Brewnet is a self-hosted home server management platform providing an interactive CLI
and Web Dashboard (Pro) for setting up and managing personal servers with Docker-based services.

## Tech Stack

| Package | Technologies |
|---------|-------------|
| `packages/cli` | TypeScript 5, Node.js 20+, Commander.js, @inquirer/prompts, execa, dockerode, better-sqlite3, simple-git |
| `packages/dashboard` | Next.js 14 App Router, Tailwind + shadcn/ui, Zustand, TanStack Query, React Hook Form + Zod, xterm.js, Monaco Editor |
| `packages/shared` | Shared TypeScript types, Zod schemas |
| System | Docker Compose, Traefik, Nginx, Certbot, SQLite, Gitea, Cloudflare Tunnel |

## References
@PROJECT_STRUCTURE.md
@CLI_REFERENCE.md
@DATABASE.md
@SPEC_REFERENCE.md
@.claude/rules/gotchas.md

---

## Installation Flow (Wizard)
```
Step 0  System check (OS, Docker, ports, disk)
Step 1  Project setup (name, path, Full / Partial Install)
Step 2  Admin account + Server components (Web/File/App/DB/Media)
Step 3  Runtime & Boilerplate (language, framework) — appServer only
Step 4  Domain & Network (Local / Cloudflare Tunnel, SSL)
Step 5  Review & Confirm
Step 6  Docker Compose generation → service startup → credential propagation → access verify
Step 7  Complete (endpoints, credentials, tunnel status)
```

---

## Language Policy

- Code, variable names, comments, git commits: **English**
- User-facing responses, summaries, explanations: **Korean**
- Error messages: keep original English text; describe cause and fix in Korean

---

## Investigation Rules

- Always read source code before answering questions about paths, config values, or behavior.
- When the same problem recurs, identify root cause at source level before patching.
- After a code change, do not declare success based on build passing alone —
  trace the actual runtime path in source to confirm the fix works.
- Never propose workarounds. This is an open-source project — identify what is
  structurally wrong and apply a complete patch so the issue never recurs.

## Process Rules

- Do not make arbitrary decisions on behavior not defined in spec
  (error recovery, UX flows, etc.) — ask the user first.
- When an error occurs, auto-recover if possible, then report the result.
  Do not only provide manual fix instructions.
- Before reporting a test as "passing", verify the actual user-facing path —
  direct port curl and browser External URL are different paths.
- Never guess External URLs from the client side —
  always derive from server-side Traefik label resolution.
- When calling external APIs (Cloudflare, Gitea, etc.), always use upsert patterns —
  never assume a resource does not already exist.

---

## Guardrails

### Code Quality
- Never use `any` type in TypeScript — use proper types or `unknown` with narrowing
- Never use regex literals (`/.../`) inside template literals —
  use `new RegExp('...')` to avoid template escape consuming `\/` as `//`
- Never silently swallow errors with `.catch(() => {})` — at minimum log them
- Never use `console.log` directly — use the project logger
- Never hardcode secrets, credentials, API keys, or tokens in source code
- Never commit `.env` files or files containing real credentials

### Testing
- All new features and bug fixes require a test
- Never mark a task complete if the affected code path has no test coverage
- Tests must cover both the success path and the primary failure path

### Versioning
- Follow semver strictly: breaking CLI changes require a major bump
- Never make a breaking change to a public CLI command without explicit user approval
- Document breaking changes in `CHANGELOG.md` before release

### Git
- Never run: `git push --force`, `git reset --hard`, `git commit --no-verify`
- Never auto-commit or auto-push — only on explicit user request

### Docker & System
- Never run: `docker system prune`, `docker volume rm`, `docker network rm`
  without explicit user approval and confirmation that data is expendable
- Never remove named volumes — they may contain user data (Nextcloud, Gitea, DB)
- Never modify a running production container directly — always go through compose

### Critical Files — Explicit User Approval Required
- `docker-compose.yml` and `docker-compose.*.yml` — infrastructure definition
- `traefik/` config — routing and SSL termination
- `packages/shared/` types and Zod schemas — breaking changes affect all packages
- `packages/*/package.json` dependencies — require justification before change
- `.env.example` — user onboarding template; changes affect first-run experience
- `admin-server.ts` — logic and structure are frozen; UI edits only

### Release & Deployment
- **Version bump MUST be committed and pushed before tagging.**
  GitHub Actions builds from the remote branch, not local state.
  Uncommitted version changes result in silent publish failures.
- Release sequence: version bump commit → push → tag → push tag.
  Never create a tag before the version bump commit is on remote.
- Use `bash scripts/release.sh` (dry-run) to verify before `--publish`.
  Step 1 pre-flight catches uncommitted changes, wrong branch, stale tags.
- `packages/cli/package.json` is the single source of truth for npm version.
  Root `package.json` version is irrelevant to npm publish.
- Tag format: `v{version}` (e.g., `v0.0.11`). Tags trigger `.github/workflows/publish.yml`.
- After publish, verify: `npm view @brewnet/cli version` (npm registry may cache for ~30s).
- **Two install paths exist** — changes must work for both:
  - `npm install -g @brewnet/cli` → npm registry tarball
  - `curl install.sh` → git clone + local build from main branch
- `install.sh` uses `git fetch --depth 1 + reset --hard` (not `pull --ff-only`)
  to handle shallow clone + merge commit history correctly.
- Never modify `install.sh` without testing on a clean machine
  (or `rm -rf ~/.brewnet/source && curl ... | bash`).

---

## Troubleshooting Reference

- Change history: `CHANGELOG.md`
- Error resolution history: `troubleshooting/*.md`
- Project-specific bug patterns: `.claude/rules/gotchas.md`