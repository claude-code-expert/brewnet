# cloudflared 컨테이너가 Named Tunnel 설정 후에도 Quick Tunnel로 동작

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-21 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Docker / Configuration |
| **브랜치** | 006-domain-settings |
| **재발 여부** | 최초 발생 |

## 문제 요약

`CloudflareTunnelModal`에서 Cloudflare Named Tunnel 설정을 완료한 후에도 cloudflared 컨테이너가 Quick Tunnel 모드로 계속 동작했다. 외부에서 설정한 서브도메인으로 접근해도 연결이 안 됐고, cloudflared 로그에는 `trycloudflare.com` quick tunnel URL만 출력됐다.

## 에러 상세

```bash
# docker logs cloudflared
2026/03/21 11:25:03 |WARN| You are connecting to a Quick Tunnel server
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://random-words-here.trycloudflare.com                                               |
+--------------------------------------------------------------------------------------------+

# 기대 동작
INF Registered tunnel connection ...
INF Connection ... registered with protocol: quic
```

## 근본 원인

Named Tunnel 설정 완료 시, `admin-server.ts`의 `/api/cloudflare/tunnel` 엔드포인트는 다음을 수행했다:
1. Cloudflare API로 tunnel 생성 → `tunnelId`, `tunnelToken` 획득
2. `wizardState.domain.cloudflare`에 저장
3. `cloudflared` 컨테이너를 `docker restart`

그런데 **docker-compose.yml의 cloudflared 서비스 정의 자체는 수정하지 않았다**. Quick Tunnel 모드로 기동된 compose 파일(`command: tunnel --no-autoupdate run --token ""` 대신 `tunnel --url http://traefik:80`)이 그대로 남아 있었고, `docker restart`는 compose 정의를 재로드하지 않기 때문에 재시작 후에도 quick tunnel 명령이 그대로 실행됐다.

```yaml
# 문제: compose 파일이 여전히 quick tunnel 설정
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate --url http://traefik:80  # ← quick tunnel
    # tunnel token이 없음
```

## 재현 조건

1. Quick Tunnel 모드로 brewnet init 완료 (wizard)
2. Admin UI → Domain Settings → CloudflareTunnelModal에서 Named Tunnel 설정 완료
3. `docker ps` 또는 cloudflared 로그 확인
4. 여전히 quick tunnel URL 출력

## 해결 방안

Named Tunnel 설정 완료 후, docker-compose.yml의 cloudflared 서비스 정의를 Named Tunnel 방식으로 자동 패치하는 `patchCloudflaredToNamedTunnel()` 함수를 추가했다.

이 함수는:
1. `projectPath/docker-compose.yml` 읽기
2. cloudflared 서비스의 `command`를 `tunnel --no-autoupdate run --token <tunnelToken>`으로 교체
3. `environment`에 `TUNNEL_TOKEN` 추가 (없는 경우)
4. `volumes`에서 quick tunnel용 credentials mount 제거
5. compose 파일 저장
6. `docker compose up -d cloudflared` 실행 (재생성 — restart가 아님)

또한 TunnelStep UI에서 패치 진행 상황을 실시간으로 표시한다:
- "Patching docker-compose.yml..."
- "Restarting cloudflared container..."
- "✅ cloudflared is running with named tunnel"

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/compose-generator.ts` | `patchCloudflaredToNamedTunnel(projectPath, tunnelToken)` 함수 추가 |
| `packages/cli/src/services/admin-server.ts` | tunnel 생성 완료 후 `patchCloudflaredToNamedTunnel()` 자동 호출 |
| `packages/admin-ui/src/features/domain/components/TunnelStep.tsx` | docker 작업 상태 실시간 표시 추가 |
| `packages/admin-ui/src/features/domain/components/CloudflareTunnelModal.tsx` | 완료 화면에 docker 패치 결과 표시 |

## 예방 방법

- Named Tunnel 설정 완료 시 항상 **docker restart가 아닌 `docker compose up -d`** 사용 — compose 파일 변경이 반영되려면 컨테이너 재생성이 필요
- `docker restart`는 compose 정의 변경을 반영하지 않음 — 설정 변경 후 반드시 `up -d`로 재생성
- wizard state에 tunnelToken 저장만으로는 부족 — **compose 파일도 함께 갱신**해야 재부팅 후에도 올바른 모드로 기동됨

## 관련 참고

- 관련 파일: `packages/cli/src/services/compose-generator.ts` (`patchCloudflaredToNamedTunnel`)
- 관련 파일: `packages/cli/src/services/admin-server.ts` (tunnel 생성 핸들러)
- 관련 컴포넌트: `features/domain/components/TunnelStep.tsx`
- 참고 트러블슈팅: `troubleshooting/traefik-port-443-browser-https-upgrade.md` (Quick Tunnel 모드에서 포트 충돌)

---
