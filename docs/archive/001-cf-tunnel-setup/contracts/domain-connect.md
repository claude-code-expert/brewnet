# Contract: `brewnet domain connect`

**Command**: `brewnet domain connect`
**Type**: Interactive CLI command
**Created**: 2026-02-27

---

## Purpose

Attach a Cloudflare-managed domain to an existing brewnet installation that is currently running in either:
- **Quick Tunnel mode** (`tunnelMode='quick'`) — creates a new Named Tunnel, migrates cloudflared, stops Quick Tunnel
- **Named Tunnel no-domain mode** (`tunnelMode='named'`, `zoneId=''`) — reuses existing tunnel, adds ingress + DNS
- **Named Tunnel with domain** (`zoneId` set) — re-runs ingress + DNS sync (idempotent upsert)

---

## Invocation

```bash
brewnet domain connect
```

No required flags. All inputs gathered interactively.

---

## Interactive Prompt Flow

```
Step 1: Read current state from ~/.brewnet/config.json
        → Determine current tunnelMode and whether tunnel/domain already exist

Step 2: If tunnelMode='none' or 'local':
          ERROR: "이 프로젝트는 터널 설정 없이 시작되었습니다. `brewnet init`을 다시 실행하세요."
          Exit code 1

Step 3: Prompt for CF API Token
        "Cloudflare API Token을 입력하세요:"
        → Validate via verifyToken() with retry

Step 4: Auto-detect account (single → auto-select; multiple → prompt list)

Step 5: List and prompt for zone (domain) selection

Step 6: Execute appropriate path:

  Path A (tunnelMode='quick'): Create Named Tunnel
    ├─ Create new Named Tunnel via CF API
    ├─ Configure ingress rules for all enabled services
    ├─ Create DNS CNAME records (upsert)
    ├─ Update docker-compose: replace quick cloudflared with named cloudflared (TUNNEL_TOKEN)
    ├─ docker compose up -d cloudflared (restart with new config)
    ├─ Stop Quick Tunnel container (docker stop brewnet-tunnel-quick)
    └─ Persist: tunnelMode='named', tunnelId, tunnelToken, zoneId, zoneName

  Path B (tunnelMode='named', zoneId=''): Attach domain to existing tunnel
    ├─ Configure ingress rules using existing tunnelId
    ├─ Create DNS CNAME records (upsert)
    └─ Persist: zoneId, zoneName

  Path C (tunnelMode='named', zoneId set): Re-sync
    ├─ GET current ingress from CF API
    ├─ Upsert any missing ingress rules
    ├─ Upsert any missing DNS CNAME records
    └─ Persist updated state

Step 7: Verify tunnel reaches 'healthy' status

Step 8: Clear apiToken from state

Step 9: Log 'DOMAIN_CONNECT' event to tunnel.log

Step 10: Display service URLs + success banner
```

---

## Exit Codes

| Code | Condition |
|------|-----------|
| `0` | Success |
| `1` | Invalid state (no tunnel configured) |
| `2` | CF API token invalid |
| `3` | Tunnel creation failed (after rollback) |
| `4` | DNS record creation failed (all records) |

---

## State Before / After

**Before (Path A — Quick Tunnel)**:
```json
{ "tunnelMode": "quick", "tunnelId": "", "zoneId": "" }
```

**After**:
```json
{ "tunnelMode": "named", "tunnelId": "c1744f8b-...", "zoneId": "a3b2c...", "zoneName": "myserver.com" }
```

---

## Error Messages

| Error | User Message (Korean) |
|-------|----------------------|
| No tunnel state | "이 프로젝트는 터널 설정 없이 시작되었습니다. `brewnet init`을 다시 실행하세요." |
| Invalid API token | "유효하지 않은 API 토큰입니다. Cloudflare 대시보드에서 토큰을 확인해주세요. [BN004]" |
| No zones found | "Cloudflare 계정에 활성 도메인이 없습니다. domains.cloudflare.com에서 도메인을 등록해주세요." |
| Tunnel creation fail | "터널 생성에 실패했습니다. (롤백 완료) 잠시 후 다시 시도해주세요. [BN009]" |
