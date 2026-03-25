# Research: Cloudflare Tunnel Setup — 4-Scenario Initial Install Flow

**Date**: 2026-02-27 | **Branch**: `001-cf-tunnel-setup`

---

## R-001: cloudflared Quick Tunnel URL Parsing

**Decision**: Parse the `*.trycloudflare.com` URL from cloudflared Docker container log output using the regex `/https?:\/\/([\w-]+\.trycloudflare\.com)/i`, scanning both stdout and stderr streams.

**Rationale**: cloudflared outputs the Quick Tunnel URL to both stdout and stderr (varies by version). The URL typically appears within 1–3 seconds of container startup. Monitoring both streams with a single regex is the most reliable approach across cloudflared versions.

**Regex pattern:**
```typescript
const QUICK_TUNNEL_URL_RE = /https?:\/\/([\w-]+\.trycloudflare\.com)/i;
```

**Implementation approach**: Stream Docker container logs via `dockerode` `container.logs()` with `stdout: true, stderr: true, follow: true`. Resolve the promise as soon as the regex matches. Set a 30-second timeout to handle cloudflared startup failures gracefully.

**Alternatives considered**:
- Parsing cloudflared JSON log format: inconsistent across versions; plain-text regex is simpler and works universally.
- Using `execa` to run cloudflared directly (non-Docker): would require cloudflared binary installed on host; Docker is the mandated runtime for all services.

---

## R-002: Traefik Path-Prefix Routing for Quick Tunnel Mode

**Decision**: Apply Traefik `PathPrefix` router rules + `StripPrefix` middleware Docker labels for path-friendly services only. Services incompatible with path prefixes (Nextcloud, Jellyfin) are skipped in Quick Tunnel mode with a "Named Tunnel recommended for full service access" advisory shown in Step 7.

**Path-friendly services** (subset of enabled services exposed via Quick Tunnel):
| Service | Path | Internal target |
|---------|------|-----------------|
| FileBrowser | `/files` | `filebrowser:80` |
| Gitea | `/git` | `gitea:3000` |
| Uptime Kuma | `/status` | `uptime-kuma:3001` |
| Grafana | `/grafana` | `grafana:3000` |
| pgAdmin | `/pgadmin` | `adminer:8080` |

**Not exposed via path-prefix** (show advisory):
- Nextcloud — generates absolute URLs; breaks without subdomain
- Jellyfin — client-side routing incompatible with path prefix

**Docker label pattern (per service):**
```yaml
traefik.enable: "true"
traefik.http.routers.filebrowser-qt.rule: "PathPrefix(`/files`)"
traefik.http.routers.filebrowser-qt.entrypoints: "web"
traefik.http.routers.filebrowser-qt.middlewares: "filebrowser-strip@docker"
traefik.http.middlewares.filebrowser-strip.stripprefix.prefixes: "/files"
traefik.http.services.filebrowser.loadbalancer.server.port: "80"
```

**Rationale**: Path-prefix routing is a known limitation of Quick Tunnel (single URL). The tradeoff is acceptable because: (a) Quick Tunnel is an entry-level, temporary mode; (b) the advisory guides users toward Named Tunnel for full service access; (c) path-friendly services cover the most common use cases (file management, git, monitoring).

**Alternatives considered**:
- Expose all services via path-prefix (rejected: Nextcloud/Jellyfin break without subdomain routing).
- Expose only a single service via Quick Tunnel (rejected: reduces Quick Tunnel value; most users want multiple services immediately).

---

## R-003: Cloudflare API Tunnel Deletion (Rollback)

**Decision**: Use `DELETE /accounts/{accountId}/cfd_tunnel/{tunnelId}` with a pre-flight check that the cloudflared container is stopped before calling the endpoint.

**Endpoint**: `DELETE https://api.cloudflare.com/client/v4/accounts/{accountId}/cfd_tunnel/{tunnelId}`
**Auth**: Bearer token (same CF API token used for creation)
**Prerequisite**: No active cloudflared daemon connections (HTTP 400 if tunnel has active connections)

**Rollback sequence in `tunnel-manager.ts`:**
1. Stop cloudflared container if running (via dockerode)
2. Call `deleteTunnel(apiToken, accountId, tunnelId)`
3. Best-effort: delete any DNS CNAME records created before the failure
4. Log rollback event to `tunnel.log` (event: `'ROLLBACK'`)
5. Surface error to wizard as "설정에 실패했습니다. 터널 롤백 완료. 다시 시도하세요."

**Error handling**: If the tunnel deletion itself fails (e.g., network error during rollback), log the orphaned tunnelId to `tunnel.log` with `error` field and show the user the exact tunnelId so they can delete it manually from the CF dashboard.

**Alternatives considered**:
- Leave orphaned tunnel for user to clean up (rejected: accumulates silently; CF disallows same-name tunnel re-creation without deletion; approved as Complexity Tracking exception).

---

## R-004: Exponential Backoff Retry for Cloudflare API Calls

**Decision**: Add `fetchWithRetry()` helper to `cloudflare-client.ts`. Max 3 retries, delays 1s → 2s → 4s with ±10% jitter. Retry on: network errors + HTTP 5xx + HTTP 429. Do NOT retry on: HTTP 400/401/403 (deterministic failures requiring user action).

**Backoff sequence:**
```
Attempt 0 → fail → wait 1s ± 100ms
Attempt 1 → fail → wait 2s ± 200ms
Attempt 2 → fail → wait 4s ± 400ms
Attempt 3 → fail → throw Error (trigger rollback)
Max wall time: ~8 seconds total before rollback
```

**Jitter rationale**: ±10% jitter prevents retry thundering-herd if multiple concurrent CLI sessions hit the same API endpoint.

**Error code mapping** (Cloudflare API → Brewnet BN codes):
- HTTP 401/403 (token invalid/expired) → `BN004` (Invalid license/token)
- HTTP 429 (rate limited, retries exhausted) → `BN005` (Rate limit exceeded)
- HTTP 5xx after retries → `BN009` (Database/external service error)

**Alternatives considered**:
- Fixed delay retry (simpler but thundering herd risk)
- Unlimited retries (rejected: setup could hang indefinitely)

---

## R-005: Existing Code Baseline

**cloudflare-client.ts (331 lines)** — Production-ready CF API client. Missing: retry, deletion, token clearing after setup. All 8 public functions fully implemented.

**domain-network.ts (711 lines)** — Full 10-step Named Tunnel API flow + manual fallback. Currently binary local/tunnel choice. Needs: 5-option selector, Scenario 1/3/4 flows, retry/rollback integration.

**compose-generator.ts (625 lines)** — `getCloudflaredEnv()` already generates `TUNNEL_TOKEN`. Needs: `tunnelMode` branching to produce Quick vs Named cloudflared service config.

**wizard-state.ts (211 lines)** — `DomainProvider = 'local' | 'tunnel'`. `CloudflareConfig` has 8 fields. Missing: `tunnelMode`, `quickTunnelUrl`.

**domain.ts command** — Does NOT exist. Must be created from scratch.
