# Contract: Tunnel Management Commands

**Commands**: `brewnet domain tunnel status`, `brewnet domain tunnel restart`
**Type**: Non-interactive CLI commands
**Created**: 2026-02-27

---

## `brewnet domain tunnel status`

### Purpose
Query Cloudflare API for tunnel health and display service accessibility.

### Invocation
```bash
brewnet domain tunnel status
```

### Output Format

```
🚇 Tunnel Status: brewnet-homeserver
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status:       healthy ✅  (2 connectors active)
Tunnel ID:    c1744f8b-faa1-48a4-9e5c-...
Last checked: 2026-02-27 12:34:56 UTC

Services:
  FileBrowser   https://files.myserver.com     ✅ accessible
  Gitea         https://git.myserver.com       ✅ accessible
  Uptime Kuma   https://status.myserver.com    ✅ accessible
  Grafana       https://grafana.myserver.com   ⚠️  unreachable
```

Quick Tunnel variant:
```
🚇 Tunnel Status: Quick Tunnel (temporary)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URL:          https://purple-meadow-abc1.trycloudflare.com
Mode:         Quick Tunnel (URL changes on restart)

Services:
  FileBrowser   https://purple-meadow-abc1.trycloudflare.com/files    ✅ accessible
  Gitea         https://purple-meadow-abc1.trycloudflare.com/git      ✅ accessible

⚠️  영구 URL을 원하면 `brewnet domain connect`를 실행하세요.
```

### Logic

1. Read `tunnelMode` from `~/.brewnet/config.json`
2. If `tunnelMode='quick'`: read `quickTunnelUrl` from running container logs (re-parse), display path-based URLs
3. If `tunnelMode='named'`: call `GET /accounts/{accountId}/cfd_tunnel/{tunnelId}` for health + connectors; HTTP HEAD each service URL for accessibility
4. If `tunnelMode='none'` or `'local'`: display "터널이 설정되지 않았습니다."
5. Log `STATUS_CHANGE` to `tunnel.log` only if status differs from last check

### Exit Codes

| Code | Condition |
|------|-----------|
| `0` | Status retrieved (regardless of tunnel health) |
| `1` | No tunnel configured |
| `2` | CF API call failed after retries |

---

## `brewnet domain tunnel restart`

### Purpose
Restart the cloudflared Docker container and confirm successful reconnection.

### Invocation
```bash
brewnet domain tunnel restart
```

### Output Format

```
🔄 Cloudflare 터널을 재시작합니다...
  ⏳ brewnet-tunnel 컨테이너 중지 중...
  ✅ 중지 완료
  ⏳ brewnet-tunnel 컨테이너 시작 중...
  ✅ 시작 완료
  ⏳ 터널 연결 확인 중... (최대 30초)
  ✅ 터널이 정상 연결되었습니다 (healthy)

서비스 주소:
  https://files.myserver.com
  https://git.myserver.com
  https://status.myserver.com
```

### Logic

1. Read `tunnelMode` from state
2. If `tunnelMode='none'` or `'local'`: error "터널이 설정되지 않았습니다."
3. Use `dockerode` to: `container.stop()` → `container.start()`
4. Poll CF API (`GET .../cfd_tunnel/{tunnelId}`) for `status='healthy'` — timeout 30s, poll every 2s
5. For Quick Tunnel: re-parse container logs for new `*.trycloudflare.com` URL; update `quickTunnelUrl` in state
6. Log `RESTART` event to `tunnel.log`
7. Display updated service URLs

### Exit Codes

| Code | Condition |
|------|-----------|
| `0` | Tunnel restarted and healthy |
| `1` | No tunnel configured |
| `2` | Container restart failed |
| `3` | Tunnel did not reach healthy within 30s timeout |

---

## Step 4 Scenario Selector (Wizard Contract)

### Display Format

```
? 외부 접근 방식을 선택하세요:

  ❯ 1. Quick Tunnel (즉시 사용, 임시 URL — 도메인 불필요)
       ✦ 계정 없이 바로 시작. 단, 서버 재시작 시 URL이 변경됩니다.

    2. Named Tunnel — 기존 Cloudflare 도메인 연결 (영구 URL)
       ✦ Cloudflare 계정 + 도메인이 이미 있는 경우. API 토큰 1회 입력.

    3. Named Tunnel — 도메인 먼저 구입 후 연결 (안내 포함)
       ✦ 도메인 구입 가이드 제공. 임시 Quick Tunnel로 즉시 접근 가능.

    4. Named Tunnel만 생성 — 도메인은 나중에 연결
       ✦ 터널만 준비. `brewnet domain connect`로 도메인 추가 가능.

    5. 로컬 전용 (외부 접근 없음)
       ✦ 내부 네트워크에서만 접근. brewnet.local 도메인 사용.
```

### Input Mapping

| Selection | `provider` | `tunnelMode` | Next flow |
|-----------|-----------|--------------|-----------|
| 1 | `'quick-tunnel'` | `'quick'` | QuickTunnelManager.start() |
| 2 | `'tunnel'` | `'named'` | Existing API setup flow + retry/rollback |
| 3 | `'tunnel'` | `'named'` | Domain purchase guide → wait → Scenario 2 |
| 4 | `'tunnel'` | `'named'` | Tunnel creation only (no DNS) |
| 5 | `'local'` | `'none'` | Clear CF config, set domain = `{name}.local` |
