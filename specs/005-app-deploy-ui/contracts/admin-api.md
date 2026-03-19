# Admin API Contracts: App Deploy UI

**Branch**: `005-app-deploy-ui` | **Date**: 2026-03-16

All endpoints are relative to `http://localhost:<adminPort>`.

---

## Apps

### GET /api/apps

Returns all registered apps.

**Response** `200`:
```json
[
  {
    "name": "my-blog",
    "mode": "boilerplate",
    "stackId": "go-gin",
    "appDir": "/home/user/brewnet/my-blog",
    "lang": "go",
    "framework": "gin",
    "port": 8080,
    "giteaRepoUrl": "http://localhost/git/admin/my-blog",
    "status": "running",
    "createdAt": "2026-03-15T10:00:00Z"
  }
]
```

---

### POST /api/apps/create

Creates a new app asynchronously. Returns a job ID for polling.

**Request body** (mode A — boilerplate):
```json
{ "mode": "boilerplate", "appName": "my-api", "port": 8080, "stackId": "go-gin" }
```

**Request body** (mode B — git-url):
```json
{ "mode": "git-url", "appName": "my-project", "port": 3001, "gitUrl": "https://github.com/user/repo.git" }
```

**Request body** (mode C — new-project):
```json
{ "mode": "new-project", "appName": "my-app", "port": 3000, "language": "nodejs", "frameworkId": "express" }
```

**Response** `202`:
```json
{ "jobId": "a1b2c3d4e5f60001" }
```

---

### GET /api/apps/jobs/:jobId

Poll async job progress.

**Response** `200`:
```json
{
  "jobId": "a1b2c3d4e5f60001",
  "appName": "my-api",
  "status": "running",
  "steps": [
    { "label": "Validating", "status": "done", "message": "Port 8080 is available" },
    { "label": "Gitea setup", "status": "running", "message": null },
    { "label": "Gitea repo", "status": "pending", "message": null },
    { "label": "Git push", "status": "pending", "message": null },
    { "label": "Docker up", "status": "pending", "message": null },
    { "label": "Health check", "status": "pending", "message": null }
  ],
  "error": null
}
```

**Response** `404`: Job not found (expired or invalid ID).

---

### POST /api/apps/:name/start

Starts a stopped app (`docker compose up -d`).

**Response** `200`: `{ "ok": true }`
**Response** `404`: App not found.

---

### POST /api/apps/:name/stop

Stops a running app (`docker compose down`).

**Response** `200`: `{ "ok": true }`

---

### POST /api/apps/:name/deploy

Triggers full deploy: git pull → docker build → container restart → health check.

**Response** `202`:
```json
{ "jobId": "a1b2c3d4e5f60002" }
```

---

### DELETE /api/apps/:name

Removes app from registry and stops containers. Gitea repo is disconnected (not deleted).

**Response** `200`: `{ "ok": true }`
**Response** `409`: App is currently running or building.

---

### GET /api/apps/:name/logs (SSE)

Server-Sent Events stream for container log output.

**Response**: `text/event-stream`
```
data: {"line": "[2026-03-16T10:00:01Z] Server listening on :8080\n"}
data: {"line": "[2026-03-16T10:00:02Z] Connected to database\n"}
```

---

## Git / Gitea

### GET /api/git/repos

Returns all Gitea repositories.

**Response** `200`:
```json
[
  {
    "name": "my-blog",
    "description": "My personal blog",
    "private": false,
    "stars": 0,
    "language": "Go",
    "updatedAt": "2026-03-15T10:00:00Z",
    "cloneUrl": "http://localhost/git/admin/my-blog.git",
    "appName": "my-blog"
  },
  {
    "name": "dotfiles",
    "description": "",
    "private": true,
    "stars": 0,
    "language": "Shell",
    "updatedAt": "2026-03-10T08:00:00Z",
    "cloneUrl": "http://localhost/git/admin/dotfiles.git",
    "appName": null
  }
]
```

---

### POST /api/git/repos/:name/connect  *(NEW — to be added)*

Associates an existing Gitea repo with a registered app.

**Request body**:
```json
{ "appName": "my-blog" }
```

**Response** `200`: `{ "ok": true }`
**Response** `404`: Repo or app not found.
**Response** `409`: Repo already connected to a different app.

---

## Port Check

### GET /api/apps/check-port?port=:N  *(NEW — to be added)*

Checks whether a local port is currently in use.

**Response** `200`:
```json
{ "port": 8080, "available": false }
```

---

## Domains

### GET /api/domain/list

Returns all domain connections.

**Response** `200`:
```json
[
  { "appName": "my-blog", "domain": "blog.example.com", "mode": "cloudflare", "active": true }
]
```

---

### POST /api/domain/connect

Connects an app to a domain.

**Request body** (Cloudflare auto):
```json
{
  "appName": "my-blog",
  "mode": "cloudflare",
  "cfToken": "...",
  "domain": "example.com",
  "subdomain": "blog"
}
```

**Request body** (existing domain):
```json
{
  "appName": "my-blog",
  "mode": "manual",
  "domain": "blog.yourdomain.com"
}
```

**Request body** (add subdomain):
```json
{
  "appName": "my-blog",
  "mode": "subdomain",
  "baseDomain": "example.com",
  "prefix": "blog"
}
```

**Response** `200`: `{ "ok": true, "domain": "blog.example.com" }`

---

### DELETE /api/domain/disconnect/:appName

Disconnects domain from app.

**Response** `200`: `{ "ok": true }`
