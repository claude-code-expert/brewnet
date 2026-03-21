# brewnet Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-25

## Language Rules

- All code, comments, and variable names in English.
- Result summaries and next step explanations in Korean.

## Active Technologies
- TypeScript 5.x strict mode, Node.js 20+ (ESM) + Commander.js, @inquirer/prompts, chalk, ora, cli-table3, dockerode, execa, js-yaml, better-sqlite3, zod, conf, tsup (001-cli-init-wizard)
- better-sqlite3 (local SQLite at `~/.brewnet/db/`), JSON state files at `~/.brewnet/projects/<name>/selections.json` (001-cli-init-wizard)
- TypeScript 5.x strict mode, Node.js 20+ (ESM) + Commander.js, @inquirer/prompts, chalk, ora, execa, dockerode, js-yaml, better-sqlite3, zod (001-cf-tunnel-setup)
- `~/.brewnet/config.json` (wizard state), `~/.brewnet/logs/tunnel.log` (new tunnel audit log) (001-cf-tunnel-setup)
- TypeScript 5.x strict mode, Node.js 20+ + Commander.js, @inquirer/prompts, chalk, ora, execa, zod, node:crypto (built-in), node:fs (built-in) (001-create-app)
- N/A (no `~/.brewnet/db/` writes; scaffolded project is self-contained on disk) (001-create-app)
- TypeScript 5.x strict mode, Node.js 20+ (ESM) + Commander.js, @inquirer/prompts, chalk, ora, cli-table3, dockerode, execa, js-yaml, zod (003-domain-external-access)
- `~/.brewnet/projects/<name>/selections.json` (project state, adding `domainConnections[]`) (003-domain-external-access)
- TypeScript 5.x strict mode, Node.js 20+ (ESM) + Commander.js, dockerode, js-yaml, chalk, ora, cli-table3, execa, zod (004-centralized-logging)
- File-based (JSONL, NDJSON, JSON access logs) + Docker json-file driver (004-centralized-logging)
- TypeScript 5.x strict mode, Node.js 20+ + `packages/cli` — no new dependencies. Inline HTML/CSS/JS generation via template literal in `apps-page.ts` (005-app-deploy-ui)
- `~/.brewnet/apps.json` (AppEntry[] registry), in-memory AppJob Map (005-app-deploy-ui)
- TypeScript 5.x (packages/cli unchanged) + TypeScript 5.5 (packages/admin-ui, React build) (001-admin-react-migration)
- No new storage. wizardState persisted to `~/.brewnet/projects/<name>/selections.json` (unchanged). (001-admin-react-migration)
- TypeScript 5.x strict mode (frontend + backend), Node.js 20+ (ESM) (006-domain-settings)
- WizardState JSON at `~/.brewnet/projects/<name>/selections.json` — no schema changes required (006-domain-settings)

- TypeScript 5.x strict mode, Node.js 20+ (ESM) + Commander.js, @inquirer/prompts, chalk, ora, cli-table3, dockerode, execa, js-yaml, better-sqlite3, zod, conf (001-cli-init-wizard)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x strict mode, Node.js 20+ (ESM): Follow standard conventions

## Recent Changes
- 006-domain-settings: Added TypeScript 5.x strict mode (frontend + backend), Node.js 20+ (ESM)
- 001-admin-react-migration: Added TypeScript 5.x (packages/cli unchanged) + TypeScript 5.5 (packages/admin-ui, React build)
- 005-app-deploy-ui: Added TypeScript 5.x strict mode, Node.js 20+ + `packages/cli` — no new dependencies. Inline HTML/CSS/JS generation via template literal in `apps-page.ts`


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
