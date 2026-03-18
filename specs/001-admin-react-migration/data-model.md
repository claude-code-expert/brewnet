# Data Model: Admin UI React Migration

**Branch**: `001-admin-react-migration` | **Date**: 2026-03-18

---

## Overview

This migration does not introduce new data entities or change any persisted data. All entities below are **pre-existing** — they are fetched from existing REST API endpoints. This document maps each UI data need to its API source.

---

## API → UI Data Mapping

### Dashboard Page (`/`)

| UI Data | API Endpoint | Response Shape |
|---|---|---|
| Services list + status | `GET /api/services` | `{ services: ServiceInfo[] }` |
| Log entries | `GET /api/logs` | `{ logs: LogEntry[], total: number }` |
| Log stats | `GET /api/logs/stats` | `{ total, bySource, byLevel }` |
| Domain connections | `GET /api/domain/list` | `{ connections: DomainConnection[], tunnel?, credentialsConfigured }` |
| Boilerplate stacks | `GET /api/apps/boilerplates` | `{ boilerplates: BoilerplateMeta[] }` |
| Admin info + domain config | `GET /api/config` *(new)* | `{ adminUsername, passwordHint, domainProvider, quickTunnelUrl, zoneName, tunnelId }` |
| Service detail modals | `GET /api/services/catalog` *(new)* | `{ catalog: ServiceDetailMap, aliases: NameAliasMap }` |

### Apps Page (`/apps`)

| UI Data | API Endpoint | Response Shape |
|---|---|---|
| App list | `GET /api/apps` | `{ apps: AppEntry[] }` |
| Create app job status | `GET /api/apps/jobs/:jobId` | `{ jobId, status, progress, logs, error? }` |
| Gitea repos | `GET /api/git/repos` | `{ repos: GiteaRepo[] }` (silent fallback on 502) |
| Cloudflare settings | `GET /api/settings/cloudflare` | `{ configured, apiTokenSet, accountId, zoneId, tunnelId, ... }` |

### App Detail Page (`/apps/:name`)

| UI Data | API Endpoint | Response Shape |
|---|---|---|
| App metadata | `GET /api/apps/:name` | `{ app: AppInfo }` |
| Git info | `GET /api/apps/:name/git` | `{ git: { branch, remote, isDirty } }` |
| Deploy settings | `GET /api/apps/:name/deploy/settings` | `{ settings: DeploySettings }` |
| Deploy history | `GET /api/deploy/history?app=:name` | `{ history: DeploymentRecord[] }` |
| Live logs (SSE) | `GET /api/apps/:name/logs` | `text/event-stream` |
| Domain connections | `GET /api/domain/list` | (same as dashboard) |
| Available apps for domain | `GET /api/domain/apps` | `{ apps: [{ name, port, type }] }` |

---

## New API Endpoints (to be added to admin-server.ts)

### `GET /api/config`

Returns read-only config visible on the dashboard. No auth required (returns masked/non-sensitive data only).

```typescript
interface AdminConfigResponse {
  adminUsername: string;   // e.g., "admin"
  passwordHint: string;    // Masked: "a****n" (first + last chars)
  domainProvider: 'local' | 'tunnel' | 'quick-tunnel';
  quickTunnelUrl: string;  // e.g., "https://abc-xyz.trycloudflare.com" or ""
  zoneName: string;        // e.g., "example.com" or ""
  tunnelId: string;        // Cloudflare Tunnel UUID or ""
}
```

**Implementation**: Reads from `wizardState` (same data already computed for `dashConfig` at L1124–1134 in admin-server.ts). Calls `detectQuickTunnelUrl()` lazily.

### `GET /api/services/catalog`

Returns the service detail modal data. No auth required (static metadata).

```typescript
interface ServiceCatalogResponse {
  catalog: Record<string, ServiceDetail>;  // SERVICE_DETAIL_MAP
  aliases: Record<string, string>;          // NAME_ALIASES
}

interface ServiceDetail {
  displayName: string;
  description: string;
  features: string[];
  tips?: string[];
  credentialKeys?: string[];  // e.g., ["ADMIN_USERNAME", "ADMIN_PASSWORD"]
  externalUrl?: string;
  docsUrl?: string;
}
```

**Implementation**: Move `SERVICE_DETAIL_MAP` and `NAME_ALIASES` from `status-page.ts` to a new handler in `admin-server.ts`. The data is static and can be inlined in the handler.

---

## Existing Entity Types (unchanged, for reference)

### AppEntry
```typescript
interface AppEntry {
  name: string;
  status: 'running' | 'stopped' | 'building' | 'error';
  port: number;
  appDir: string;
  lastDeployedAt?: string;   // ISO 8601; absent = never deployed
  localUrl?: string;
  externalUrl?: string;
}
```

### BoilerplateMeta
```typescript
interface BoilerplateMeta {
  stackId: string;
  appDir: string;
  lang?: string;
  frameworkId?: string;
  gitBranch?: string;
  status?: 'running' | 'stopped' | 'building';
  backendUrl?: string;
  frontendUrl?: string;
  isUnified?: boolean;
}
```

### DomainConnection
```typescript
interface DomainConnection {
  appName: string;
  subdomain: string;
  domain: string;
  hostname: string;
  tunnelId: string;
  cnameRecordId: string;
  containerPort: number;
  connectedAt: string;
  scenario: 'A' | 'B' | 'C';
}
```

### LogEntry
```typescript
interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  source: 'cli' | 'tunnel' | 'access' | 'service';
  message: string;
  service?: string;
}
```

---

## State Transitions

### App Status FSM

```
[never deployed] → Deploy → [building] → success → [running]
                                        → failure → [error]
[running]        → Stop   → [stopped]
[stopped]        → Start  → [running]   (blocked if never deployed)
[running/stopped] → Delete → [removed]
```

**UI rule**: Start button blocked with toast when `lastDeployedAt` is absent (spec FR-009).

### App Creation Job FSM

```
[pending] → job started → [in-progress] → success → [complete]
                                         → failure → [failed]
```

Polled via `GET /api/apps/jobs/:jobId` every 1 second until terminal state.

---

## React Component → API Fetch Map

| Component | Fetches on Mount | Polls |
|---|---|---|
| `<Dashboard>` | `/api/services`, `/api/config`, `/api/domain/list`, `/api/apps/boilerplates`, `/api/services/catalog` | `/api/services` every 5s |
| `<LogsTab>` (in Dashboard) | `/api/logs/stats`, `/api/logs` | None (manual filter trigger) |
| `<Apps>` | `/api/apps`, `/api/git/repos` (silent fallback) | `/api/apps` every 5s |
| `<SettingsTab>` (in Apps) | `/api/settings/cloudflare` (on tab switch) | None |
| `<AppDetail>` | `/api/apps/:name`, `/api/apps/:name/git`, `/api/apps/:name/deploy/settings` | `/api/apps/:name` every 5s |
| `<DeploymentTab>` | `/api/deploy/history?app=:name` | None |
| `<LogsTab>` (in AppDetail) | EventSource `/api/apps/:name/logs` | SSE stream (auto) |
| `<DomainTab>` | `/api/domain/list`, `/api/domain/apps` | None |
