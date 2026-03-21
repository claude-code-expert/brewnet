# Troubleshooting Index

> brewnet 프로젝트에서 발생한 트러블슈팅 히스토리 인덱스입니다.
> 새 이슈는 `/troubleshooting "요약"` 스킬로 자동 기록합니다.

## 이슈 목록

> 재발 이력이 있는 이슈만 유지합니다. 1회성 해결 이슈는 정리되었습니다.

| 파일 | 에러 타입 | 마지막 발생 | 상태 | 재발 횟수 |
|------|-----------|-------------|------|-----------|
| [cloudflare-zone-loading-after-password.md](./cloudflare-zone-loading-after-password.md) | Runtime / Configuration | 2026-03-21 | ✅ 해결됨 | 1 |
| [domain-connect-create-app-failure.md](./domain-connect-create-app-failure.md) | Runtime / Configuration | 2026-03-21 | ✅ 해결됨 | 1 |
| [cloudflared-named-tunnel-not-applied.md](./cloudflared-named-tunnel-not-applied.md) | Docker / Configuration | 2026-03-21 | ✅ 해결됨 | 1 |
| [nextcloud-trusted-domains-quicktunnel-expiry.md](./nextcloud-trusted-domains-quicktunnel-expiry.md) | Configuration / Network | 2026-03-03 | ✅ 해결됨 | 2 |
| [psql-c-gexec-syntax-error.md](./psql-c-gexec-syntax-error.md) | Runtime / Docker | 2026-03-03 | ✅ 해결됨 | 2 |
| [jellyfin-dashboard-url-wrong-hash.md](./jellyfin-dashboard-url-wrong-hash.md) | Configuration | 2026-03-02 | ✅ 해결됨 | 여러 세션 반복 |
| [boilerplate-frontend-port-conflict.md](./boilerplate-frontend-port-conflict.md) | Docker / Configuration | 2026-03-19 | ✅ 해결됨 | 2 |
| [admin-services-table-url-blank.md](./admin-services-table-url-blank.md) | Configuration / Runtime / Network | 2026-03-17 | ✅ 해결됨 | 4 |
| [vite-spa-trailing-slash-blank-screen.md](./vite-spa-trailing-slash-blank-screen.md) | Configuration / Network | 2026-03-17 | ✅ 해결됨 | 2 |

## 에러 타입별 분류

### Runtime / Configuration — 006-domain-settings (2026-03-21)
- [Cloudflare Zone 로드 실패 — Admin Password 입력 후 빈 상태](./cloudflare-zone-loading-after-password.md)
- [create-app 앱 도메인 연결 500 에러 — 앱 이름 해석 오류 + ingress 라우팅 누락](./domain-connect-create-app-failure.md)

### Docker / Configuration — 006-domain-settings (2026-03-21)
- [cloudflared 컨테이너가 Named Tunnel 설정 후에도 Quick Tunnel로 동작](./cloudflared-named-tunnel-not-applied.md)

### Network / Configuration
- [Nextcloud Quick Tunnel URL 변경 시 trusted_domains 만료](./nextcloud-trusted-domains-quicktunnel-expiry.md)

### Runtime / Docker
- [psql -c 플래그와 \\gexec 메타커맨드 호환 불가](./psql-c-gexec-syntax-error.md)

### Configuration
- [Jellyfin 대시보드 URL이 #/home으로 잘못 표시](./jellyfin-dashboard-url-wrong-hash.md)

### Docker / Configuration
- [Boilerplate 프론트엔드 포트 충돌 — Non-unified 스택 FRONTEND_PORT 동적 할당 필요](./boilerplate-frontend-port-conflict.md)

### Configuration / Runtime / Network
- [Admin Dashboard 서비스 테이블 Local/External URL "—" (4회 재발)](./admin-services-table-url-blank.md)

### Configuration / Network
- [Vite SPA Trailing Slash 누락 → 에셋 로드 실패 (2회 재발)](./vite-spa-trailing-slash-blank-screen.md)

## 신규 트러블슈팅 기록 방법

```bash
/troubleshooting "에러 내용 요약"
```

스킬이 자동으로:
1. 적절한 파일명 결정
2. 대화 컨텍스트에서 에러/원인/해결 추출
3. `troubleshooting/` 폴더에 파일 생성
4. 이 README 인덱스 업데이트
