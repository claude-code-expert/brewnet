# Research: App Deploy UI

**Branch**: `005-app-deploy-ui` | **Date**: 2026-03-16

## Finding 1: All Required Backend Routes Already Exist

**Decision**: No new backend routes needed. All API endpoints the new UI requires are already implemented in `admin-server.ts`.

| UI Action | Route | Status |
|-----------|-------|--------|
| Load app list | `GET /api/apps` | ✅ Exists (L1246) |
| Create app (3 modes) | `POST /api/apps/create` | ✅ Exists (L1292) |
| Poll job progress | `GET /api/apps/jobs/:jobId` | ✅ Exists (L1298) |
| Start app | `POST /api/apps/:name/start` | ✅ Exists (L1304) |
| Stop app | `POST /api/apps/:name/stop` | ✅ Exists (L1309) |
| Delete app | `DELETE /api/apps/:name` | ✅ Exists (L1314) |
| Deploy app | `POST /api/apps/:name/deploy` | ✅ Exists (L1356) |
| Stream build logs | `GET /api/apps/:name/logs` (SSE) | ✅ Exists (L1363) |
| List Gitea repos | `GET /api/git/repos` | ✅ Exists (L1401) |
| Domain connect | `POST /api/domain/connect` | ✅ Exists (L1444) |
| Domain disconnect | `DELETE /api/domain/disconnect/:name` | ✅ Exists (L1448) |
| List domains | `GET /api/domain/list` | ✅ Exists (L1436) |

**Rationale**: Backend was implemented independently. This feature is purely a UI replacement.

**Alternatives considered**: Adding a `POST /api/apps/:name/build` endpoint for Build-only (no deploy) — rejected because `app-manager.ts` has no separate build step. Build is always part of deploy in the current implementation. The UI "Build" button will map to `POST /api/apps/:name/deploy` in Phase 1.

---

## Finding 2: AppEntry Status Mismatch

**Decision**: Map `AppEntry.status` values to UI status strings at the rendering layer.

| Backend (`AppEntry.status`) | UI Display |
|-----------------------------|-----------|
| `'creating'` | `building` |
| `'running'` | `running` |
| `'stopped'` | `stopped` |
| `'failed'` | `stopped` (with error indicator) |

**Rationale**: The HTML prototype uses 3 states (`running/stopped/building`). Backend has 4 states. Mapping `creating` → `building` is semantically correct. `failed` maps to `stopped` with a visual indicator in the last-action field.

---

## Finding 3: Build vs Deploy — Both Map to Deploy API

**Decision**: Both "Build" and "Deploy" buttons in the UI call `POST /api/apps/:name/deploy`. The progress modal steps differ only visually.

- **Build button** → `POST /api/apps/:name/deploy` → shows Build steps (4 steps: pull, parse Dockerfile, build image, tag)
- **Deploy button** → `POST /api/apps/:name/deploy` → shows Deploy steps (6 steps: pull, build, stop old, start new, Traefik routing, health check)

**Rationale**: `app-manager.ts` has no separate build-only path. The `deployApp()` function handles the full pipeline. The distinction is presentational.

**AppJob steps from backend** (6 steps): `['Validating', 'Gitea setup', 'Gitea repo', 'Git push', 'Docker up', 'Health check']`

These map to the Deploy modal. Build modal shows the first 4 steps only.

---

## Finding 4: Port Conflict Detection Location

**Decision**: Port conflict check happens in the browser UI before form submission, calling a new lightweight `GET /api/apps/check-port?port=<N>` endpoint.

**Rationale**: `findFreePort()` exists in `boilerplate-manager.ts` but is used internally for auto-assignment, not for user-facing validation. Adding a simple port-check endpoint is the cleanest approach for real-time UI feedback.

**Alternative considered**: Validate at `POST /api/apps/create` and return error — rejected because the spec requires a warning in the UI *while the user is typing*, before submission.

---

## Finding 5: `connectRepoToApp` — Needs New API Call

**Decision**: Connect a Gitea repo to an existing app by calling a new endpoint `POST /api/git/repos/:name/connect` with `{ appName }` body.

**Rationale**: The HTML prototype's `connectRepoToApp()` function currently shows a toast only. A real implementation needs to update the app registry to associate the repo. This requires a minimal new route in `admin-server.ts`.

---

## Finding 6: Log Streaming — SSE Exists

**Decision**: Use the existing `GET /api/apps/:name/logs` SSE endpoint for real-time log output in the progress modal.

**Rationale**: SSE (Server-Sent Events) is already implemented. The progress modal's log output section will consume this stream during Build/Deploy.

---

## Finding 7: Gitea Repo Endpoint Name

**Decision**: Use `GET /api/git/repos` (not `/api/gitea/repos` as assumed in plan).

**Rationale**: Route is `GET /api/git/repos` (L1401 of admin-server.ts). The HTML prototype's JS must be updated to use this correct path.
