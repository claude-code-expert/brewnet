# Troubleshooting Index

> brewnet 프로젝트에서 발생한 트러블슈팅 히스토리 인덱스입니다.
> 새 이슈는 `/troubleshooting "요약"` 스킬로 자동 기록합니다.

## 이슈 목록

| 파일 | 에러 타입 | 마지막 발생 | 상태 | 재발 횟수 |
|------|-----------|-------------|------|-----------|
| [pnpm-monorepo-path-after-move.md](./pnpm-monorepo-path-after-move.md) | Package / Configuration | 2026-03-01 | ✅ 해결됨 | 1 |
| [pgadmin-startup-fetch-failed.md](./pgadmin-startup-fetch-failed.md) | Network / Docker / Runtime | 2026-03-01 | ✅ 해결됨 | 1 |
| [docker-compose-traefik-interpolation.md](./docker-compose-traefik-interpolation.md) | Docker / Configuration | 2026-03-02 | ✅ 해결됨 | 1 |
| [nextcloud-startup-health-check-timeout.md](./nextcloud-startup-health-check-timeout.md) | Network / Docker / Runtime | 2026-03-02 | ✅ 해결됨 | 1 |
| [pgadmin-script-name-bad-request.md](./pgadmin-script-name-bad-request.md) | Configuration / Runtime | 2026-03-02 | ✅ 해결됨 | 1 |
| [filebrowser-external-access-baseurl.md](./filebrowser-external-access-baseurl.md) | Network / Configuration | 2026-03-02 | ✅ 해결됨 | 1 |
| [filebrowser-credentials-boltdb-lock.md](./filebrowser-credentials-boltdb-lock.md) | Docker / Runtime / Configuration | 2026-03-02 | ✅ 해결됨 | 1 |
| [minio-quicktunnel-routing-missing.md](./minio-quicktunnel-routing-missing.md) | Configuration / Docker | 2026-03-02 | ✅ 해결됨 | 1 |
| [gitea-subpath-direct-port-css-broken.md](./gitea-subpath-direct-port-css-broken.md) | Configuration / Docker | 2026-03-02 | ✅ 해결됨 | 1 |
| [jellyfin-baseurl-healthcheck-mismatch.md](./jellyfin-baseurl-healthcheck-mismatch.md) | Configuration / Network | 2026-03-02 | ✅ 해결됨 | 1 |
| [filebrowser-login-redirect-404-settings-json.md](./filebrowser-login-redirect-404-settings-json.md) | Configuration / Runtime | 2026-03-02 | ✅ 해결됨 | 1 |
| [nextcloud-trusted-domains-quicktunnel-expiry.md](./nextcloud-trusted-domains-quicktunnel-expiry.md) | Configuration / Network | 2026-03-03 | ✅ 해결됨 | 2 |
| [psql-c-gexec-syntax-error.md](./psql-c-gexec-syntax-error.md) | Runtime / Docker | 2026-03-03 | ✅ 해결됨 | 2 |
| [jellyfin-dashboard-url-wrong-hash.md](./jellyfin-dashboard-url-wrong-hash.md) | Configuration | 2026-03-02 | ✅ 해결됨 | 여러 세션 반복 |
| [wizard-boilerplate-generate-missing-call.md](./wizard-boilerplate-generate-missing-call.md) | Configuration / Runtime | 2026-03-03 | ✅ 해결됨 | 1 |
| [gitea-db-auth-install-lock-missing.md](./gitea-db-auth-install-lock-missing.md) | Configuration / Docker | 2026-03-03 | ✅ 해결됨 | 1 |

## 에러 타입별 분류

### Package / Configuration
- [pnpm 모노레포 폴더 이동 후 npm install 실패](./pnpm-monorepo-path-after-move.md)

### Network / Docker / Runtime
- [pgAdmin 기동 시 서비스 검증 fetch failed](./pgadmin-startup-fetch-failed.md)
- [Nextcloud 기동 시 헬스체크 타임아웃](./nextcloud-startup-health-check-timeout.md)

### Docker / Configuration
- [Docker Compose Traefik 레이블 인터폴레이션 오류](./docker-compose-traefik-interpolation.md)

### Configuration / Runtime
- [pgAdmin SCRIPT_NAME Bad Request](./pgadmin-script-name-bad-request.md)
- [FileBrowser 로그인 후 404 (settings.json BaseURL 우선순위)](./filebrowser-login-redirect-404-settings-json.md)

### Network / Configuration
- [FileBrowser 외부 접근 불가 (FB_BASEURL 누락)](./filebrowser-external-access-baseurl.md)
- [Jellyfin BaseUrl 설정 시 헬스체크 경로 불일치](./jellyfin-baseurl-healthcheck-mismatch.md)
- [Nextcloud Quick Tunnel URL 변경 시 trusted_domains 만료](./nextcloud-trusted-domains-quicktunnel-expiry.md)

### Docker / Runtime / Configuration
- [FileBrowser 초기 계정/비밀번호 적용 불가 (BoltDB 잠금)](./filebrowser-credentials-boltdb-lock.md)

### Configuration / Docker
- [MinIO Quick Tunnel 라우팅 누락 + Named Tunnel 포트 오류](./minio-quicktunnel-routing-missing.md)
- [Gitea 서브패스 설정 시 직접 포트 접근 CSS 깨짐](./gitea-subpath-direct-port-css-broken.md)

### Runtime / Configuration
- [psql -c 플래그와 \\gexec 메타커맨드 호환 불가](./psql-c-gexec-syntax-error.md)

### Configuration
- [Jellyfin 대시보드 URL이 #/home으로 잘못 표시](./jellyfin-dashboard-url-wrong-hash.md)

### Configuration / Runtime
- [Wizard Dev Stack 보일러플레이트 GitHub 클론 미실행 (generate.ts 누락 호출)](./wizard-boilerplate-generate-missing-call.md)
- [Gitea DB 인증 실패 — INSTALL_LOCK 누락으로 웹 설치 마법사 실행 후 app.ini 덮어쓰기](./gitea-db-auth-install-lock-missing.md)

## 신규 트러블슈팅 기록 방법

```bash
/troubleshooting "에러 내용 요약"
```

스킬이 자동으로:
1. 적절한 파일명 결정
2. 대화 컨텍스트에서 에러/원인/해결 추출
3. `troubleshooting/` 폴더에 파일 생성
4. 이 README 인덱스 업데이트
