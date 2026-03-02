# Nextcloud Quick Tunnel URL 변경 시 trusted_domains 만료 Troubleshooting

> Quick Tunnel URL이 재시작마다 바뀔 때 Nextcloud `trusted_domains` 미등록으로 외부 접근 시 400 "Access through untrusted domain" 오류가 발생하는 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ⚠️ 우회 적용 |
| **에러 타입** | Configuration / Network |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | cloudflared 재시작 시마다 |

### 문제 요약

Nextcloud는 `trusted_domains` 화이트리스트에 없는 호스트로 접근 시 400을 반환. Quick Tunnel URL(`xxx.trycloudflare.com`)은 cloudflared 재시작마다 변경되므로, 이전에 등록한 호스트명이 무효화되어 외부 접근 불가.

정규식 패턴(`/.*\.trycloudflare\.com/`) 방식도 시도했으나 Nextcloud 29에서 신뢰할 수 없는 결과.

### 에러 상세

```
# 브라우저 접근 시
https://new-tunnel-url.trycloudflare.com/cloud
→ HTTP 400 Bad Request

# Nextcloud 응답 HTML
<h1>Access through untrusted domain</h1>
<p>Please contact your administrator. If you are an administrator,
edit the "trusted_domains" setting in config/config.php.</p>
<p>Trusted domains: ['localhost', 'localhost:8443', 'brewnet.local', ...]</p>

# occ 명령으로 확인
docker exec brewnet-nextcloud php occ config:system:get trusted_domains
0: localhost
1: brewnet.local
4: /.*\.trycloudflare\.com/  ← 등록했지만 효과 없음 (NC29)
```

### 근본 원인

1. **Quick Tunnel URL 일시성**: cloudflared Quick Tunnel은 무작위 서브도메인을 매 세션마다 새로 발급. 이전 URL은 즉시 무효화.

2. **정규식 trusted_domains의 불안정성**: Nextcloud 25+에서 `/regex/` 패턴을 지원하지만, Nextcloud 29의 실제 요청 처리에서 `X-Forwarded-Host` 헤더 기반 도메인 검증 시 regex 매칭이 예상대로 동작하지 않는 경우 확인됨.
   - PHP 레벨 regex 테스트 (`preg_match`)는 성공
   - 실제 HTTP 요청에서 400 반환 (Traefik forwarding + header 처리 복잡도)

3. **헬스체크 테스트 방법 오류**: `curl -H "Host: xxx.trycloudflare.com"` 테스트는 실제 Nextcloud 신뢰 도메인 검증 방식(`X-Forwarded-Host`)과 다름. 결과가 false positive 가능.

### 재현 조건

1. Quick Tunnel 모드 Nextcloud 설치 완료
2. `trusted_domains`에 특정 Tunnel URL 등록: `docker exec brewnet-nextcloud php occ config:system:set trusted_domains 5 --value=xxx.trycloudflare.com`
3. cloudflared 재시작: `docker restart brewnet-cloudflared`
4. 새 Tunnel URL 확인: 이전 URL과 다름
5. 새 Tunnel URL로 Nextcloud 접근 → 400

### 해결 방안

**현재 우회책 (매 재시작마다 수동):**

```bash
# 현재 Quick Tunnel URL 확인
docker logs brewnet-cloudflared 2>&1 | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1

# trusted_domains에 새 URL 추가
docker exec brewnet-nextcloud php occ config:system:set trusted_domains 5 \
  --value=<new-tunnel-url>.trycloudflare.com

# 또는 regex 패턴 시도 (NC 버전에 따라 동작할 수 있음)
docker exec brewnet-nextcloud php occ config:system:set trusted_domains 4 \
  --value='/.*\.trycloudflare\.com/'
```

**generate.ts에서 초기 설정 (설치 시 적용):**

```typescript
// packages/cli/src/wizard/steps/generate.ts
// Quick Tunnel URL 추출 후 trusted_domains 등록
const quickTunnelUrl = await extractQuickTunnelUrl(state);
if (quickTunnelUrl) {
  await occ(['config:system:set', 'trusted_domains', '5', `--value=${quickTunnelUrl}`]);
}
// regex fallback (NC 25+ 실험적 지원)
await occ(['config:system:set', 'trusted_domains', '4', '--value=/.*\\.trycloudflare\\.com/']);
```

**미해결 한계:**
- cloudflared 재시작 시 자동 갱신 불가 (미구현)
- Named Tunnel 사용 시 URL 고정 → 이 문제 없음

### 예방 방법

- **근본 해결**: Named Tunnel 사용 (고정 도메인)
- Quick Tunnel 사용 시 cloudflared 재시작 후 반드시 수동 갱신 필요
- 자동화 목표: `brewnet tunnel update-nextcloud` 커맨드 추가 (미구현)
- Quick Tunnel URL 확인 방법: `docker logs brewnet-cloudflared 2>&1 | grep trycloudflare`

### 관련 참고

- 관련 파일: `packages/cli/src/wizard/steps/generate.ts`
- Nextcloud trusted_domains 공식 문서
- cloudflared Quick Tunnel: 임시 URL, 서비스 재시작 시 변경
- Named Tunnel: 고정 커스텀 도메인, `TUNNEL_TOKEN` 필요

---
