# Wizard Boilerplate Not Cloned from GitHub Troubleshooting

> 위자드 Step 3에서 Dev Stack을 설정해도 GitHub에서 보일러플레이트가 클론되지 않던 문제를 기록합니다.

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-03 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Runtime |
| **브랜치** | feature/boilerplate |
| **재발 여부** | 최초 발생 |
| **재발 주기** | — |

## 문제 요약

위자드 Step 3 (Dev Stack & Runtime)에서 Python/FastAPI + React 스택을 선택하고 boilerplate 생성을 "Yes"로 답해도, Step 6 (Generate & Start) 실행 후 `apps/` 디렉토리가 생성되지 않고 GitHub에서 소스가 클론되지 않음. `brewnet init` 완료 후 `http://localhost:8080` (FastAPI 백엔드)에 접근 불가.

## 에러 상세

```
# 증상 — 에러 메시지는 없음. 단순히 apps/ 디렉토리가 없음
ls ~/.brewnet/<project>/apps/
# → ls: cannot access '~/.brewnet/<project>/apps/': No such file or directory

# 예상 동작: apps/python-fastapi/ 디렉토리에 FastAPI 프로젝트가 클론되어야 함
# GET http://127.0.0.1:8080/health → Connection refused (앱이 구동되지 않음)
```

## 근본 원인

**두 개의 별개 보일러플레이트 시스템이 공존하지만 위자드와 연결되지 않음:**

### System A: `boilerplate-manager.ts` + `create-app` 커맨드 (구현 완료)
- `brewnet create-app <name>` 명령어에서 사용
- GitHub brewnet-boilerplate 레포에서 16개 스택 중 하나를 클론
- `cloneStack()` → `generateEnv()` → `startContainers()` → `pollHealth()` → `verifyEndpoints()` 완전 구현

### System B: `boilerplate-generator.ts` (로컬 템플릿, 위자드 미연결)
- 인라인 템플릿으로 로컬 파일 생성 (Next.js, FastAPI, Spring Boot 등)
- `generateBoilerplate(state, outputDir)` 함수 존재하지만 아무데서도 호출 안 됨

### 핵심 갭: `generate.ts`에 누락된 연결
`packages/cli/src/wizard/steps/generate.ts` — `runGenerateStep()` 함수에서 `boilerplate.generate === true`일 때 보일러플레이트를 시작하는 코드가 완전히 빠져 있었음.

추가로, wizard의 frameworkId (`fastapi`, `nextjs-app`, `springboot-kt`)와 CONNECT_BOILERPLATE.md의 stackId (`python-fastapi`, `nodejs-nextjs`, `kotlin-springboot`) 간 매핑 함수가 없었음.

## 재현 조건

1. `brewnet init` 실행
2. Step 3에서 언어(예: Python), 프레임워크(FastAPI) 선택
3. "Generate boilerplate project files?" → Yes
4. Step 6 완료 후 `ls <projectPath>/apps/` 확인
5. → 디렉토리 없음

## 해결 방안

### 1. stackId 매핑 함수 추가

`packages/cli/src/config/frameworks.ts`에 `resolveStackId(language, frameworkId)` 추가:
- 대부분은 `<language>-<frameworkId>` 패턴
- 예외: `nodejs/nextjs` → `nodejs-nextjs-full`, `nodejs/nextjs-app` → `nodejs-nextjs`, `kotlin/springboot-kt` → `kotlin-springboot`

### 2. generate.ts에 7b 섹션 추가

`state.boilerplate.generate === true && state.devStack.languages.length > 0`인 경우:
1. 첫 번째 선택된 언어 + 프레임워크로 stackId 결정
2. `cloneStack(stackId, appDir)` — GitHub에서 `stack/<stackId>` 브랜치 클론
3. `boilerplateGenerateEnv(appDir, stackId, 'sqlite3')` — .env 생성 (sqlite3으로 포트 충돌 방지)
4. `boilerplateStartContainers(appDir)` — `docker compose up -d --build`
5. `boilerplatePollHealth(baseUrl, healthTimeoutMs)` — /health 폴링 (Rust: 600s)
6. `boilerplateVerifyEndpoints(baseUrl)` — /api/hello, /api/echo 검증
7. `.brewnet-boilerplate.json` 메타데이터 파일 작성

### 3. admin-server.ts 업데이트

`createAdminServer()`에서 `.brewnet-boilerplate.json` 읽기:
- `DashboardConfig`에 `boilerplateHtml: string` 추가
- HTML에 "Dev Stack App" 섹션 주입 (Stack, Backend, Frontend, API Docs, Source 컬럼)

### 4. complete.ts 업데이트

Step 7 (Complete)에서 `.brewnet-boilerplate.json` 읽어 스택 접근 URL 표시:
- Stack ID, Backend URL, Frontend URL, 소스 경로, make 명령어 안내

### 코드 변경

#### Phase 1 (최초 구현)
| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/config/frameworks.ts` | `resolveStackId(language, frameworkId)` 함수 추가 (STACK_ID_MAP + 16개 스택 검증) |
| `packages/cli/src/wizard/steps/generate.ts` | 섹션 7b 추가 — 보일러플레이트 클론/시작/검증 + `.brewnet-boilerplate.json` 작성 |
| `packages/cli/src/services/admin-server.ts` | `DashboardConfig.boilerplateHtml` 추가, Dev Stack App 섹션 HTML 생성 |
| `packages/cli/src/wizard/steps/complete.ts` | `.brewnet-boilerplate.json` 읽어 완료 화면에 앱 접근 URL 표시 |
| `tests/unit/cli/config/frameworks.test.ts` | `resolveStackId()` 테스트 20개 추가 (16 stacks + 예외 케이스 + null 케이스) |

#### Phase 2 (종합 개선 — 2026-03-03)
| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/boilerplate-manager.ts` | `generateEnv()`에 `opts?: GenerateEnvOpts` 추가 — `dbUser`, `dbPassword`, `dbName` 오버라이드. `buildPrismaDatabaseUrl()` 파라미터 확장 |
| `packages/cli/src/wizard/steps/generate.ts` | 섹션 7b 전면 재작성: 모든 선택 언어 루프, wizard DB 설정 사용, 클론 경로 `apps/` 제거, `.brewnet-boilerplate.json` 배열로 변경, 한국어 진행 메시지 |
| `packages/cli/src/services/admin-server.ts` | `BoilerplateMeta` 타입 추가, 배열/단일 객체 호환 파싱, `BOILERPLATE_STACKS` JS 변수, `showBoilerplateModal()` 함수 (git 브랜치, DB 자격증명, API 엔드포인트, README 링크 포함) |
| `packages/cli/src/wizard/steps/complete.ts` | 배열 지원으로 업데이트, 모든 스택 반복 출력 |
| `tests/unit/cli/create-app/env-generation.test.ts` | `opts` 커스텀 자격증명 테스트 11개 추가 |
| `tests/unit/cli/services/admin-server.test.ts` | `BOILERPLATE_STACKS` 및 `showBoilerplateModal` HTML 테스트 3개 추가 |

## 검증 명령어

```bash
# 테스트 실행
pnpm test --no-coverage
# → Test Suites: 1 skipped, 63 passed; Tests: 2609 passed

# 실제 검증 (위자드 실행 후, stackId 예: python-fastapi)
ls <projectPath>/python-fastapi/    # apps/ 하위가 아닌 projectPath 직하위
curl http://127.0.0.1:8080/health
# → {"status":"ok","timestamp":"...","db_connected":true}

curl http://127.0.0.1:8080/api/hello
# → {"message":"Hello from FastAPI!","lang":"python","version":"3.12.x"}

curl -X POST http://127.0.0.1:8080/api/echo \
  -H "Content-Type: application/json" \
  -d '{"test":"brewnet"}'
# → {"test":"brewnet"}
```

## 예방 방법

- 위자드의 새 사용자 선택 항목이 생기면, `generate.ts`에서 해당 설정을 실제로 사용하는지 반드시 확인
- `state.boilerplate.generate` 같은 플래그는 **수집(collect)** 단계와 **실행(execute)** 단계가 분리되어 있으므로, 실행 단계에서 플래그를 확인하는 코드가 있는지 검토 필요
- 새 스택 ID를 추가할 때는 반드시 `frameworks.ts`의 `STACK_ID_MAP`과 `VALID_STACK_IDS`를 함께 업데이트
- `.brewnet-boilerplate.json`은 배열 형식. 단일 객체는 레거시 호환을 위해 admin-server/complete에서 자동 변환됨

## 관련 참고

- 관련 파일: `packages/cli/src/wizard/steps/generate.ts` (섹션 7b)
- 관련 파일: `packages/cli/src/config/frameworks.ts` (`resolveStackId`)
- 관련 파일: `packages/cli/src/services/boilerplate-manager.ts` (`generateEnv`, `GenerateEnvOpts`)
- 참고 문서: `docs/CONNECT_BOILERPLATE.md` (16 stacks, API contract)
- 보일러플레이트 레포: `https://github.com/claude-code-expert/brewnet-boilerplate.git`

---
