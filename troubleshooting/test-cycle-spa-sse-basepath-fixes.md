# test-cycle.sh 통합 테스트 다중 오류 (SPA/SSE/basePath) Troubleshooting

> 이 문서는 test-cycle.sh의 React SPA 전환 이후 발생한 검증 오류들을 기록합니다.

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

test-cycle.sh 실행 시 4가지 검증 오류가 동시에 발생했다:
1. Phase 4 JS 문법 검사 항상 FAIL (React SPA 전환 후 inline script 없어짐)
2. Phase 6 nodejs-nextjs-full backend 404 (Next.js basePath 미적용)
3. Phase 8.1 Local ≠ External 오탐 (timestamp 필드 차이로 동일한 응답이 다른 것으로 판정)
4. Phase 9.3/10.5 Logs SSE Content-Type 오탐 (`Access-Control-Allow-Headers` 헤더 오매칭)

추가로: `cfg.devStack.languages` undefined 오류로 test-cycle.sh 자체가 실행 불가.

## 에러 상세

```bash
# 1. Phase 4 JS 문법 검사
✗ JS 문법 오류 감지: FAIL

# 2. Phase 6 nodejs-nextjs-full
nodejs-nextjs-full  ❌ 404  — (통합)  ❌ 404  ✅ 200

# 3. Phase 8.1
✗ nodejs-nextjs-full: Local ≠ External
  Local:    {"status":"ok","timestamp":"2026-03-19T02:18:40.125Z","db_connected":false}
  External: {"status":"ok","timestamp":"2026-03-19T02:18:40.221Z","db_connected":false}

# 4. Phase 9.3 Logs SSE
⚠ Logs 헤더: Access-Control-Allow-Headers: Content-Type, X-Admin-Password

# 5. 스크립트 실행 오류
TypeError: Cannot read properties of undefined (reading 'length')  [cfg.devStack.languages]
```

## 근본 원인

### 1. JS 문법 검사 (Phase 4)
이전엔 admin 패널이 inline `<script>` 태그에 JS를 직접 포함했지만, React SPA로 전환 후 모든 JS가 `/assets/index-xxx.js` external bundle로 이동. `sed -n '/<script>/,/<\/script>/p'` 는 아무 것도 추출하지 못하고, `node --check /dev/stdin`에 빈 입력 → "FAIL".

### 2. Next.js basePath 헬스체크 (Phase 6)
nodejs-nextjs-full은 Next.js basePath `/apps/nodejs-nextjs-full`이 설정되어 있어 모든 라우트가 `/apps/nodejs-nextjs-full/*` 하위에 있음. `/health`는 404, 실제 헬스체크는 `/apps/nodejs-nextjs-full/health`. 테스트는 `/health`를 직접 호출.

### 3. Local ≠ External 오탐 (Phase 8.1)
health endpoint 응답: `{"status":"ok","timestamp":"...","db_connected":false}`. Local과 External은 각각 독립적인 요청이므로 timestamp가 다름. body 전체를 문자열로 비교하면 항상 불일치.

### 4. Logs SSE Content-Type 오매칭 (Phase 9.3/10.5)
`curl -I` HEAD 요청 후 `grep -i 'content-type'` → `Access-Control-Allow-Headers: Content-Type, X-Admin-Password` 줄이 먼저 매칭됨. 실제 `Content-Type: text/event-stream`은 첫 번째 결과에서 밀려남.

### 5. cfg.devStack.languages undefined
`selections.json`의 `devStack` 필드가 `{}` (빈 객체)인데 `cfg.devStack.languages`로 직접 접근 → undefined.

## 재현 조건

1. React SPA 빌드 적용 후 test-cycle.sh 실행
2. selections.json에 devStack이 `{}`인 환경
3. nodejs-nextjs-full 스택이 basePath 설정으로 배포된 상태
4. test-cycle.sh Phase 6, 8.1, 9.3 실행

## 해결 방안

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `test-cycle.sh` L202 | `cfg.devStack.languages` → `cfg.devStack?.languages \|\| []` |
| `test-cycle.sh` L210-211 | `cfg.boilerplate.generate` → `cfg.boilerplate?.generate` |
| `test-cycle.sh` Phase 4 JS check | inline script 검사 → external bundle URL 추출 후 검사 |
| `test-cycle.sh` Phase 6 L901 | `/health` → unified 스택은 `/apps/${STACK_ID}/health` |
| `test-cycle.sh` Phase 6 L926 | Image URL도 unified 스택은 `/apps/${STACK_ID}/brewnet-site-banner.png` |
| `test-cycle.sh` Phase 8.1 | body 전체 비교 → `status` 필드만 node로 추출해 비교 |
| `test-cycle.sh` Phase 9.3/10.5 | `curl -I + grep 'content-type'` → `curl -v + grep '^< content-type'` |

**Phase 4 JS 검사 수정:**
```bash
# Before
SYNTAX_CHECK=$(curl -s "http://localhost:${ADMIN_PORT}" \
  | sed -n '/<script>/,/<\/script>/p' | node --check /dev/stdin)

# After
JS_BUNDLE=$(curl -s "http://localhost:${ADMIN_PORT}" \
  | grep -o 'src="/assets/[^"]*\.js"' | head -1 | sed 's/src="//;s/"//')
SYNTAX_CHECK=$(curl -s "http://localhost:${ADMIN_PORT}${JS_BUNDLE}" | node --check /dev/stdin)
```

**Phase 6 basePath 수정:**
```bash
# Before
BE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BE_HOST_PORT}/health")

# After
if [ "$IS_UNIFIED" = "1" ]; then
  BE_HEALTH_PATH="/apps/${STACK_ID}/health"
else
  BE_HEALTH_PATH="/health"
fi
BE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BE_HOST_PORT}${BE_HEALTH_PATH}")
```

**Phase 8.1 status 필드 비교:**
```bash
# Before
if [ "$LOCAL_BODY" = "$EXT_BODY" ]; then ...

# After — timestamp 제외하고 status 필드만 비교
LOCAL_STATUS=$(echo "$LOCAL_BODY" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.status||'')" 2>/dev/null)
EXT_STATUS=$(echo "$EXT_BODY" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.status||'')" 2>/dev/null)
if [ -n "$LOCAL_STATUS" ] && [ "$LOCAL_STATUS" = "$EXT_STATUS" ]; then ...
```

**Phase 9.3 SSE Content-Type 수정:**
```bash
# Before (오탐)
LOGS_CT=$(curl -s -I --max-time 3 "..." | grep -i 'content-type' | head -1)

# After (정확)
LOGS_CT=$(curl -s -v --max-time 2 "..." 2>&1 | grep -i '^< content-type' | head -1)
```

또한 `--skip-init` 플래그를 추가하여 기존 환경에서 부분 테스트 가능:
```bash
./test-cycle.sh --skip-init   # build/uninstall/init 모두 건너뜀
```

## 예방 방법

- **SPA 전환 시**: 모든 테스트 스크립트의 JS 검사, 에셋 서빙 검증 방식 재검토
- **basePath 적용 스택**: 헬스체크/이미지/API URL에 basePath prefix 추가 필수
- **동적 필드 비교**: timestamp, nonce 등 요청마다 달라지는 필드는 비교에서 제외
- **SSE Content-Type 검증**: `curl -v` GET 요청 + `^< content-type` 패턴 사용 (HEAD 요청 금지)
- **WizardState 접근**: 모든 중첩 필드는 optional chaining (`?.`) 사용

## 관련 참고

- 관련 파일: `test-cycle.sh`, `packages/cli/src/services/cloudflare-client.ts`
- 관련 이슈: Phase 6 nodejs-nextjs-full basePath, admin-react-migration SPA 전환

---
