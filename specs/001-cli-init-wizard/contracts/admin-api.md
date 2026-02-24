# Admin Panel REST API Contract

**Feature**: 001-cli-init-wizard
**Date**: 2026-02-25
**Server**: `packages/cli/src/services/admin-server.ts`
**Base URL**: `http://localhost:8088`
**Auth**: None (localhost-only, not externally exposed)
**Content-Type**: `application/json`

---

## Endpoints

### GET /api/health

Admin server health check.

**Response 200**:
```json
{ "status": "ok", "version": "1.0.0" }
```

---

### GET /api/services

List all installed services with real-time status.

**Response 200**:
```json
{
  "services": [
    {
      "id": "traefik",
      "name": "Traefik",
      "type": "web",
      "status": "running",         // "running" | "stopped" | "error" | "not_installed"
      "cpu": "0.1%",
      "memory": "45MB",
      "uptime": "2m",
      "port": 80,
      "url": "http://traefik.brewnet.local",
      "removable": false
    },
    {
      "id": "nextcloud",
      "name": "Nextcloud",
      "type": "file",
      "status": "running",
      "cpu": "0.8%",
      "memory": "256MB",
      "uptime": "2m",
      "port": 443,
      "url": "https://nextcloud.brewnet.local",
      "removable": true
    }
  ],
  "summary": {
    "total": 6,
    "running": 6,
    "stopped": 0
  }
}
```

---

### POST /api/services/:id/start

Start a stopped service container.

**URL params**: `id` — service ID (e.g., `nextcloud`, `jellyfin`)

**Response 200**:
```json
{ "success": true, "id": "nextcloud", "status": "running" }
```

**Response 400** (already running):
```json
{ "success": false, "error": "Service is already running", "code": "ALREADY_RUNNING" }
```

**Response 404** (service not found):
```json
{ "success": false, "error": "Service not found", "code": "BN008" }
```

---

### POST /api/services/:id/stop

Stop a running service container.

**URL params**: `id` — service ID

**Response 200**:
```json
{ "success": true, "id": "nextcloud", "status": "stopped" }
```

**Response 400** (non-removable / required service):
```json
{ "success": false, "error": "Cannot stop required service: traefik", "code": "REQUIRED_SERVICE" }
```

---

### POST /api/services/install

Install and start a new service (equivalent to `brewnet add <service>`).

**Request body**:
```json
{ "id": "jellyfin" }
```

**Response 202** (accepted, installation in progress):
```json
{
  "success": true,
  "id": "jellyfin",
  "status": "installing",
  "message": "Pulling image jellyfin/jellyfin:latest..."
}
```

**Response 409** (already installed):
```json
{ "success": false, "error": "Service already installed", "code": "ALREADY_EXISTS" }
```

---

### DELETE /api/services/:id

Remove a service (equivalent to `brewnet remove <service>`).

**URL params**: `id` — service ID
**Query params**: `purge=true` — also delete data volumes (default: false)

**Response 200**:
```json
{
  "success": true,
  "id": "jellyfin",
  "dataPreserved": true,
  "message": "Service removed. Data preserved at ~/.brewnet/data/jellyfin/"
}
```

**Response 400** (required service):
```json
{ "success": false, "error": "Cannot remove required service: traefik", "code": "REQUIRED_SERVICE" }
```

---

### GET /api/catalog

List all available services that can be installed.

**Response 200**:
```json
{
  "catalog": [
    {
      "id": "jellyfin",
      "name": "Jellyfin",
      "description": "Media streaming server",
      "category": "media",
      "image": "jellyfin/jellyfin:latest",
      "ramEstimateMB": 256,
      "installed": false
    },
    {
      "id": "minio",
      "name": "MinIO",
      "description": "S3-compatible object storage",
      "category": "file",
      "image": "minio/minio:latest",
      "ramEstimateMB": 128,
      "installed": false
    }
  ]
}
```

---

### POST /api/backup

Create a full backup (equivalent to `brewnet backup`).

**Response 202**:
```json
{
  "success": true,
  "backupId": "backup-2026-02-25-143052",
  "status": "in_progress"
}
```

---

### GET /api/backup

List available backups.

**Response 200**:
```json
{
  "backups": [
    {
      "id": "backup-2026-02-25-143052",
      "createdAt": "2026-02-25T14:30:52Z",
      "sizeMB": 8.2,
      "path": "~/.brewnet/backups/backup-2026-02-25-143052.tar.gz"
    }
  ]
}
```

---

## Error Response Format

All errors follow this structure:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "BN001"
}
```

| Code | Meaning |
|------|---------|
| BN001 | Docker daemon not running |
| BN002 | Port already in use |
| BN006 | Build/install failed |
| BN008 | Resource not found |
| BN009 | Database error |
| ALREADY_RUNNING | Service is already running |
| ALREADY_EXISTS | Service already installed |
| REQUIRED_SERVICE | Cannot modify required service |
