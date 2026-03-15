# API Contract: Log Endpoints

**Feature**: 004-centralized-logging
**Date**: 2026-03-15

## GET /api/logs

Query unified logs from all sources with filtering and pagination.

### Request

**Method**: GET
**Path**: `/api/logs`

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| source | string | No | (all) | Single source filter: `cli`, `tunnel`, `access`, `service` |
| level | string | No | (all) | Level filter: `info`, `warn`, `error`, `debug` |
| service | string | No | (all) | Service name filter (e.g., `traefik`, `gitea`) |
| since | string | No | (none) | ISO 8601 start time |
| until | string | No | (none) | ISO 8601 end time |
| limit | number | No | 100 | Max entries (1-1000) |
| offset | number | No | 0 | Pagination offset |
| search | string | No | (none) | Text search in message |

### Response (200 OK)

```json
{
  "entries": [
    {
      "timestamp": "2026-03-15T10:00:07Z",
      "source": "access",
      "level": "info",
      "service": "gitea",
      "message": "POST /login → 302",
      "metadata": {
        "routerName": "gitea@docker",
        "clientAddr": "192.168.1.100",
        "duration": 45000000
      }
    },
    {
      "timestamp": "2026-03-15T10:00:05Z",
      "source": "cli",
      "level": "info",
      "service": null,
      "message": "Wizard started",
      "metadata": {
        "command": "init"
      }
    }
  ],
  "total": 1523,
  "hasMore": true
}
```

### Error Response (400 Bad Request)

```json
{
  "error": "Invalid source filter: 'unknown'. Valid values: cli, tunnel, access, service"
}
```

---

## GET /api/logs/stats

Get aggregated log statistics.

### Request

**Method**: GET
**Path**: `/api/logs/stats`

No parameters.

### Response (200 OK)

```json
{
  "total": 15234,
  "bySource": {
    "cli": 2340,
    "tunnel": 156,
    "access": 12000,
    "service": 738
  },
  "byLevel": {
    "info": 14500,
    "warn": 650,
    "error": 84,
    "debug": 0
  },
  "recentErrors": [
    {
      "timestamp": "2026-03-15T09:58:30Z",
      "source": "access",
      "level": "error",
      "service": "nextcloud",
      "message": "GET /status.php → 500",
      "metadata": {}
    }
  ],
  "lastUpdated": "2026-03-15T10:00:10Z"
}
```
