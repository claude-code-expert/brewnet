# Brewnet Admin Panel & Apps — 구현 기능 체크리스트

> 마지막 업데이트: 2026-03-17
> 대상 파일: `packages/cli/src/services/admin-server.ts`, `apps-page.ts`, `app-manager.ts`, `app-registry.ts`, `gitea-client.ts`, `domain-manager.ts`

---

## 1. HTTP API 엔드포인트

### 1.1 기본 라우팅
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 대시보드 HTML (lazy tunnel/credential detection) |
| GET | `/apps` | 앱 빌드 & 배포 페이지 |
| GET | `/apps/:name` | 앱 상세 페이지 |
| GET | `/icon.svg` | Brewnet SVG 아이콘 |
| GET | `/favicon.ico` | 파비콘 |

### 1.2 헬스 & 카탈로그
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버 상태 확인 (`{ status: 'ok', version: '1.0.1' }`) |
| GET | `/api/catalog` | 설치 가능한 서비스 카탈로그 (필수 서비스 제외 필터) |

### 1.3 서비스 관리
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/services` | 실행 중인 서비스 목록 + Docker 상태 검사 |
| POST | `/api/services/install` | 서비스 설치 (docker-compose 업데이트) |
| POST | `/api/services/containers/:id/start` | 서비스 시작 |
| POST | `/api/services/containers/:id/stop` | 서비스 중지 |
| DELETE | `/api/services/containers/:id?purge=true\|false` | 서비스 제거 (data purge 옵션) |

### 1.4 백업
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/backup` | 백업 목록 조회 |
| POST | `/api/backup` | 백업 생성 |

### 1.5 로그
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/logs/stats` | 로그 통계 (소스·레벨·서비스별 집계) |
| GET | `/api/logs` | 로그 쿼리 (`source`, `level`, `service`, `since`, `until`, `search`, `limit`, `offset`) |

### 1.6 앱 관리
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/apps` | 등록된 앱 목록 |
| GET | `/api/apps/boilerplates` | 설치된 boilerplate 메타데이터 |
| POST | `/api/apps/boilerplates/:stackId/start` | Boilerplate docker compose up |
| POST | `/api/apps/boilerplates/:stackId/stop` | Boilerplate docker compose down |
| POST | `/api/apps/create` | 새 앱 생성 (비동기 job 반환, 3가지 모드) |
| GET | `/api/apps/jobs/:jobId` | 생성/배포 job 상태 조회 |
| GET | `/api/apps/check-port?port=N` | 포트 사용 가능 여부 확인 |
| GET | `/api/apps/:name` | 앱 상세 정보 |
| GET | `/api/apps/:name/git` | Git 정보 (clone URL, 최신 commit, branch) |
| GET | `/api/apps/:name/logs` | 앱 로그 SSE 스트림 (docker compose logs --follow) |
| GET | `/api/apps/:name/deploy/settings` | 배포 설정 조회 |
| PUT | `/api/apps/:name/deploy/settings` | 배포 설정 업데이트 |
| POST | `/api/apps/:name/deploy` | 수동 배포 트리거 |
| POST | `/api/apps/:name/start` | 앱 시작 |
| POST | `/api/apps/:name/stop` | 앱 중지 |
| DELETE | `/api/apps/:name` | 앱 삭제 (docker compose down --volumes) |

### 1.7 Gitea 연동
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/gitea/autologin?redirect=<path>` | 서버사이드 Gitea 자동 로그인 → 세션 쿠키 발급 + 리다이렉트 |
| GET | `/api/git/repos` | Gitea 레포 목록 (appName·language·stars·updatedAt enriched) |
| POST | `/api/git/repos/:name/connect` | 레포와 앱 연결 (`giteaRepoUrl` 저장) |

### 1.8 배포 이력 & 웹훅
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/deploy/history?app=<name>` | 배포 이력 (앱 필터 옵션) |
| POST | `/api/deploy/hook` | Gitea push webhook (자동 배포 트리거) |

### 1.9 도메인 & 외부 접속
| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/domain/list` | 없음 | 도메인 연결 목록 + 터널 상태 |
| GET | `/api/domain/apps` | 없음 | 연결 가능한 앱 목록 |
| POST | `/api/domain/connect` | 없음 | 앱을 도메인에 연결 (CNAME + Tunnel ingress) |
| DELETE | `/api/domain/disconnect/:appName` | `X-Admin-Password` | 도메인 연결 해제 |
| GET | `/api/domain/status/:appName` | `X-Admin-Password` | DNS·Tunnel·HTTPS 연결 상태 |

### 1.10 Cloudflare 설정 (`X-Admin-Password` 인증 필요)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/settings/cloudflare` | Cloudflare 설정 조회 (토큰 마스킹) |
| PUT | `/api/settings/cloudflare` | Cloudflare 설정 업데이트 (토큰 유효성 검사 포함) |

---

## 2. UI 화면 구성

### 2.1 대시보드 (`/`)

**상단바**
- Brewnet 로고 + 프로젝트명
- Admin 계정명 (마스킹)
- Quick Tunnel URL (감지 시 표시)
- Apps 바로가기 버튼

**서비스 카드 섹션**
- 카드별: 이름, 상태 배지 (running/stopped/error), CPU, Memory, Uptime, Port, URL
- 서비스 시작/중지/삭제 버튼
- 설치 가능한 서비스 카탈로그 팝업 (서비스 추가)

**Dev Stack Apps 섹션** (boilerplate가 있을 때)
- 테이블: 스택명 | 상태 | Backend URL | Frontend URL | Docs URL
- 스택 행 클릭 → 모달: Git branch, DB 정보, API 엔드포인트, README 링크
- Start/Stop 버튼

**도메인 섹션**
- 연결된 도메인 목록 테이블
- Cloudflare 인증 설정 입력 필드

**백업 섹션**
- 백업 생성 버튼
- 백업 목록 (id, 생성 시간)

**로그 섹션**
- 로그 통계 (소스·레벨별)
- 로그 쿼리 UI (필터 + 검색)

**서비스별 자격증명 모달**
- 설치된 서비스의 admin ID / 비밀번호 / URL 표시

### 2.2 앱 페이지 (`/apps`)

**상단바**
- 브레드크럼: Home / Apps
- 통계 배지: `총 N개` | `실행 중 N` | `중지됨 N` | `빌드 중 N`
- New App 버튼 + Refresh 버튼

**필터 탭**
- All / Running / Building / Stopped

**앱 카드**
- 언어별 컬러 아이콘 + 이니셜
- 앱 이름 + 상태 배지 (RUNNING / BUILDING / STOPPED)
- 언어 칩 + 프레임워크명
- 포트 링크 (`http://localhost:PORT ↗`) — RUNNING 시 클릭 가능
- Git 레포 링크 (`git/admin/{name} ↗`) — `/api/gitea/autologin` 경유 자동 로그인
- 최신 커밋 (shortHash + 메시지 30자)
- 생성 시간 (relative: "2시간 전")
- 도메인 링크 (연결됨) or "+ 도메인 연결" 버튼
- 액션: `🔨 Build` | `🚀 Deploy` | `▶ Start` / `■ Stop` | `🌐 도메인` | `🗑 삭제`

**Gitea 레포 탭**
| 컬럼 | 설명 |
|------|------|
| 이름 | private 배지 + ⭐ stars |
| 언어 | 언어 칩 |
| 연결 상태 | 앱 이름 배지 or 미연결 |
| 레포 URL | `git.local/admin/{name} ↗` |
| 마지막 업데이트 | relative time |
| 액션 | 앱 보기 / 앱 이름 입력+연결 / 취소 |

**New App 모달** (3 탭)
- **Boilerplate** — 설치된 boilerplate 그리드 → 선택 → 앱 이름 입력
- **Git Clone** — Git URL 입력 → 레포명 자동 추출 + 앱 이름 입력
- **New Project** — 언어 선택 → 프레임워크 선택 → 앱 이름 + 포트 입력
- 공통: 포트 실시간 충돌 검사 (debounce 600ms), 포트 미리보기

**Domain Modal**
- Cloudflare 자격증명 상태 확인
- Subdomain + Domain 입력
- 도메인 연결 목록 테이블 (disconnect 버튼 포함)

**Delete Modal**
- 앱 이름 재입력 확인
- 앱 메타 (mode, port, status) 표시

**Progress Modal** (Build/Deploy 시)
- Job 타이틀 (이미지 빌드 중 / 전체 배포 중)
- Step별 진행률 (pending → running → done/failed)
- 실시간 SSE 로그 스트림
- 실패 시 실패 스텝 강조 표시

### 2.3 앱 상세 페이지 (`/apps/:name`)

**헤더**
- 앱 아이콘 + 이름
- 상태 배지 + 언어/프레임워크 칩
- 포트 링크
- 액션: `Open ↗` | `Stop` / `Start` | `🚀 Manual Deploy`

**탭 구성**

| 탭 | 내용 |
|----|------|
| Overview | 생성 시간, 모드, port, appDir, stackId |
| Git | Gitea 웹 URL, HTTP clone URL, SSH clone URL, 기본 브랜치, 최신 commit |
| Deploy | autoDeploy 토글, deployBranch 입력, webhookSecret 설정 |
| Logs | 실시간 로그 SSE (docker compose logs --follow --tail 50) |
| Domain | 도메인 연결 상태, CNAME 정보, Tunnel/DNS/HTTPS reachability |

---

## 3. 데이터 타입

### 3.1 AppEntry (apps.json에 저장)
```typescript
interface AppEntry {
  name: string           // 고유 앱 이름
  mode: 'boilerplate' | 'git-url' | 'new-project'
  stackId?: string       // Mode A (Boilerplate)
  sourceUrl?: string     // Mode B (Git Clone)
  appDir: string         // 디스크 절대 경로
  lang?: string
  framework?: string
  port: number
  giteaRepoUrl?: string  // e.g. http://localhost/git/admin/my-app
  status: 'creating' | 'running' | 'stopped' | 'failed'
  createdAt: string      // ISO 8601
}
```

### 3.2 DeploySettings (apps.json에 함께 저장)
```typescript
interface DeploySettings {
  autoDeploy: boolean
  deployBranch: string
  webhookSecret?: string
}
```

### 3.3 DeployHistoryEntry (deploy-history.json)
```typescript
interface DeployHistoryEntry {
  appName: string
  commitHash: string
  commitMessage: string
  status: 'success' | 'failed'
  deployedAt: string  // ISO 8601
}
```

### 3.4 AppGitInfo (API 응답 전용, 저장 안 함)
```typescript
interface AppGitInfo {
  giteaUrl: string
  cloneUrlHttp: string
  cloneUrlSsh: string
  localPath: string
  branch: string
  latestCommit: { hash, shortHash, message, date } | null
}
```

---

## 4. 비즈니스 로직 흐름

### 4.1 앱 생성 (3가지 모드)

**Mode A — Boilerplate**
1. `.brewnet-boilerplate.json`에서 메타 조회
2. Gitea 토큰 준비 (`mustChangePassword` 자동 해제)
3. Gitea 레포 생성 (이미 있으면 재사용)
4. Git remote 추가 → unshallow → force push
5. `docker compose up --build`
6. Health check (`127.0.0.1:port/health`, 120s 폴링)
7. `apps.json` 등록 + Gitea webhook 자동 설정

**Mode B — Git Clone**
1. 외부 Git URL shallow clone
2. Gitea 레포 생성
3. Git remote 추가 → push
4. `docker compose up`
5. Health check
6. `apps.json` 등록

**Mode C — New Project**
1. Stack catalog에서 stackId 선택
2. `boilerplate-manager`로 clone + env generation
3. 포트 자동 감지 (unified: 3000, non-unified: 8080)
4. `git init` → push to Gitea
5. `docker compose up`
6. Health check
7. `apps.json` 등록

### 4.2 배포 흐름

**수동 배포 (`POST /api/apps/:name/deploy`)**
1. `git pull` (실패 무시)
2. `docker compose up -d --build`
3. Health check
4. Status 업데이트
5. `deploy-history.json` 기록

**자동 배포 (Gitea Webhook)**
1. Gitea push → `POST /api/deploy/hook`
2. Repository name = appName 추출
3. `ref` (branch) vs `deploySettings.deployBranch` 비교
4. 매칭 시 `deployApp()` 호출

### 4.3 도메인 연결 흐름

**Connect**
1. 로컬 port 헬스 체크
2. Cloudflare Tunnel ingress에 route 추가
3. DNS CNAME 레코드 생성 (conflict 감지 + force 옵션)
4. Traefik external labels 추가
5. State 저장 (`domainConnections[]`)
6. DNS 전파 폴링

**Disconnect**
1. Tunnel ingress에서 route 제거
2. DNS CNAME 레코드 삭제
3. Traefik labels 제거
4. State에서 연결 제거
5. 실패 시 rollback

**Status Check**
- 로컬 헬스: `127.0.0.1:port`
- 외부 DNS 해석: dig
- HTTPS reachability: `HEAD https://hostname/`
- Tunnel health: Cloudflare API (`connectorCount`)

### 4.4 Gitea 자동 로그인 흐름 (`/api/gitea/autologin`)
1. `GET /git/user/login` → `_csrf` 쿠키 + form 토큰 추출
2. `POST /git/user/login` — CSRF + admin 자격증명 전송
3. 응답에서 `i_like_gitea` 세션 쿠키 추출
4. `Set-Cookie: i_like_gitea=...; Path=/; SameSite=Lax` 브라우저에 전달
5. 302 → 목표 Gitea URL 리다이렉트
6. 실패 시: 로그인 없이 fallback 리다이렉트

---

## 5. 헬스 체크 메커니즘

| 항목 | 값 |
|------|-----|
| 엔드포인트 | `http://127.0.0.1:{port}/health` |
| 폴링 간격 | 3초 |
| 기본 타임아웃 | 120초 |
| Rust 스택 타임아웃 | 600초 (`buildSlow=true`) |
| Java/Kotlin 타임아웃 | 300초 |
| 성공 조건 | HTTP 2xx / 3xx |
| IPv6 이슈 | `127.0.0.1` 고정 사용 (Alpine `localhost` IPv6 해석 문제 대응) |

---

## 6. Gitea 연동 세부

### 6.1 토큰 관리 (`GiteaClient`)
- 토큰 저장 경로: `~/.brewnet/gitea-token`
- 캐시 토큰 유효성 검사: `GET /api/v1/user` (401이면 재발급)
- Token scopes: `write:repository`, `read:repository`, `write:user`, `read:user`
- `mustChangePassword` 자동 해제: `docker exec -u git brewnet-gitea gitea admin user change-password`

### 6.2 레포 조작
| 기능 | 설명 |
|------|------|
| `createRepo` | private 레포 생성 (auto_init: false) |
| `repoExists` | 레포 존재 여부 확인 |
| `deleteRepo` | 레포 삭제 |
| `listRepos` | 사용자 레포 목록 |
| `getRepo` | 레포 상세 (default_branch, ssh_url 포함) |
| `getLatestCommit` | 브랜치 최신 commit (비어있으면 null) |
| `createWebhook` | push webhook 등록 |
| `authedCloneUrl` | 자격증명 포함 clone URL 생성 |

---

## 7. 파일 저장 경로

| 항목 | 경로 |
|------|------|
| 앱 레지스트리 | `~/.brewnet/apps.json` |
| 배포 이력 | `~/.brewnet/deploy-history.json` |
| Gitea API 토큰 | `~/.brewnet/gitea-token` |
| Wizard 상태 | `~/.brewnet/projects/<name>/selections.json` |
| Boilerplate 메타 | `{projectPath}/.brewnet-boilerplate.json` |
| 글로벌 설정 | `~/.brewnet/config.json` |
| 로그 | `~/.brewnet/logs/` |

---

## 8. 주요 설계 결정 & 제약

| 항목 | 내용 |
|------|------|
| 인증 방식 | 대부분 localhost-only → 인증 불필요. 변경성 도메인 API만 `X-Admin-Password` 헤더 |
| Gitea 내부 주소 | `http://localhost/git` (Traefik `/git` prefix strip) |
| Gitea SSH | `ssh://git@localhost:2222` |
| Quick Tunnel | Port 443 skip — Cloudflare가 HTTPS 처리 |
| Jellyfin 초기화 URL | 반드시 `#/wizard/start` (절대 `#/home` 사용 금지) |
| 앱 삭제 | `docker compose down --volumes` (데이터 완전 삭제) |
| Boilerplate 형식 | `.brewnet-boilerplate.json` — 항상 배열 (legacy 단일 객체 자동 변환) |
| Unified 스택 | port 3000만 사용 (별도 frontend container 없음) |
| Silent catch 금지 | `.catch(() => {})` 절대 사용 금지 — 최소 warn 로그 필수 |

---

## 9. 미구현 / 향후 과제

- [ ] 앱 카드 — backend / frontend URL이 분리된 경우 두 링크 별도 노출 (현재 port 1개만)
- [ ] 앱 상세 — Domain 탭 read-only 상태 확인 (connect는 앱 카드에서)
- [ ] `/api/apps/check-port` — 동시 다수 앱 생성 시 race condition 가능성
- [ ] 배포 이력 페이지네이션 (현재 전체 반환)
- [ ] 앱 생성 에러 로그 영속화 (현재 in-memory job만, 서버 재시작 시 소실)
- [ ] Gitea 웹훅 시크릿 검증 (현재 시크릿 설정은 되지만 서명 검증 로직 없음)
- [ ] 다중 도메인 연결 (현재 앱당 1개 도메인)
