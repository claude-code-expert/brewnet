# Admin Server API Contract: Domain Management

**Feature**: 003-domain-external-access
**Date**: 2026-03-15

## Authentication

All `/api/domain/*` and `/api/settings/*` endpoints require admin password verification.

**Header**: `X-Admin-Password: <admin_password>`

**Error Response** (401):
```json
{
  "error": "Unauthorized",
  "message": "Admin password required for this operation"
}
```

---

## Domain Endpoints

### GET /api/domain/list

List all domain connections for the current project.

**Response** (200):
```json
{
  "connections": [
    {
      "appName": "my-api",
      "subdomain": "my-api",
      "domain": "yourdomain.com",
      "hostname": "my-api.yourdomain.com",
      "externalUrl": "https://my-api.yourdomain.com",
      "containerPort": 8080,
      "connectedAt": "2026-03-15T10:30:00Z",
      "scenario": "A"
    }
  ],
  "tunnel": {
    "status": "healthy",
    "connectorCount": 4,
    "tunnelName": "brewnet-homeserver"
  },
  "credentialsConfigured": true
}
```

**Response** (200, empty):
```json
{
  "connections": [],
  "tunnel": null,
  "credentialsConfigured": false
}
```

---

### POST /api/domain/connect

Connect a local app to an external domain.

**Request Body**:
```json
{
  "appName": "my-api",
  "subdomain": "my-api",
  "domain": "yourdomain.com"
}
```

**Response** (200, success):
```json
{
  "success": true,
  "hostname": "my-api.yourdomain.com",
  "externalUrl": "https://my-api.yourdomain.com",
  "steps": [
    { "step": "health_check", "status": "completed" },
    { "step": "ingress_update", "status": "completed" },
    { "step": "dns_creation", "status": "completed" },
    { "step": "traefik_labels", "status": "completed" },
    { "step": "dns_propagation", "status": "completed", "durationMs": 3200 }
  ]
}
```

**Response** (400, validation error):
```json
{
  "success": false,
  "error": "INVALID_SUBDOMAIN",
  "message": "Subdomain must be a valid DNS label"
}
```

**Response** (409, conflict):
```json
{
  "success": false,
  "error": "CNAME_CONFLICT",
  "message": "A CNAME record already exists for my-api.yourdomain.com",
  "existingRecordId": "abc123"
}
```

**Response** (503, local health check failed):
```json
{
  "success": false,
  "error": "APP_NOT_RUNNING",
  "message": "Local health check failed for my-api on port 8080"
}
```

---

### DELETE /api/domain/disconnect/:appName

Disconnect an app from its external domain.

**Response** (200):
```json
{
  "success": true,
  "appName": "my-api",
  "removedHostname": "my-api.yourdomain.com",
  "steps": [
    { "step": "ingress_removal", "status": "completed" },
    { "step": "dns_deletion", "status": "completed" },
    { "step": "traefik_cleanup", "status": "completed" }
  ]
}
```

**Response** (404):
```json
{
  "success": false,
  "error": "NOT_CONNECTED",
  "message": "No external domain connection found for app: my-api"
}
```

---

### GET /api/domain/status/:appName

Get detailed domain connection status for a specific app.

**Response** (200):
```json
{
  "appName": "my-api",
  "local": {
    "url": "http://my-api.brewnet.local",
    "healthy": true
  },
  "external": {
    "url": "https://my-api.yourdomain.com",
    "dnsResolved": true,
    "httpsReachable": true
  },
  "tunnel": {
    "status": "healthy",
    "connectorCount": 4
  },
  "dns": {
    "type": "CNAME",
    "name": "my-api.yourdomain.com",
    "content": "6ff42ae2-xxxx.cfargotunnel.com",
    "proxied": true
  }
}
```

---

### GET /api/domain/apps

List available apps that can be connected to domains (not yet connected).

**Response** (200):
```json
{
  "apps": [
    {
      "name": "my-api",
      "containerName": "brewnet-my-api",
      "port": 8080,
      "running": true,
      "alreadyConnected": false
    },
    {
      "name": "gitea",
      "containerName": "brewnet-gitea",
      "port": 3000,
      "running": true,
      "alreadyConnected": true,
      "hostname": "git.yourdomain.com"
    }
  ]
}
```

---

## Settings Endpoints

### GET /api/settings/cloudflare

Get current Cloudflare credential configuration status (tokens masked).

**Response** (200):
```json
{
  "configured": true,
  "accountId": "abc***456",
  "zoneId": "xyz***789",
  "zoneName": "yourdomain.com",
  "tunnelId": "6ff4***0003",
  "tunnelName": "brewnet-homeserver",
  "apiTokenSet": true,
  "apiTokenValid": true
}
```

---

### PUT /api/settings/cloudflare

Save or update Cloudflare credentials.

**Request Body**:
```json
{
  "apiToken": "your_api_token_here",
  "accountId": "abc123def456",
  "zoneId": "xyz789",
  "tunnelId": "6ff42ae2-765d-..."
}
```

**Response** (200):
```json
{
  "success": true,
  "verified": true,
  "email": "user@example.com",
  "zoneName": "yourdomain.com"
}
```

**Response** (400, invalid token):
```json
{
  "success": false,
  "error": "INVALID_TOKEN",
  "message": "API token verification failed. Ensure the token has Tunnel:Edit, DNS:Edit, Zone:Read permissions."
}
```

---

## CLI Command Contract

### brewnet domain connect

```
Usage: brewnet domain connect <app> --domain <subdomain.domain.com>

Arguments:
  app                     Name of the local app/service to connect

Options:
  --domain <hostname>     Target external hostname (e.g., my-api.yourdomain.com)
  --force                 Overwrite existing CNAME record if conflict detected
  -h, --help              Display help

Output (success):
  ✅ Local health check passed (my-api:8080)
  ✅ Tunnel ingress updated (my-api.yourdomain.com → traefik:80)
  ✅ DNS CNAME record created (my-api → 6ff4...cfargotunnel.com)
  ✅ Traefik labels updated
  ⏳ Waiting for DNS propagation... (3.2s)
  ✅ https://my-api.yourdomain.com is live!
```

### brewnet domain disconnect

```
Usage: brewnet domain disconnect <app>

Arguments:
  app                     Name of the app to disconnect

Output (success):
  ✅ Tunnel ingress rule removed
  ✅ DNS CNAME record deleted
  ✅ Traefik external labels removed
  ℹ  my-api is still running locally at http://localhost:8080
```

### brewnet domain list

```
Usage: brewnet domain list

Output:
  ┌──────────┬──────────────────────────────────┬─────────────────────┐
  │ App      │ External URL                     │ Connected           │
  ├──────────┼──────────────────────────────────┼─────────────────────┤
  │ my-api   │ https://my-api.yourdomain.com    │ 2026-03-15 10:30    │
  │ gitea    │ https://git.yourdomain.com       │ 2026-03-15 10:32    │
  └──────────┴──────────────────────────────────┴─────────────────────┘
```

### brewnet domain status

```
Usage: brewnet domain status [app]

Output (all apps):
  my-api
    Local:    http://localhost:8080              ✅
    External: https://my-api.yourdomain.com     ✅
    Tunnel:   brewnet-homeserver                ✅ (4 connections)
    DNS:      CNAME → 6ff4...cfargotunnel.com  ✅

Output (specific app, unhealthy):
  my-api
    Local:    http://localhost:8080              ✅
    External: https://my-api.yourdomain.com     ❌ unreachable
    Tunnel:   brewnet-homeserver                ⚠️ (1 connection)
    DNS:      CNAME → 6ff4...cfargotunnel.com  ✅
```
