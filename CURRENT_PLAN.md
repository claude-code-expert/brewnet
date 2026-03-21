# CURRENT_PLAN — App Deploy UI 버그 수정 및 기능 패치

**브랜치**: `005-app-deploy-ui`
**작성일**: 2026-03-17
**상태**: 개발 대기

---

## 개요

App Deploy 페이지(`/apps`)의 5가지 주요 이슈를 분석하고 수정 계획을 수립한다.

---

## Issue 1: Git Server 링크 404 오류

### 증상
- "Git Server에서 관리 →" 버튼 클릭 시 `http://localhost:8088/git` 으로 이동하여 404 에러
- Gitea repo 테이블의 "접근" 열 링크도 동일 이슈 가능성

### 근본 원인
`apps-page.ts:204` — `<a href="/git">` 는 상대 경로. Admin 패널이 `localhost:8088`에서 실행되므로 `http://localhost:8088/git`으로 해석됨.
실제 Gitea 주소는 `http://localhost/git` (Traefik 리버스 프록시 경유, 포트 80).

**관련 소스**:
- `app-manager.ts:268` — `giteaBaseUrl = 'http://localhost/git'` (올바른 값)
- `admin-server.ts:650` — `TRAEFIK_PATH_SERVICES.gitea = 'http://localhost/git'` (올바른 값)
- `apps-page.ts:204` — `<a href="/git">` ← **이것이 문제**
- `apps-page.ts:672` — repo의 `html_url`은 Gitea API에서 오므로 정확, fallback이 `http://localhost/git/admin/...`으로 올바름

### 수정 계획

| 파일 | 라인 | 변경 |
|------|------|------|
| `apps-page.ts` | 204 | `href="/git"` → `href="http://localhost/git"` |

### 리스크
- 낮음. 단순 링크 수정.

---

## Issue 2: 앱 생성 Progress 모달 진행 멈춤

### 증상
- New App 생성 시 Progress 모달에서 Step 2(Gitea setup)만 완료되고 나머지 단계 진입 안됨
- Step 1(Validating)이 체크 없이 건너뛰어짐 (wait 상태 유지)
- 에러 메시지가 화면에 표시되지 않음

### 근본 원인 분석

**실행 순서 (app-manager.ts)**:
```
Job steps: [0: Validating, 1: Gitea setup, 2: Gitea repo, 3: Git push, 4: Docker up, 5: Health check]

_runCreateApp() 실행 순서:
  1. setStep(job, 1, 'running')  → Gitea setup 시작
  2. setStep(job, 1, 'done')     → Gitea setup 완료
  3. _createModeA/B/C() 호출
     └→ setStep(job, 0, 'running')  → Validating 시작 (Step 1 이후!)
     └→ setStep(job, 0, 'done')     → Validating 완료
     └→ setStep(job, 2~5, ...)      → 나머지 단계
```

**문제 1: 단계 순서 불일치**
- `_runCreateApp()`이 Step 1(Gitea setup)을 먼저 실행한 뒤, Mode 함수에서 Step 0(Validating)을 뒤늦게 실행
- UI에서는 배열 순서(0→1→2→3→4→5)로 표시하므로 Step 0이 미완료인데 Step 1이 완료인 비정상 상태 발생

**문제 2: Boilerplate 미설치 시 무조건 실패**
- `_createModeA()` Line 362-364: `readBoilerplateMeta()`에서 `stackId`를 찾지 못하면 즉시 throw
- 이미 `brewnet init`으로 설치된 보일러플레이트만 연결 가능
- Apps 페이지 BOILERPLATES 목록(12개)과 실제 설치된 스택이 불일치하면 실패

**문제 3: 에러가 화면에 표시되지 않음**
- `startJobPoll()` Line 756: job.status가 'failed'일 때 `job.error`를 toast로만 표시
- Progress 모달의 step들은 'failed' 상태를 표시하지만, 구체적 에러 메시지가 log 영역에 나오지 않음
- SSE 로그(`startSseLogs`)는 Deploy에서만 호출되고, 앱 생성 시에는 호출되지 않음

### 수정 계획

| # | 파일 | 변경 내용 |
|---|------|----------|
| 2a | `app-manager.ts` | 단계 순서 정상화: Step 0(Validating) → Step 1(Gitea setup) → Step 2~5 순서로 실행 |
| 2b | `apps-page.ts` | Progress 모달에 에러 메시지 표시 영역 추가. job.error를 log-content에 출력 |
| 2c | `apps-page.ts` | 실패 시 어느 단계에서 에러가 났는지 step.message에 표시 |
| 2d | `apps-page.ts` | Boilerplate 탭에서 설치되지 않은 템플릿 표시 (비활성화 또는 "미설치" 표기) |

### 세부 설계

**2a: 단계 순서 정상화**
```
_runCreateApp 변경:
  1. setStep(job, 0, 'running') → Validating
  2. (mode별 validation 로직)
  3. setStep(job, 0, 'done')
  4. setStep(job, 1, 'running') → Gitea setup
  5. gitea.prepare()
  6. setStep(job, 1, 'done')
  7. mode별 나머지 (step 2~5)
```

**2b: Progress 모달 에러 표시**
```javascript
// startJobPoll 내 failed 감지 시:
if(r.status==='failed'){
  // 기존: toast만
  // 추가: log-content에 에러 메시지 표시
  document.getElementById('progress-log').style.display='block';
  document.getElementById('log-content').textContent='❌ Error: '+(r.error||'Unknown error');
}
```

**2d: 보일러플레이트 필터링**
- `refreshAll()`에서 `/api/apps/boilerplates` 조회하여 설치된 stackId 목록 확인
- BOILERPLATES 리스트에서 미설치 항목은 비활성 처리하거나 "(미설치)" 표기

### 리스크
- 중간. 단계 순서 변경 시 기존 테스트 영향 확인 필요.

---

## Issue 3: Boilerplate vs New Project 차이 명확화

### 현재 동작 분석

| 항목 | Boilerplate (Mode A) | New Project (Mode C) |
|------|---------------------|---------------------|
| **목적** | `brewnet init`에서 이미 설치된 보일러플레이트를 Gitea에 연결 | 새로운 프로젝트를 스택 템플릿에서 클론하여 독립 생성 |
| **소스 경로** | 기존 `projectPath/<stackId>` 디렉토리 사용 | 새로 `projectPath/apps/<appName>` 에 클론 |
| **핵심 함수** | `readBoilerplateMeta()` → 설치된 스택 조회 | `cloneStack()` → GitHub에서 새로 클론 |
| **Docker** | 기존 컨테이너가 이미 실행 중일 수 있음 (재빌드) | 완전 새 컨테이너 생성 |
| **실패 조건** | `.brewnet-boilerplate.json`에 stackId 없으면 실패 | `resolveStackId()` 미매칭 시 실패 |

### 관련 소스
- `app-manager.ts:353-423` — `_createModeA()` (보일러플레이트)
- `app-manager.ts:477-536` — `_createModeC()` (새 프로젝트)
- `app-manager.ts:236-243` — `readBoilerplateMeta()`
- `boilerplate-manager.ts` — `cloneStack()`, `generateEnv()`, `reinitGit()`

### UI 개선 필요사항
- Boilerplate 탭: "이미 설치된 보일러플레이트를 Gitea에 연결합니다" 안내 문구
- New Project 탭: "스택 템플릿에서 새 프로젝트를 생성합니다" 안내 문구
- Boilerplate 탭에서 미설치된 템플릿은 비활성화 처리

### /add-md 대상
- `docs/research/GITEA_APP_DEPLOY_SPEC.md`에 Mode A/C 차이 시나리오 문서화

---

## Issue 4: Logs 탭 분석 (수정 없음, 분석만)

### 현재 구현

**Admin 대시보드 Logs 탭** (`admin-server.ts:292-326`):
- 시스템 전체 로그 (Docker 컨테이너 로그 아님)
- `/api/logs` 엔드포인트: `~/.brewnet/logs/` 디렉토리의 JSONL 파일들을 조회
- Auto-refresh 5초 간격, 서비스/레벨 필터링 가능
- 용도: Brewnet 시스템 이벤트 로그 (서비스 시작/정지/에러 등)

**Apps 페이지 Progress 모달 로그** (`apps-page.ts:777-788`):
- SSE 스트림 (`/api/apps/:name/logs`)
- `docker compose logs --follow --tail 50` 의 실시간 출력
- Deploy 시에만 호출됨 (`startSseLogs()`)
- 용도: 빌드/배포 중 실시간 컨테이너 로그

### 결론
- Admin 대시보드의 Logs 탭은 시스템 레벨 로그 뷰어로 정상 목적 있음
- Apps 페이지의 log 영역은 빌드/배포 진행 중에만 의미 있음
- **수정 불필요** — 단, 앱 생성 시에도 로그 표시가 되면 디버깅에 유용 (Issue 2와 연계)

---

## Issue 5: Admin 대시보드 Frontend/Backend External URL 미표시

### 증상
- Admin 패널의 Dev Stack Apps 테이블에 External URL이 표시되지 않음
- Services 테이블의 External 컬럼도 `—` 표시 가능

### 근본 원인 분석

**두 가지 별개 문제가 존재:**

#### 문제 A: Services 테이블 External URL이 `—`로 표시

**렌더링 로직** (`admin-server.ts:441-458`):
- `getExternalUrl(s.id)` → `EXT_PATHS[id]`에서 경로 조회 → `quickTunnelUrl + path`로 URL 생성
- `quickTunnelUrl`이 빈 문자열이면 **모든 서비스의 External이 null**

**핵심 버그: `quickTunnelUrl`이 `selections.json`에 저장되지 않음**

1. `generate.ts:642-644` — Quick Tunnel URL을 캡처 후 `state.domain.cloudflare.quickTunnelUrl`에 설정
2. `init.ts:307-345` — `runGenerateStep(state)` 완료 후 **`saveState(state)` 미호출**
3. 결과: `selections.json`에 `quickTunnelUrl: ""` 잔류 → 서버 재시작 시 빈 값 로드

**Fallback 메커니즘** (`admin-server.ts:1030-1051`):
- `detectQuickTunnelUrl()`: cloudflared 컨테이너 로그 tail-50에서 regex로 URL 파싱
- **단 1회만 시도** (`quickTunnelDetected = true` 설정, L1032)
- cloudflared가 아직 시작 안 됐거나 로그에 URL이 tail-50 범위 밖이면 영구 실패

#### 문제 B: Dev Stack Apps 테이블에 External 컬럼 부재

**현재 컬럼** (`admin-server.ts:948-981`): Stack, Status, Backend, Frontend, API Docs, Source
- **External 컬럼 자체가 없음**
- Backend/Frontend URL은 로컬 URL만 표시 (예: `http://127.0.0.1:8080`)
- 보일러플레이트 앱은 Traefik PathPrefix 라우팅 미사용 (각 포트로 직접 접근)
- Quick Tunnel은 포트 80만 터널링 → 보일러플레이트 개별 포트 외부 노출 불가

### 수정 계획

| # | 파일 | 변경 내용 | 우선순위 |
|---|------|----------|---------|
| 5a | `init.ts` | Generate step 완료 후 `saveState(state)` 호출 추가 | **높음** |
| 5b | `admin-server.ts` | `detectQuickTunnelUrl()` 재시도 메커니즘: 첫 실패 시 30초 후 1회 재시도 | 중간 |
| 5c | `admin-server.ts` | `buildBoilerplateSectionHtml()`에 External 컬럼 추가 | **에스컬레이션 후** |

### 세부 설계

**5a: quickTunnelUrl 저장 (핵심 수정)**
```typescript
// init.ts — WizardStep.Generate case 내부
case WizardStep.Generate: {
  const generateResult = await runGenerateStep(state);
  saveState(state);  // ← 추가: quickTunnelUrl 등 런타임 값 영속화
  // ... switch(generateResult) ...
}
```

**5b: detectQuickTunnelUrl 재시도**
```typescript
async function detectQuickTunnelUrl(): Promise<void> {
  if (quickTunnelDetected) return;
  // 첫 시도
  const found = await _tryDetectFromLogs();
  if (found) { quickTunnelDetected = true; return; }
  // 30초 후 1회 재시도
  setTimeout(async () => {
    const found2 = await _tryDetectFromLogs();
    if (found2) quickTunnelDetected = true;
  }, 30_000);
  quickTunnelDetected = true; // 추가 시도 방지
}
```

**5c: 보일러플레이트 External URL (에스컬레이션 필요)**
- Quick Tunnel은 포트 80만 터널링 → 보일러플레이트 앱(개별 포트)은 외부 직접 노출 불가
- 선택지:
  - A) 앱은 도메인 연결 후에만 외부 접근 → External `—` 유지 (현재 상태)
  - B) Traefik PathPrefix 라우팅 추가 → `/app/<stackId>` 경로로 외부 접근
  - C) 현재 상태 유지, Services 테이블 인프라 서비스 External만 5a/5b로 수정

---

## 개발 순서

```
Phase 1: 즉시 수정 (블로커)
  ├─ Issue 1: Git Server 링크 수정 (5분)
  ├─ Issue 2a: 단계 순서 정상화 (30분)
  ├─ Issue 2b: Progress 모달 에러 표시 (20분)
  └─ Issue 2c: step.message 에러 정보 포함 (10분)

Phase 2: UI 개선
  ├─ Issue 2d: Boilerplate 탭 미설치 템플릿 처리 (30분)
  ├─ Issue 3: 탭 안내 문구 개선 (10분)
  └─ /add-md: Mode A/C 차이 문서화

Phase 3: External URL (에스컬레이션 후)
  ├─ Issue 5a-c: 사용자 결정에 따라 구현
  └─ Services External URL 감지 확인

Phase 4: 검증
  ├─ npm test 전체 통과
  ├─ JS 문법 검사 통과
  └─ test-cycle.sh 전체 통과
```

---

## 에스컬레이션 목록

1. **보일러플레이트 External URL 정책** (Issue 5c): 보일러플레이트 앱의 외부 접근 방식 결정 필요
   - A) 앱은 도메인 연결 후에만 외부 접근 → External `—` 유지
   - B) Traefik PathPrefix 라우팅 추가 → `/app/<stackId>` 경로로 외부 접근
   - C) 현재 상태 유지, Services 인프라 서비스 External만 수정

2. **Boilerplate 탭 미설치 템플릿 처리** (Issue 2d):
   - A) 비활성화 + "(미설치)" 표기 — 사용자에게 보이되 클릭 불가
   - B) 숨김 처리 — 설치된 것만 표시
   - C) 자동 설치 — 선택 시 `cloneStack()` 실행 후 진행 (Mode A를 Mode C처럼 동작)
