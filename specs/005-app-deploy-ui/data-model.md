# Data Model: App Deploy UI

**Branch**: `005-app-deploy-ui` | **Date**: 2026-03-16

## Entities

### AppEntry (existing — `~/.brewnet/apps.json`)

```typescript
interface AppEntry {
  name: string;           // Unique identifier, lowercase-hyphen
  mode: 'boilerplate' | 'git-url' | 'new-project';
  stackId?: string;       // Mode A only
  sourceUrl?: string;     // Mode B only
  appDir: string;         // Absolute path to app directory
  lang?: string;          // e.g., 'nodejs', 'python', 'go'
  framework?: string;     // e.g., 'express', 'fastapi', 'gin'
  port: number;           // Local HTTP port
  giteaRepoUrl?: string;  // e.g., 'http://localhost/git/admin/my-app'
  status: 'creating' | 'running' | 'stopped' | 'failed';
  createdAt: string;      // ISO 8601
}
```

**UI status mapping**:
- `creating` → displays as `building` (amber, animated)
- `running` → displays as `running` (green, pulse)
- `stopped` → displays as `stopped` (red)
- `failed` → displays as `stopped` with last-action showing error message

---

### AppJob (in-memory, polled via `/api/apps/jobs/:jobId`)

```typescript
interface AppJob {
  jobId: string;           // 16-char hex
  appName: string;
  status: 'running' | 'done' | 'failed';
  steps: AppJobStep[];
  error?: string;
}

interface AppJobStep {
  label: string;           // e.g., 'Validating', 'Gitea setup'
  status: 'pending' | 'running' | 'done' | 'failed';
  message?: string;        // Optional detail line for log output
}
```

---

### GiteaRepo (from `GET /api/git/repos`)

```typescript
interface GiteaRepo {
  name: string;
  description: string;
  private: boolean;
  stars: number;
  language: string;
  updatedAt: string;       // ISO 8601
  cloneUrl: string;
  appName?: string;        // If linked to an AppEntry
}
```

---

### DomainConnection (from `GET /api/domain/list`)

```typescript
interface DomainConnection {
  appName: string;
  domain: string;          // Full domain, e.g., 'myapp.example.com'
  mode: 'cloudflare' | 'manual' | 'subdomain';
  active: boolean;
}
```

---

## UI State (client-side only, not persisted)

```typescript
// App list page state
interface AppsPageState {
  apps: AppEntry[];
  repos: GiteaRepo[];
  domains: DomainConnection[];
  filterState: 'all' | 'running' | 'stopped' | 'building';
  activeJobId: string | null;   // Currently polling job
  activeAppId: string | null;   // App with open domain modal
  pendingDeleteId: string | null;
}
```

---

## State Transitions

```
App status transitions:
  POST /api/apps/create         → creates AppEntry (status: creating)
  Job reaches 'done'            → AppEntry.status = 'stopped'
  POST /api/apps/:name/deploy   → AppEntry.status = 'creating' during job
  Job 'done' from deploy        → AppEntry.status = 'running'
  POST /api/apps/:name/start    → AppEntry.status = 'running'
  POST /api/apps/:name/stop     → AppEntry.status = 'stopped'
  Job 'failed'                  → AppEntry.status = 'failed'
  DELETE /api/apps/:name        → AppEntry removed from registry
```

---

## Button Enable/Disable Matrix

| Status | Build | Deploy | Start | Stop | Delete |
|--------|-------|--------|-------|------|--------|
| `running` | ✅ | ✅ | ❌ | ✅ | ❌ (blocked) |
| `stopped` | ✅ | ✅ | ✅ | ❌ | ✅ (name confirm) |
| `building` (creating) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `failed` | ✅ | ✅ | ❌ | ❌ | ✅ (name confirm) |
