# Code Review — 2026-03-24 (develop branch)

작업 범위: HEAD 기준 미커밋 변경사항 전체 (38 files, +2193 / -223)

---

## 1. 변경 요약

| 영역 | 주요 변경 |
|------|-----------|
| **CLI** | `brewnet list`, `brewnet update` 명령어 신규 추가 |
| **Admin UI** | `/catalog` 페이지 신규, Dashboard "Update Services" 버튼 |
| **Admin Server** | `handleUpdateServices`, `handleGetCatalog`, 서버 시작 시 로그 로테이션 |
| **Landing Page** | 클라이언트사이드 서비스 로딩 오버레이 (JS 폴링) |
| **Gitea Client** | 준비 상태 확인 로직 개선 (JSON content-type 검증) |
| **UI 폴리시** | LogsTab timestamp 개선, NavHeader SVG 로고, Footer GitHub 링크, CSS 변수 정비 |

---

## 2. 기능별 리뷰

### 2.1 `brewnet list` (`packages/cli/src/commands/list.ts`)

**잘된 점:**
- JSON array / NDJSON 양쪽 포맷을 `parseRunningServices`에서 안전하게 처리 (malformed 라인 개별 skip)
- `--json`, `--installed`, `--stacks` 옵션으로 유연한 출력
- `DOCKER_COMPOSE_FILENAME` 상수 일관 사용

**이슈:**

> **[Minor]** `totalServices` 카운트 불일치 — L141
>
> ```typescript
> const totalServices = [...SERVICE_REGISTRY.keys()].length;
> // 하지만 displayServices()는 SERVICE_CATEGORIES에 있는 서비스만 표시
> ```
>
> `SERVICE_REGISTRY`에 등록된 전체 서비스 수를 표시하지만, 화면에는 `SERVICE_CATEGORIES`에 포함된 것만 렌더링된다. 사용자에게 `5/15 installed` 처럼 보이더라도 나머지 10개는 목록에 없음. 표시 기준을 `SERVICE_CATEGORIES`의 ids 합계로 통일하거나, 'Uncategorized' 섹션을 추가해야 함.

> **[Info]** `parseRunningServices`가 `status.ts:parseDockerComposePsOutput`과 동일한 파싱 로직을 중복 구현. 현재는 반환 타입이 다르고 `parseDockerComposePsOutput`이 export되지 않아 공유 불가 상태. 향후 docker-ps 유틸 공유 모듈 추출 권장.

---

### 2.2 `brewnet update` (`packages/cli/src/commands/update.ts`)

**잘된 점:**
- `--no-restart` 옵션으로 pull-only 모드 지원
- compose 파일 미존재 시 명확한 에러 메시지와 `brewnet init` 안내
- `BrewnetError` 타입 구분하여 에러 출력

**이슈:**

> **[Minor]** L104 — health summary의 NDJSON 파싱이 견고하지 않음
>
> ```typescript
> const containers = lines.map((line) => JSON.parse(line));
> // malformed 라인 하나가 전체 summary를 날림
> ```
>
> 외부 try-catch(L114)가 잡아주지만 실패 시 아무 출력도 없다. `list.ts`처럼 per-line try-catch로 처리하는 것이 일관성 있음.

> **[Minor]** `docker compose pull` 실행 시 타임아웃 없음. 대용량 이미지(Nextcloud 등)는 수 분 걸릴 수 있어 CLI가 응답 없이 대기한다. UX 관점에서 진행 스피너 메시지가 있어 최소 피드백은 되지만, 30분 이상 걸릴 경우 사용자가 Ctrl+C로 중단한다. 적절한 타임아웃 또는 출력 스트리밍 고려 권장.

---

### 2.3 Admin UI — Catalog 페이지 (`packages/admin-ui/src/pages/Catalog.tsx`)

**잘된 점:**
- `busyIds` Set으로 개별 서비스 busy 상태를 독립 관리 (여러 서비스 동시 조작 지원)
- `CATEGORY_ORDER` + `CATEGORY_LABELS`로 명확한 카테고리 정렬
- 설치/제거 후 즉시 `fetchCatalog()` 재호출로 UI 동기화

**이슈:**

> **[Bug]** L216 — 하드코딩된 `#a3b8d8` 잔존
>
> ```tsx
> <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#a3b8d8' }}>
>   RAM: ~{item.ramEstimateMB} MB
> </div>
> ```
>
> `/simplify` 패스에서 `AppCard`, `Footer`, `ExternalDomainsSection`의 `#a3b8d8`은 `var(--txt2)`로 교체됐지만 이 파일은 누락됨. 동일하게 `var(--txt2)` 사용 필요.

> **[Minor]** `handleInstall`과 `handleRemove`의 busyIds 해제 로직이 완전히 동일한 코드블록으로 중복됨 (`finally` 블록 각각 3줄). 공통 헬퍼나 상태 관리 통합 고려.

---

### 2.4 Admin UI — Dashboard (`packages/admin-ui/src/pages/Dashboard.tsx`)

**잘된 점:**
- "Update Services" 버튼이 `updating` 상태 동안 비활성화
- 에러/성공 메시지 `updateMsg`로 인라인 피드백

**이슈:**

> **[Minor]** `updateMsg`가 자동으로 사라지지 않음. 성공/실패 메시지가 무한 표시된다. 5초 후 자동 초기화(`setTimeout(() => setUpdateMsg(''), 5000)`) 또는 다음 `handleUpdate` 호출 시 초기화(현재 동작)로 만족할 수도 있으나, 페이지를 오래 열어두면 오래된 메시지가 오해를 유발할 수 있음.

> **[Minor]** `docker compose pull`이 오래 걸릴 때 클라이언트 HTTP 요청이 타임아웃될 수 있음. 이 경우 UI는 에러로 처리하지만 실제로는 서버에서 pull이 계속 진행 중. 장기 작업은 job queue + polling 방식이 더 적합하나, 현재 규모에서는 허용 가능한 단순화.

---

### 2.5 Admin Server — 서비스 카탈로그 필터 (`packages/cli/src/services/admin-server.ts`)

**이슈:**

> **[Minor]** L936 — 인프라 서비스 제외가 하드코딩된 문자열 비교
>
> ```typescript
> .filter((def) => !REQUIRED_SERVICES.has(def.id) && def.id !== 'openssh-server' && def.id !== 'cloudflared')
> ```
>
> 새로운 인프라 서비스가 추가될 때마다 이 줄을 수동으로 업데이트해야 함. 서비스 정의(`ServiceDefinition`)에 `isInfrastructure: boolean` 필드를 추가하면 더 명확하고 확장 가능.

---

### 2.6 Landing Page 서비스 로딩 오버레이 (`packages/cli/src/services/config-generator.ts`)

**잘된 점:**
- Traefik 에러 미들웨어로 해결 불가능했던 "서비스 시작 중 빈 화면" 문제를 클라이언트사이드 폴링으로 우회한 실용적인 해결책
- 경과 시간 타이머, 서비스명 표시, 자동 리다이렉트로 사용자에게 명확한 피드백

**이슈:**

> **[Minor]** `PATH_CONFIGS`와 `checkReady()` 로직이 `index.html`과 `service-loading.html` 두 곳에 완전히 동일하게 존재. 서비스 경로 추가 시 두 파일 모두 수정 필요.

> **[Minor]** `fetch()` 응답 바디를 소비하지 않음. 브라우저에서는 자동 처리되어 실제 영향은 없으나, `resp.body?.cancel()` 호출이 명시적으로 더 안전함.

---

### 2.7 Gitea Client 준비 상태 확인 개선 (`packages/cli/src/services/gitea-client.ts`)

**잘된 점:**
- `content-type: application/json` 검증으로 시작 중인 nginx 페이지(HTTP 200 text/html)를 Gitea 준비 완료로 오판하는 버그 수정
- 타임아웃 주석이 근본 원인을 명확하게 설명

---

### 2.8 UI 폴리시

**잘된 점:**
- LogsTab: `since` 파라미터로 24시간 필터 적용 → 초기 로드 데이터 크기 감소
- `timestamp` 필드명 통일 (`ts` → `timestamp`)
- NavHeader: 유니코드 커피잔 이모지 → 커스텀 SVG 로고 (렌더링 일관성)
- Footer: lucide-react deprecated `Github` → 인라인 SVG로 교체
- 하드코딩된 `#a3b8d8` → `var(--txt2)` CSS 변수화 (AppCard, Footer, ExternalDomainsSection)

---

## 3. 수정 필요 항목 요약

| 우선순위 | 파일 | 이슈 |
|---------|------|------|
| 🔴 Bug | `Catalog.tsx:216` | 하드코딩된 `#a3b8d8` 미교체 |
| 🟡 Minor | `list.ts:141` | totalServices 카운트가 표시 범위와 불일치 |
| 🟡 Minor | `update.ts:104` | NDJSON 파싱 per-line 에러 처리 누락 |
| 🟡 Minor | `admin-server.ts:936` | 인프라 서비스 제외 하드코딩 |
| 🟡 Minor | `Dashboard.tsx` | updateMsg 자동 초기화 없음 |
| 🔵 Info | `config-generator.ts` | PATH_CONFIGS JS 중복 (index.html + service-loading.html) |
| 🔵 Info | `list.ts` vs `status.ts` | parseRunningServices 중복 파싱 로직 |

---

## 4. 즉시 수정 (Fix in-place)

`Catalog.tsx:216` 버그는 리뷰 완료 시 바로 수정.

---

*Reviewed by: Claude (claude-sonnet-4-6) | 2026-03-24*
