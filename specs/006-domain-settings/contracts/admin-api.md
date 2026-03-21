# API Contracts: Domain Settings Feature

**Feature**: 006-domain-settings
**Base URL**: `http://localhost:8088/api`
**Auth**: `X-Admin-Password: <admin-password>` header (required on all mutating endpoints marked [AUTH])

---

## Existing Endpoints (Unchanged)

### GET /api/settings/cloudflare [AUTH]

Returns current Cloudflare configuration (masked for security).

**Response** `200 OK`:
```json
{
  "configured": true,
  "apiTokenSet": true,
  "accountId": "akz***abc",
  "zoneId": "bcd***xyz",
  "zoneName": "myserver.com",
  "tunnelId": "c17***67f",
  "tunnelName": "brewnet-my-homeserver"
}
```

**Response** when not configured `200 OK`:
```json
{
  "configured": false,
  "apiTokenSet": false,
  "zoneName": "",
  "tunnelName": ""
}
```

---

### PUT /api/settings/cloudflare [AUTH]

Save Cloudflare credentials (partial updates supported — only provided fields are saved).

**Request Body (Step 1 — token only)**:
```json
{ "apiToken": "cf_xxxxx..." }
```

**Request Body (Step 2 — zone selection)**:
```json
{ "apiToken": "cf_xxxxx...", "zoneId": "abc123" }
```

**Response** `200 OK`:
```json
{
  "success": true,
  "verified": true,
  "email": "user@example.com",
  "zoneName": "myserver.com"
}
```

**Error** `400 Bad Request` (invalid token):
```json
{
  "success": false,
  "error": "INVALID_TOKEN",
  "message": "API token verification failed. Ensure the token has Tunnel:Edit, DNS:Edit, Zone:Read permissions."
}
```

---

### POST /api/domain/connect

Connect an app to a subdomain. Creates DNS record and updates tunnel ingress.

**Request Body**:
```json
{
  "appName": "my-blog",
  "subdomain": "my-blog",
  "domain": "myserver.com"
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "hostname": "my-blog.myserver.com",
  "externalUrl": "https://my-blog.myserver.com",
  "steps": [
    { "label": "Health check", "status": "done" },
    { "label": "Tunnel ingress", "status": "done" },
    { "label": "DNS record", "status": "done" }
  ]
}
```

**Error** `409 Conflict` (CNAME in use):
```json
{
  "success": false,
  "error": "CNAME_CONFLICT",
  "message": "CNAME_CONFLICT"
}
```

**Error** `400 Bad Request` (invalid subdomain):
```json
{
  "success": false,
  "error": "INVALID_SUBDOMAIN",
  "message": "Subdomain must be a valid DNS label"
}
```

---

### DELETE /api/domain/disconnect/:appName [AUTH]

Remove domain connection. Deletes DNS record and removes tunnel ingress rule.

**Response** `200 OK`:
```json
{
  "success": true,
  "appName": "my-blog",
  "removedHostname": "my-blog.myserver.com",
  "steps": [...]
}
```

**Error** `404` (not connected):
```json
{
  "success": false,
  "error": "NOT_CONNECTED",
  "message": "No domain connection for app: my-blog"
}
```

---

### GET /api/domain/list

Returns all domain connections and tunnel health.

**Response** `200 OK`:
```json
{
  "connections": [
    {
      "appName": "my-blog",
      "hostname": "my-blog.myserver.com",
      "connectedAt": "2026-03-20T10:00:00Z",
      "externalUrl": "https://my-blog.myserver.com"
    }
  ],
  "tunnel": {
    "status": "healthy",
    "tunnelName": "brewnet-my-homeserver",
    "tunnelId": "c1744f8b-..."
  },
  "credentialsConfigured": true
}
```

---

## New Endpoints (to be implemented)

### GET /api/cloudflare/zones [AUTH]

List Cloudflare DNS zones accessible with the stored API token.

**Response** `200 OK`:
```json
{
  "success": true,
  "zones": [
    { "id": "abc123", "name": "myserver.com", "status": "active" },
    { "id": "def456", "name": "example.dev", "status": "active" }
  ]
}
```

**Error** `400` (no token stored):
```json
{
  "success": false,
  "error": "NO_TOKEN",
  "message": "Cloudflare API token not configured. Complete Step 1 first."
}
```

**Error** `400` (token invalid / expired):
```json
{
  "success": false,
  "error": "TOKEN_INVALID",
  "message": "Stored API token is no longer valid. Please re-enter your token."
}
```

**Error** `200` (zero zones found):
```json
{
  "success": true,
  "zones": [],
  "warning": "No domains found. Ensure the token has Zone:Read permission and at least one domain is registered in your Cloudflare account."
}
```

---

### POST /api/cloudflare/tunnel [AUTH]

Create a Cloudflare Tunnel using the stored credentials.

**Request Body**:
```json
{ "tunnelName": "brewnet-my-homeserver" }
```

**Response** `200 OK`:
```json
{
  "success": true,
  "tunnelId": "c1744f8b-faa1-48a4-9e5c-02ac921467fa",
  "tunnelName": "brewnet-my-homeserver"
}
```

**Error** `400` (tunnel name already exists):
```json
{
  "success": false,
  "error": "TUNNEL_NAME_CONFLICT",
  "message": "A tunnel named \"brewnet-my-homeserver\" already exists in your Cloudflare account. Choose a different name."
}
```

**Error** `400` (credentials incomplete — token or zone not set):
```json
{
  "success": false,
  "error": "CREDENTIALS_INCOMPLETE",
  "message": "API token and zone must be configured before creating a tunnel."
}
```

---

## Frontend Component Contracts

### HelpTooltip

```typescript
interface HelpTooltipProps {
  text: string;          // tooltip description
  link?: string;         // optional CF Dashboard URL
  linkLabel?: string;    // link text (default: "Open in Cloudflare →")
}
```

### CloudflareTunnelModal

```typescript
interface CloudflareTunnelModalProps {
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
}
```

### AppDomainTab

```typescript
interface AppDomainTabProps {
  appName: string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onOpenDomainSettings?: () => void;  // callback to open CloudflareTunnelModal
}
```

### StepIndicator

```typescript
interface StepIndicatorProps {
  steps: Array<{ id: string; label: string }>;
  currentStep: string;
  completedSteps: string[];
}
```
