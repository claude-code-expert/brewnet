# CLAUDE.md - Brewnet Project Context

---
## MANDATORY — 모든 응답 전 반드시 확인

1. **응답 형식**: 모든 작업 완료 시 반드시 Korean summary로 마무리
   - 무엇을 변경했는지
   - 왜 그렇게 했는지
   - 주의할 점이 있는지

2. **조사 원칙**: 경로, 설정값, 코드 동작에 대해 답하기 전 반드시 소스 코드를 먼저 읽을 것. 추측으로 답변 금지.

---

## Project Overview

**Brewnet** — "Your Home Server, Brewed Fresh"

A self-hosted home server management platform that provides an interactive CLI tool and Web Dashboard (Pro) for setting up and managing personal servers with Docker-based services.

# Brewnet

Self-hosted home server management platform — interactive CLI + Web Dashboard (Pro).
Docker-based service orchestration, Traefik routing, Cloudflare Tunnel support.

## Tech Stack

| Package | Technologies |
|---------|-------------|
| `packages/cli` | TypeScript 5, Node.js 20+, Commander.js, @inquirer/prompts, execa, dockerode, better-sqlite3, simple-git |
| `packages/dashboard` | Next.js 14 App Router, Tailwind + shadcn/ui, Zustand, TanStack Query, React Hook Form + Zod, xterm.js, Monaco Editor |
| `packages/shared` | Shared TypeScript types, Zod schemas |
| System (external) | Docker Compose, Traefik, Nginx, Certbot, SQLite, Gitea, Cloudflare Tunnel |

## Project Structure
@PROJECT_STRUCTURE.md

## CLI Commands
@CLI_REFERENCE.md

## Database Schema
@DATABASE.md

## Spec Documents
@SPEC_REFERENCE.md

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

## Language Policy

- Code, variable names, comments, git commits: **English**
- User-facing responses, summaries, explanations: **Korean**
- Error messages: keep original English text; describe cause and fix in Korean

## Investigation Rules

- Always read source code before answering questions about paths, config values, or behavior. No guessing.
- When the same problem recurs, identify root cause at source level before patching.
- After a code change, do not declare success based on build passing alone — trace the actual runtime path in source to confirm the fix works.
- After /compact, re-read CLAUDE.md before continuing work.

## Process Rules

- Do not make arbitrary decisions on behavior not defined in spec (error recovery, UX flows, etc.) — ask the user first.
- When an error occurs, do not only provide manual fix instructions — auto-recover if possible, then report the result.
- Before reporting a test as "passing", verify the actual user-facing path — direct port curl and browser External URL are different paths.

## Guardrails

### Code
- Never silently swallow errors with `.catch(() => {})` — at minimum log them
- Never use `console.log` directly — use the project logger

### Git
- Never run: `git push --force`, `git reset --hard`, `git commit --no-verify`
- Never auto-commit or auto-push — only on explicit user request

### Admin Dashboard
- `admin-server.ts` is complete — do not change logic or structure without an explicit prior request; UI edits only
- For Admin UI debugging, always start the dev server with `pnpm --filter @brewnet/admin-ui dev` (runs at `localhost:5173`)

## Response Format

Always end every completed task with a Korean summary covering:
- What was changed
- Why it was changed
- Any caveats to be aware of

## Problem Solve Reference

- Change history: `CHANGELOG.md`
- Error resolution history: `troubleshooting/*.md`

@.claude/rules/gotchas.md

