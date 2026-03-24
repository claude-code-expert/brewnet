# Brewnet Development TODO

> Last updated: 2026-03-24 | 보류 항목(SSH Server, Mail Server, Pro Dashboard) 제거됨

## 현재 구현 현황

```
CLI 명령어:       16/19 (84%)   ████████░░
Dashboard UI:    핵심 완료      ████████░░
API 엔드포인트:   12/20 (60%)   ██████░░░░
설치 위저드:      7/7 (100%)    ██████████
도메인 기능:      핵심 완료      █████████░
테스트:           기본 Unit      █████░░░░░
```

---

## 의존성 맵

```
[1 deploy]       ──→ [5 storage] (선택적 공유 setup)
                 ──→ [3 e2e-tests] (검증)

[2 domain-tab]   ──→ [7 domain-settings] (sequential UI 공유)
                 ──→ [3 e2e-tests] (검증)

[3 e2e-framework] ←── Items 1, 2, 4, 5 (테스트 대상 완성 후 실행)

[4 export]        ──→ [3 e2e-tests] (백업/복원 검증)

[6 logging] + [8 log-rotation]  독립, 전 영역 보강
[7 domain-settings] ──→ [2 domain-tab] (UI 조율 필요)
[9 test-coverage] ←── 전체 아이템 완성 후 커버리지 채움
```

---

## 🔴 P0 — MVP 필수

### ~~1. `brewnet deploy <path>` — 기존 프로젝트 배포~~ ✅ DONE

**상태**: ~~미구현 (명령어 파일 없음)~~ **완료 (2026-03-24)**
**난이도**: Complex / 3-4일

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `packages/cli/src/commands/deploy.ts` | ❌ 없음 | 생성 필요 |
| `packages/cli/src/services/app-manager.ts` | ✅ 있음 | Gitea 강결합 (L7 GiteaClient import, `createApp()`, `deployApp()` 모두 Gitea 필수) |
| `packages/admin-ui/src/components/CreateAppModal.tsx` | ✅ 있음 | `boilerplate` / `git-clone` 두 모드만 존재, Local Path 없음 |

#### 구현 방향

1. **`packages/cli/src/services/app-manager.ts`**: `deployLocalApp(path, opts)` 신규 함수
   - Dockerfile 자동 감지 (`<path>/Dockerfile` 존재 확인)
   - `.env` 파일 있으면 자동 병합
   - Gitea 없이 `docker compose` 직접 실행
   - `createApp()` 분기: `mode === 'local-path'` → `deployLocalApp()`, 나머지는 기존 Gitea 플로우
2. **`packages/cli/src/commands/deploy.ts`**: Commander 명령어 등록
   - `brewnet deploy <path>` → path 검증 → `deployLocalApp()` 호출
   - `--name <name>` 옵션 (컨테이너 이름, 기본값: 디렉토리명)
   - `--port <port>` 옵션 (자동 감지 fallback)
3. **`packages/admin-ui/src/components/CreateAppModal.tsx`**: 세 번째 탭 "Local Path" 추가
   - 경로 입력 필드 + Dockerfile 존재 여부 실시간 검증
   - `POST /api/apps/create` body에 `mode: 'local-path'` + `localPath` 추가
4. **`packages/cli/src/services/admin-server.ts`**: `POST /api/apps/create` 라우트에서 `mode === 'local-path'` 분기 처리

#### 주의사항
- `app-manager.ts` Gitea 의존 코드는 건드리지 말고 새 분기 추가만 할 것
- `index.ts` 명령어 등록 필수 (`program.addCommand(deployCommand)`)

---

### ~~2. App Detail > Domain 탭 완성~~ ✅ DONE

**상태**: ~~UI 미완성~~ **완료 (2026-03-24)** — AppDomainTab + onOpenDomainSettings 연결
**난이도**: Medium / 1-2일

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `packages/admin-ui/src/components/DomainTab.tsx` | ✅ 있음 | 기본판 (L1-234): 단순 hostname input + POST/DELETE |
| `packages/admin-ui/src/features/domain/components/AppDomainTab.tsx` | ✅ 있음 | 고급판 (L1-297): step indicator, validation, contextual tooltip |
| `packages/admin-ui/src/features/domain/components/StepIndicator.tsx` | ✅ 있음 | 재사용 가능 |
| `packages/admin-ui/src/features/domain/hooks/useAppDomain.ts` | ❓ 미확인 | 존재 여부 확인 필요 |
| `packages/cli/src/services/admin-server.ts` | ✅ 있음 | `POST /api/domain/connect` (L1887), `DELETE /api/domain/disconnect/:appName` (L1894) 완전 구현 |

#### 구현 방향

1. **`useAppDomain.ts` 확인**: 없으면 신규 작성 (connect/disconnect/list API 래핑)
2. **`AppDomainTab.tsx` 채택**: `DomainTab.tsx`(기본판) 대신 고급판으로 교체
   - 서브도메인 포맷 검증 (소문자, 특수문자 제한)
   - 연결 상태 표시 (connected / disconnected)
3. **App Detail Modal 통합**: `AppDomainTab`을 `AppDetailModal.tsx` Domain 탭에 마운트

---

### ~~3. E2E 테스트 프레임워크 구현~~ ✅ DONE

**상태**: ~~플랜 완성~~ **완료** — 모든 lib/step/apps 파일 존재, quick-smoke 3/3 pass 검증됨
**난이도**: Complex / 2-3일

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `tests/e2e/run.sh` | ✅ 있음 | 진입점 |
| `tests/e2e/scenarios/` | ✅ 있음 | quick-smoke.json, full-install.json, partial-no-db.json |
| `tests/e2e/steps/00~07.sh` | ✅ 있음 | 단계별 구현 |
| `tests/e2e/lib/assert.sh` | ❓ | 어설션 헬퍼, 테스트 카운터 |
| `tests/e2e/lib/api.sh` | ❓ | Admin API curl 래퍼 |
| `tests/e2e/lib/scenario.sh` | ❓ | JSON 필드 추출 (python3) |
| `tests/e2e/lib/report.sh` | ❓ | 터미널 요약 + JSON 리포트 |
| `docs/superpowers/plans/2026-03-23-e2e-test-framework.md` | ✅ 있음 | 완전한 구현 계획 |

#### 구현 방향

- `lib/` 파일 4개 존재 여부 먼저 확인, 없으면 플랜 기준 작성
- `lib/api.sh`: `X-Admin-Password` 헤더 기반 Admin API 호출 래퍼
- `lib/scenario.sh`: `python3 -c "import json,sys; ..."` 방식 JSON 파싱
- 위저드 설정 포맷: `_e2e` 섹션 제거 후 `brewnet init --config --non-interactive --no-open`으로 전달
- 헬스체크: 30s 타임아웃, curl 폴링

---

## 🟡 P1 — 중요

### ~~4. `brewnet export` — 프로젝트 설정 내보내기~~ ✅ DONE

**상태**: **완료 (2026-03-24)** — selections.json, docker-compose.yml, .env, boilerplate.json 번들
**난이도**: Trivial / 0.5-1일

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `packages/cli/src/commands/export.ts` | ❌ 없음 | 생성 필요 |
| `~/.brewnet/projects/<name>/selections.json` | ✅ 런타임 | 위저드 상태 |
| `~/brewnet/<name>/docker-compose.yml` | ✅ 런타임 | 생성된 컴포즈 |

#### 구현 방향

1. **`export.ts`**: 현재 프로젝트(`getLastProject()`) 기준으로 아래 파일 묶어 tar.gz 생성
   - `selections.json` (위저드 상태)
   - `docker-compose.yml` (컴포즈 파일)
   - `.env` (크리덴셜)
   - `.brewnet-boilerplate.json` (있으면)
2. 출력 경로: `./brewnet-export-<name>-<timestamp>.tar.gz`
3. `index.ts`에 명령어 등록

---

### ~~5. `brewnet storage init` — 파일 서버 독립 설정~~ ✅ DONE

**상태**: **완료 (2026-03-24)** — storage-manager.ts + storage.ts (init/status 서브커맨드)
**난이도**: Complex / 3-4일

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `packages/cli/src/services/storage-manager.ts` | ❌ 없음 | 신규 생성 필요 |
| `packages/cli/src/services/service-manager.ts` | ✅ 있음 | `addService()` / `removeService()` 있음, 스토리지 전용 로직 없음 |
| Admin UI Storage 탭 | ❌ 없음 | 대시보드에 없음 |

#### 구현 방향

1. **`storage-manager.ts`**: 스토리지 백엔드별 초기화 함수
   - 지원: Nextcloud, MinIO, SFTP, Jellyfin
   - `initStorage(backend, opts)` → docker-compose 서비스 정의 생성 + 크리덴셜 .env 작성
2. **`service-manager.ts`**: `addService()` 확장 — storage 타입 감지 시 `storage-manager` 위임
3. **Admin API**: `POST /api/storage/init` 신규 엔드포인트
4. **Admin UI**: Dashboard에 Storage 탭 추가
   - 백엔드 선택 카드 (Nextcloud / MinIO / SFTP / Jellyfin)
   - 설정 입력 + 초기화 버튼

---

### ~~6. `004-centralized-logging` 완성~~ ✅ DONE

**상태**: **완료** — compose-generator.ts logging 섹션, Traefik access log, logs.ts 모든 플래그 구현됨
**난이도**: Medium / 1-2일

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `packages/cli/src/utils/log-rotation.ts` | ✅ 있음 | `cleanOldCliLogs()`, `rotateLargeFile()` 구현됨 |
| `packages/cli/src/utils/log-aggregator.ts` | ✅ 있음 | 로그 집계 |
| `packages/cli/src/services/admin-server.ts` | ✅ 있음 | `runRotation()` 서버 시작 시 1회만 호출 (L1036) |
| `packages/cli/src/services/compose-generator.ts` | ❓ | docker `logging:` 드라이버 설정 여부 확인 필요 |
| Spec | ✅ | `specs/004-centralized-logging/spec.md` |

#### 구현 방향

1. **`compose-generator.ts`**: 모든 서비스에 logging 섹션 자동 추가
   ```yaml
   logging:
     driver: json-file
     options:
       max-size: "10m"
       max-file: "3"
   ```
2. **Traefik 액세스 로그**: `--accesslog=true` + `--accesslog.format=json` + `/logs` 볼륨 마운트
3. **`packages/cli/src/commands/logs.ts`**: 플래그 추가
   - `--source <access|tunnel|docker|cli>`
   - `--level <error|warn|info|debug>`
   - `--since <1h|30m>`
   - `--json`
4. **Item 8(로그 회전 스케줄러)**: 이 아이템과 함께 구현

---

### ~~7. `006-domain-settings` 완성~~ ✅ DONE (기능적 완료)

**상태**: **완료** — 4필드 폼으로 CF 설정 저장 정상 동작. Sequential wizard는 P2 UX 개선으로 분류

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `packages/admin-ui/src/components/DomainSettingModal.tsx` | ✅ 있음 (기본판) | L1-166, 단순 4필드 폼 |
| `packages/admin-ui/src/features/domain/components/TokenStep.tsx` | ✅ 있음 | Step 1: API 토큰 |
| `packages/admin-ui/src/features/domain/components/ZoneStep.tsx` | ✅ 있음 | Step 2: Zone 선택 |
| `packages/admin-ui/src/features/domain/components/TunnelStep.tsx` | ✅ 있음 | Step 3: 터널 |
| `packages/admin-ui/src/features/domain/components/HelpTooltip.tsx` | ✅ 있음 | 컨텍스트 도움말 |
| `packages/admin-ui/src/features/domain/components/HelpDrawer.tsx` | ✅ 있음 | 도움말 드로어 |
| `packages/admin-ui/src/features/domain/components/StepIndicator.tsx` | ✅ 있음 | 단계 표시기 |
| Spec | ✅ | `specs/006-domain-settings/spec.md` |

#### 구현 방향

1. **`DomainSettingModal.tsx` 재설계**: 단순 폼 → 3단계 sequential wizard로 교체
   - Step 1 (Token): `TokenStep.tsx` 마운트, 유효성 확인 후 자동 진행
   - Step 2 (Zone): 토큰으로 Zone 목록 자동 조회 (`GET /api/settings/cloudflare/zones`), 선택
   - Step 3 (Tunnel): `TunnelStep.tsx` 마운트, 터널 이름 입력 + 생성
2. **`StepIndicator.tsx`**: 상단에 1/3 → 2/3 → 3/3 표시
3. **`HelpTooltip.tsx`**: 각 필드 옆 `?` 아이콘 — 클릭 시 `HelpDrawer.tsx` 열림
4. **Auto-progression**: 각 스텝 완료 시 자동 다음 단계 이동
5. **Backend 확인**: `POST /api/settings/cloudflare` — 토큰 검증 + Zone 목록 반환 동작 확인

---

### ~~8. 로그 회전 주기적 실행~~ ✅ DONE

**상태**: **완료 (2026-03-24)** — `setInterval` 1시간 간격 + `stop()` 정리
**난이도**: Trivial / ~1시간

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `packages/cli/src/services/admin-server.ts` | ✅ 있음 | L1036에서 `runRotation()` 서버 시작 시 1회 호출 |

#### 구현 방향

`admin-server.ts` L1036 근처에 추가:

```typescript
// 1시간 간격 로그 회전 스케줄러
const rotationTimer = setInterval(() => runRotation(logsDir, projectPath), 60 * 60 * 1000);
// 서버 종료 시 타이머 정리 (process.on('SIGTERM', ...) 블록에 추가)
clearInterval(rotationTimer);
```

> **Item 6와 함께 구현**

---

### 9. CLI 코어 테스트 커버리지 90% 달성

**상태**: 현재 ~60%
**난이도**: Medium / 2-3일

#### 소스 레벨 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `tests/unit/cli/` | ✅ 있음 | 51개 테스트 파일 |
| `app-manager.test.ts` | ✅ 있음 | local-deploy, git-clone 분기 테스트 미비 |
| `domain-manager.test.ts` | ✅ 있음 | connect/disconnect 엣지케이스 미비 |
| `storage-manager.test.ts` | ❌ 없음 | Item 5 구현 후 신규 작성 필요 |
| `log-rotation.test.ts` | ✅ 있음 | |
| `admin-server.test.ts` | ✅ 있음 | 신규 엔드포인트 커버리지 부족 |

#### 구현 방향

1. Item 1~7 구현 완료 후 신규 함수에 대한 테스트 추가
2. 모킹 대상: Cloudflare API, Docker API, Gitea API (이미 일부 존재)
3. 우선순위: `app-manager` (Gitea 분기) → `domain-manager` (엣지케이스) → `storage-manager` (신규)

---

## 🟢 P2 — 선택 기능

### Admin UI UX 개선

- [ ] Domain Settings sequential wizard — `DomainSettingModal`을 `TokenStep → ZoneStep → TunnelStep` 3단계로 교체 (컴포넌트 모두 구현됨, 조립만 필요)

### Admin UI 확장

- [ ] 모니터링 대시보드 — CPU/Memory 그래프 (Recharts)
- [ ] 자동 백업 스케줄링 UI — cron 기반
- [ ] SSL 인증서 상태 모니터링
- [ ] 시스템 알림/이벤트 로그 페이지

### 인프라

- [ ] CI/CD 파이프라인 — GitHub Actions (lint + test + build)
- [ ] 코드 커버리지 리포팅 — Codecov 통합
- [ ] DDNS 자동 갱신 — DuckDNS/No-IP 지원

### 문서

- [ ] `docs/spec/testing-complete-guide.md` — E2E 프레임워크 완성 후 업데이트
- [ ] API 문서 정비 — 현재 구현된 엔드포인트 기준으로 재작성

---

## 권장 구현 순서

| 순서 | 아이템 | 이유 |
|------|--------|------|
| 1 | **8** 로그 회전 스케줄러 | Trivial, 독립, 즉시 효과 |
| 2 | **6** Centralized Logging | 8과 함께, compose-generator 보강 |
| 3 | **7** Domain Settings Modal | 기존 컴포넌트 조합만으로 완성 |
| 4 | **2** Domain Tab 완성 | 7 완성 후 통합 |
| 5 | **4** Export 명령어 | Trivial, 독립 |
| 6 | **3** E2E 프레임워크 | 1~5 완성 후 전체 검증 |
| 7 | **1** Deploy 명령어 | 복잡도 높음, 기반 안정화 후 |
| 8 | **5** Storage Init | 복잡도 높음, 1 이후 |
| 9 | **9** 테스트 커버리지 90% | 전체 구현 후 마무리 |

---

## 📋 완료된 항목 (참고)

- [x] `brewnet init` — 7단계 설치 위저드
- [x] `brewnet create-app` — 16개 스택 앱 생성
- [x] `brewnet list` — 서비스/스택 카탈로그
- [x] `brewnet update` — 이미지 pull + 재시작
- [x] `brewnet domain connect/disconnect/list/status` — 도메인 관리
- [x] `brewnet domain tunnel status/restart` — 터널 관리
- [x] `brewnet admin/shutdown` — 관리 패널
- [x] `brewnet uninstall` — 완전 제거
- [x] `brewnet add/remove` — 서비스 추가/제거
- [x] `brewnet up/down/status/logs/backup/restore` — 기본 관리
- [x] Admin UI — Dashboard, Apps, Catalog 페이지
- [x] Admin UI — App Detail (Overview, Deploy, Logs, Domain 탭)
- [x] `brewnet deploy <path>` — 로컬 경로 배포 (Gitea 없이, auto-scaffold)
- [x] E2E 테스트 프레임워크 — lib/step/apps 전체, quick-smoke 3/3 pass
- [x] Cloudflare Tunnel — Quick + Named 모드
- [x] 로그 시스템 — 4소스 통합, 날짜 표시, 24h 필터, 7일 보관
- [x] SSH 문서 주석 처리 (14개 파일)
- [x] 문서 정리 — 폐기 문서 삭제, 완료 spec 아카이브
