# Phase 11 Next.js Unified 스택 Health Check 경로 오류 Troubleshooting

> 이 문서는 test-cycle.sh Phase 11에서 nodejs-nextjs / nodejs-nextjs-full 스택이 health check 실패한 트러블슈팅 히스토리를 기록합니다.

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-19 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Runtime |
| **브랜치** | `001-fix-create-app-modal` |
| **재발 여부** | 최초 발생 |
| **재발 주기** | — |

## 문제 요약

test-cycle.sh Phase 11에서 16종 보일러플레이트 전체 라이프사이클 테스트 실행 시, nodejs-nextjs (nextjs-app)와 nodejs-nextjs-full (nextjs full-stack) 2종이 health check와 페이지 로드에서 실패했다. 나머지 14종은 모두 통과.

## 에러 상세

```
⚠ nodejs-nextjs: localhost health → 404 (http://127.0.0.1:21100/apps/nodejs-nextjs/health)
⚠ nodejs-nextjs: 페이지 → 308 (http://127.0.0.1:21100/apps/nodejs-nextjs/)
❌ nodejs-nextjs 일부 실패

⚠ nodejs-nextjs-full: localhost health → 404 (http://127.0.0.1:21200/apps/nodejs-nextjs-full/health)
⚠ nodejs-nextjs-full: 페이지 → 308 (http://127.0.0.1:21200/apps/nodejs-nextjs-full/)
❌ nodejs-nextjs-full 일부 실패

Phase 11 결과 (14/16 통과)
```

## 근본 원인

Phase 11에서 테스트 앱은 `tc11-node-nx-app` / `tc11-node-nx-full` 이름으로 생성된다. `patchNextConfig(projectDir, appName)` 함수는 Next.js `next.config.js/ts`에 `basePath: '/apps/${appName}'`를 주입한다.

따라서:
- `tc11-node-nx-app` → basePath = `/apps/tc11-node-nx-app`
- `tc11-node-nx-full` → basePath = `/apps/tc11-node-nx-full`

그런데 Phase 11 테스트 코드에서 unified 스택의 health URL을 `STACK_ID`로 구성하고 있었다:

```bash
# 버그 — S_STACK을 사용
HC_URL="http://127.0.0.1:${S_ACTUAL_PORT}/apps/${S_STACK}/health"
PAGE_URL="http://127.0.0.1:${S_ACTUAL_PORT}/apps/${S_STACK}/"
```

`S_STACK`은 `nodejs-nextjs` / `nodejs-nextjs-full` (스택 ID)이지만, 실제 basePath는 앱명(`tc11-node-nx-app` / `tc11-node-nx-full`)을 사용한다. 이 불일치로 404 발생.

- 수동 검증: `curl http://127.0.0.1:21900/apps/tc-verify-nx/health` → 200 ✅
- `curl http://127.0.0.1:21900/apps/nodejs-nextjs/health` → 404 ❌

기존 wizard 배포 앱(`nodejs-nextjs-full`)은 appName = stackId이므로 문제 없었음.

## 재현 조건

1. Phase 11 테스트에서 appName ≠ stackId인 Next.js 앱 생성
   - ex) appName=`tc11-node-nx-full`, stackId=`nodejs-nextjs-full`
2. 테스트가 `/apps/${S_STACK}/health` 경로로 health check 시도
3. → 404 (실제 basePath는 `/apps/${S_APP}`)

## 해결 방안

`test-cycle.sh` Phase 11에서 unified 스택의 health/page URL을 `S_APP` (앱 이름)으로 변경.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `test-cycle.sh` L1748 | `${S_STACK}` → `${S_APP}` (unified health URL) |
| `test-cycle.sh` L1762 | `${S_STACK}` → `${S_APP}` (unified page URL) |
| `test-cycle.sh` L1767 | 허용 HTTP 코드에 `308` 추가 (Next.js trailing-slash redirect) |

```bash
# Before
HC_URL="http://127.0.0.1:${S_ACTUAL_PORT}/apps/${S_STACK}/health"
PAGE_URL="http://127.0.0.1:${S_ACTUAL_PORT}/apps/${S_STACK}/"

# After
HC_URL="http://127.0.0.1:${S_ACTUAL_PORT}/apps/${S_APP}/health"
PAGE_URL="http://127.0.0.1:${S_ACTUAL_PORT}/apps/${S_APP}/"
```

```bash
# Before — 308 미처리
if [ "$PAGE_CODE" = "200" ] || [ "$PAGE_CODE" = "301" ] || [ "$PAGE_CODE" = "302" ]; then

# After — 308 추가 (Next.js trailingSlash:false 기본값으로 slash strip 시 308)
if [ "$PAGE_CODE" = "200" ] || [ "$PAGE_CODE" = "301" ] || [ "$PAGE_CODE" = "302" ] || [ "$PAGE_CODE" = "308" ]; then
```

## 예방 방법

- **Phase 11 테스트 URL 구성**: unified 스택에서 basePath 관련 경로는 `S_STACK`(스택 ID)이 아닌 `S_APP`(앱 이름) 사용
- **Next.js basePath**: `patchNextConfig(dir, appName)` — basePath는 항상 **appName** 기준임. stackId ≠ appName일 수 있음
- **Next.js 응답 코드**: trailing slash redirect는 308 (Permanent Redirect) 반환

## 관련 참고

- 관련 함수: `patchNextConfig()` in `packages/cli/src/services/boilerplate-manager.ts:306`
- 관련 파일: `test-cycle.sh` Phase 11 (L1748, L1762, L1767)
- 관련 이슈: nodejs-nextjs basePath in Next.js stacks

---
