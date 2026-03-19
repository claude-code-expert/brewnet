# API Contracts: New Endpoints for React Migration

**Branch**: `001-admin-react-migration` | **Date**: 2026-03-18

These are the **only new API endpoints** required by the React migration. All existing 30+ endpoints remain unchanged.

---

## `GET /api/config`

**Purpose**: Provides dashboard bootstrap data previously embedded as JS variables in HTML.

**Auth**: None required (returns masked/non-sensitive data only).

**Response** `200 OK`:
```json
{
  "adminUsername": "admin",
  "passwordHint": "a****n",
  "domainProvider": "quick-tunnel",
  "quickTunnelUrl": "https://abc-xyz.trycloudflare.com",
  "zoneName": "example.com",
  "tunnelId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Response fields**:
| Field | Type | Notes |
|---|---|---|
| `adminUsername` | `string` | Admin account username |
| `passwordHint` | `string` | First char + `****` + last char of password |
| `domainProvider` | `"local" \| "tunnel" \| "quick-tunnel"` | From wizardState |
| `quickTunnelUrl` | `string` | Empty string if not active |
| `zoneName` | `string` | Cloudflare zone domain or empty string |
| `tunnelId` | `string` | Cloudflare Tunnel UUID or empty string |

**Error responses**: None — always returns 200 with empty strings for unconfigured fields.

---

## `GET /api/services/catalog`

**Purpose**: Returns static service metadata previously embedded as `SERVICE_DETAIL_MAP` and `NAME_ALIASES` JS variables in the dashboard HTML.

**Auth**: None required (static metadata).

**Response** `200 OK`:
```json
{
  "catalog": {
    "traefik": {
      "displayName": "Traefik",
      "description": "Reverse proxy and load balancer",
      "features": ["Auto SSL", "Docker labels routing", "Dashboard UI"],
      "credentialKeys": [],
      "docsUrl": "https://doc.traefik.io/traefik/"
    },
    "gitea": {
      "displayName": "Gitea",
      "description": "Lightweight Git service",
      "features": ["Git hosting", "SSH access", "Web UI"],
      "credentialKeys": ["GITEA_ADMIN_USER", "GITEA_ADMIN_PASSWORD"],
      "docsUrl": "https://docs.gitea.io/"
    }
  },
  "aliases": {
    "git": "gitea",
    "proxy": "traefik"
  }
}
```

**Response fields**:
| Field | Type | Notes |
|---|---|---|
| `catalog` | `Record<string, ServiceDetail>` | Key = service ID (matches `ServiceInfo.id`) |
| `catalog[id].displayName` | `string` | Human-readable name |
| `catalog[id].description` | `string` | Short description |
| `catalog[id].features` | `string[]` | Bullet-point feature list |
| `catalog[id].credentialKeys` | `string[]` | Env var names shown in credentials modal |
| `catalog[id].docsUrl` | `string?` | Optional link to official docs |
| `aliases` | `Record<string, string>` | Alternative names mapping to service IDs |

**Error responses**: None — always returns 200.

---

## SSE Authentication Amendment

**Endpoint**: `GET /api/apps/:name/logs` (existing, no path change)

**Current behavior**: Streams docker compose logs as `text/event-stream`.

**Amendment required**: `EventSource` (browser API) does not support custom request headers. The `X-Admin-Password` header cannot be sent with SSE connections.

**Solution**: Accept password via query string as fallback:
- Primary: `X-Admin-Password` header (for regular fetch calls)
- Fallback: `?token=<password>` query parameter (for SSE / EventSource)

**Updated behavior**:
```
GET /api/apps/myapp/logs?token=<adminPassword>
```

The server checks `X-Admin-Password` header first; if absent, checks `?token` query parameter. Behavior otherwise unchanged.

**If the endpoint is currently unauthenticated**: No change needed.

---

## Unchanged Endpoints Used by React

All existing endpoints below remain **byte-for-byte compatible** — no request or response format changes:

| Method | Path | Used By |
|---|---|---|
| `GET` | `/api/services` | Dashboard (services list) |
| `GET` | `/api/logs` | Dashboard (logs tab) |
| `GET` | `/api/logs/stats` | Dashboard (logs tab) |
| `GET` | `/api/domain/list` | Dashboard + App Detail (Domain tab) |
| `GET` | `/api/apps/boilerplates` | Dashboard (boilerplate section) |
| `GET` | `/api/apps` | Apps page |
| `GET` | `/api/apps/jobs/:jobId` | Apps page (create app progress) |
| `POST` | `/api/apps/create` | Apps page (create app) |
| `GET` | `/api/apps/:name` | App Detail |
| `POST` | `/api/apps/:name/start` | App Detail + Apps page |
| `POST` | `/api/apps/:name/stop` | App Detail + Apps page |
| `DELETE` | `/api/apps/:name` | Apps page |
| `POST` | `/api/apps/:name/deploy` | App Detail (Deployment tab) |
| `GET` | `/api/apps/:name/git` | App Detail |
| `GET` | `/api/apps/:name/deploy/settings` | App Detail |
| `PUT` | `/api/apps/:name/deploy/settings` | App Detail |
| `GET` | `/api/apps/:name/logs` | App Detail (Logs tab, SSE) |
| `GET` | `/api/deploy/history` | App Detail (Deployment tab) |
| `GET` | `/api/git/repos` | Apps page (silent fallback on 502) |
| `GET` | `/api/domain/apps` | App Detail (Domain tab) |
| `POST` | `/api/domain/connect` | App Detail (Domain tab) |
| `DELETE` | `/api/domain/disconnect/:appName` | App Detail (Domain tab) |
| `GET` | `/api/settings/cloudflare` | Apps page (Settings tab) |
| `PUT` | `/api/settings/cloudflare` | Apps page (Settings tab) |
| `GET` | `/api/health` | Password validation on login |
