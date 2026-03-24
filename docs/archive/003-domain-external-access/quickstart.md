# Quickstart: Domain External Access

**Feature**: 003-domain-external-access
**Date**: 2026-03-15

## Prerequisites

- Brewnet project initialized (`brewnet init` completed)
- Services running locally (`brewnet up`)
- Cloudflare account with a domain (any scenario: A, B, or C)
- Cloudflare API token with permissions: Tunnel:Edit, DNS:Edit, Zone:Read, Account Settings:Read

## Quick Setup (CLI)

### 1. Connect an app to external domain

```bash
# Single command — does everything
brewnet domain connect my-api --domain my-api.yourdomain.com

# With --force to overwrite existing CNAME
brewnet domain connect my-api --domain my-api.yourdomain.com --force
```

### 2. Verify the connection

```bash
# Quick check
brewnet domain status my-api

# Or list all connections
brewnet domain list
```

### 3. Disconnect when needed

```bash
brewnet domain disconnect my-api
```

## Quick Setup (Admin UI)

### 1. Open Admin page

```
http://localhost:8088
```

### 2. Configure Cloudflare credentials

Navigate to **Settings** → Enter API token, Account ID, Zone ID → Click **Verify & Save**

### 3. Connect a domain

Navigate to **Domains** section → Click **Connect Domain** → Select app, enter subdomain → Click **Connect**

### 4. For Scenario C (CNAME-only)

Navigate to **Domains** section → Click **CNAME Guide** → Follow instructions to add CNAME at your DNS provider

## Development Setup

### Run tests

```bash
# Unit tests for domain features
npx jest tests/unit/cli/services/domain-manager.test.ts
npx jest tests/unit/cli/commands/domain-connect.test.ts

# Integration tests
npx jest tests/integration/admin-domain-api.test.ts

# All domain-related tests
npx jest --testPathPattern="domain"
```

### Key files to modify

| File | Purpose |
|------|---------|
| `packages/shared/src/types/wizard-state.ts` | DomainConnection type definition |
| `packages/cli/src/services/domain-manager.ts` | Core lifecycle logic (NEW) |
| `packages/cli/src/services/cloudflare-client.ts` | DNS deletion functions |
| `packages/cli/src/commands/domain.ts` | CLI subcommands |
| `packages/cli/src/services/admin-server.ts` | Admin UI + REST API |

### Architecture flow

```
CLI command / Admin API request
        │
        ▼
  domain-manager.ts
  (connect / disconnect / list / status)
        │
        ├── cloudflare-client.ts (API calls)
        ├── compose-generator.ts (Traefik labels)
        ├── selections.json (state persistence)
        └── tunnel-logger.ts (audit logging)
```
