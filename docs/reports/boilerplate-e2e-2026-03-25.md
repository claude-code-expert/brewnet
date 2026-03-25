# Brewnet 보일러플레이트 E2E 테스트 결과

> **실행일**: 2026-03-25 02:44 UTC
> **시작**: 2026-03-25T00:31:19Z
> **총 스택**: 16/16

## 요약

| 항목 | 수치 |
|------|------|
| ✅ PASS  | 15/16 |
| ⚠️ PARTIAL | 0/16 |
| ❌ FAIL  | 1/16 |
| 성공률  | 93.8% |

## 스택별 결과

| 스택 | 결과 | 소요 시간 | 상세 |
|------|------|-----------|------|
| go-gin | ✅ PASS | 41s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:41s |
| go-echo | ✅ PASS | 41s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:41s |
| go-fiber | ✅ PASS | 35s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:35s |
| rust-actix-web | ✅ PASS | 32s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:32s |
| rust-axum | ✅ PASS | 32s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:32s |
| java-springboot | ✅ PASS | 36s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:36s |
| java-spring | ✅ PASS | 37s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:37s |
| kotlin-ktor | ✅ PASS | 37s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:37s |
| kotlin-springboot | ✅ PASS | 36s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:36s |
| nodejs-express | ❌ FAIL | 5s | create-app 실패 (status=failed) |
| nodejs-nestjs | ✅ PASS | 32s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:32s |
| nodejs-nextjs | ✅ PASS | 50s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:50s |
| nodejs-nextjs-full | ✅ PASS | 51s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:51s |
| python-fastapi | ✅ PASS | 46s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:46s |
| python-django | ✅ PASS | 41s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:41s |
| python-flask | ✅ PASS | 41s | health:true stop/start:true/true logs:false gitea:true deploy:true tunnel:false elapsed:41s |

## 문제점 분석

### nodejs-express (FAIL)

- **상세**: create-app 실패 (status=failed)
- **소요**: 5s

## 개선사항 및 개발 계획

### 즉시 수정 필요 (P0)

- 실패 스택 1종에 대한 원인 분석 및 수정
- create-app API 에러 처리 강화
- Rust/Java/Kotlin 스택 빌드 타임아웃 안내 메시지 추가

### 단기 개선 (P1)

- health check 엔드포인트 표준화 (`/health` → 모든 스택 필수)
- Gitea repo 자동 생성 실패 시 재시도 로직 추가
- 외부 터널 URL 연결 상태 폴링 개선
- start/stop API 응답 지연 처리 (현재 동기식)

### 장기 계획 (P2)

- 스택별 CI/CD 파이프라인 자동화
- 멀티 스택 동시 테스트 지원
- 빌드 캐시 활용으로 Rust/Java 빌드 시간 단축
- E2E 테스트 결과 대시보드 (Admin UI 내 표시)

---

*이 리포트는 `tests/e2e/stack-loop-test.sh` 에 의해 자동 생성되었습니다.*
