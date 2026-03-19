# Brewnet — Static Deploy 완전 스펙

> **문서 목적**: 비개발자 포함 모든 사용자가 HTML/CSS/JS 정적 사이트를 Brewnet 홈서버에서 서빙할 수 있는 전체 시스템 설계  
> **작성일**: 2026-03-18  
> **사이트**: brewnet.dev | **라이선스**: Business Source License 1.1

---

## 목차

1. [문제 정의](#1-문제-정의)
2. [3가지 소스 유형과 배포 경로](#2-3가지-소스-유형과-배포-경로)
3. [자동 감지 로직](#3-자동-감지-로직)
4. [CLI 스펙](#4-cli-스펙)
5. [Pro Dashboard — Static Sites 화면 스펙](#5-pro-dashboard--static-sites-화면-스펙)
6. [Add Site 모달 — 3단계 플로우](#6-add-site-모달--3단계-플로우)
7. [사이트 카드 액션 상세](#7-사이트-카드-액션-상세)
8. [내부 구현 상세](#8-내부-구현-상세)
9. [Docker Compose 생성 규칙](#9-docker-compose-생성-규칙)
10. [Gitea 연동 (선택)](#10-gitea-연동-선택)
11. [오픈 구현 이슈](#11-오픈-구현-이슈)

---

## 1. 문제 정의

### 기존 App Deploy와의 차이

```
기존 App Deploy (개발자용)           Static Deploy (일반인 포함)
─────────────────────────────────   ────────────────────────────────
소스코드 작성                         HTML/CSS/이미지 파일 보유
  ↓                                   ↓
Dockerfile 빌드 (복잡)               빌드 없음 — 파일이 곧 결과물
  ↓                                   ↓
Docker 컨테이너 실행                  SWS 컨테이너가 파일 서빙
  ↓                                   ↓
Traefik → 도메인                     Traefik → 도메인
```

### 타깃 사용자

| 사용자 유형 | 가진 것 | 원하는 것 |
|-----------|--------|---------|
| 비개발자 | HTML+CSS+이미지 파일 (또는 ZIP) | 홈페이지를 도메인으로 접근 |
| 초보 개발자 | GitHub에 index.html 올려놓음 | URL 하나로 바로 서빙 |
| 중급 개발자 | React 빌드 결과물 (dist/) | Netlify처럼 배포 |
| 고급 개발자 | React 소스 + 자동 빌드 원함 | Git push → 자동 빌드+배포 |

### Gitea와 Traefik의 역할 재정의

```
Gitea:   선택 사항 (자동 배포 원할 때만 연동)
         없어도 파일 업로드/GitHub clone으로 서빙 가능

Traefik: 필수 — 도메인 라우팅 전담
         SWS 컨테이너 ↔ 도메인 연결
```

---

## 2. 3가지 소스 유형과 배포 경로

### Type A — 순수 HTML/CSS/JS (빌드 불필요)

```
파일/ZIP/GitHub URL
      ↓
~/.brewnet/static/{name}/
      ↓
SWS 컨테이너 (볼륨 마운트)
      ↓
Traefik → my-site.yourdomain.com
```

**감지 조건**: `index.html` 이 루트에 존재하고 `package.json` 없음

**서빙 방식**: 볼륨 마운트 → 파일 교체 즉시 반영, 재시작 불필요

### Type B — 이미 빌드된 결과물 (dist/ 또는 build/)

```
dist/ 또는 build/ 디렉토리
      ↓
해당 하위 경로만 SWS 볼륨에 복사
      ↓
SWS 컨테이너 서빙
```

**감지 조건**: `dist/index.html`, `build/index.html`, `public/index.html` 중 하나 존재

### Type C — 소스코드 (npm run build 필요)

```
package.json + build 스크립트
      ↓
Node.js 빌드 컨테이너 (일회성 실행)
  npm install && npm run build
      ↓
dist/ → ~/.brewnet/static/{name}/
      ↓
SWS 컨테이너 서빙
```

**감지 조건**: `package.json` 에 `scripts.build` 존재

**빌드 컨테이너**: `node:20-alpine` 기반 일회성 Job 컨테이너 (실행 후 자동 삭제)

---

## 3. 자동 감지 로직

```typescript
// src/static/auto-detect.ts

type SiteType = 'pure-static' | 'pre-built' | 'needs-build'
type BuildTool = 'vite' | 'cra' | 'next' | 'nuxt' | 'astro' | 'generic'
type OutputDir = 'dist' | 'build' | 'out' | '.next' | '.output'

interface DetectionResult {
  type: SiteType
  buildTool?: BuildTool
  outputDir?: OutputDir
  serveRoot: string      // 실제로 SWS가 서빙할 경로
  confidence: 'high' | 'medium' | 'low'
}

async function detectSiteType(repoPath: string): Promise<DetectionResult> {

  // 우선순위 1: 루트 index.html (빌드 완전 불필요)
  if (exists(`${repoPath}/index.html`) && !exists(`${repoPath}/package.json`)) {
    return { type: 'pure-static', serveRoot: repoPath, confidence: 'high' }
  }

  // 우선순위 2: 이미 dist/build 있음
  for (const dir of ['dist', 'build', 'public', 'out']) {
    if (exists(`${repoPath}/${dir}/index.html`)) {
      return { type: 'pre-built', serveRoot: `${repoPath}/${dir}`, confidence: 'high' }
    }
  }

  // 우선순위 3: package.json 분석
  if (exists(`${repoPath}/package.json`)) {
    const pkg = JSON.parse(readFile(`${repoPath}/package.json`))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const buildScript = pkg.scripts?.build

    if (!buildScript) {
      // build 스크립트 없으면 그냥 정적 서빙
      return { type: 'pure-static', serveRoot: repoPath, confidence: 'medium' }
    }

    // 빌드 도구 감지
    let buildTool: BuildTool = 'generic'
    let outputDir: OutputDir = 'dist'

    if (deps['vite'])       { buildTool = 'vite';  outputDir = 'dist' }
    if (deps['next'])       { buildTool = 'next';  outputDir = 'out' }  // next export
    if (deps['nuxt'])       { buildTool = 'nuxt';  outputDir = '.output' }
    if (deps['astro'])      { buildTool = 'astro'; outputDir = 'dist' }
    if (buildScript?.includes('react-scripts')) { buildTool = 'cra'; outputDir = 'build' }

    return { type: 'needs-build', buildTool, outputDir, serveRoot: `${repoPath}/${outputDir}`, confidence: 'high' }
  }

  // 기본값: 루트를 그냥 서빙
  return { type: 'pure-static', serveRoot: repoPath, confidence: 'low' }
}
```

### 감지 결과 UI 표시

```
GitHub URL 입력 후 자동 분석 결과:

┌─────────────────────────────────────────────────┐
│  ✅ 분석 완료                                     │
│                                                  │
│  감지된 유형: Vite + React 프로젝트               │
│  빌드 명령: npm run build                         │
│  서빙 경로: dist/                                 │
│                                                  │
│  □ 서빙 경로 직접 지정 [dist/    ]               │
└─────────────────────────────────────────────────┘
```

---

## 4. CLI 스펙

### 명령어 목록

```bash
# 파일/디렉토리에서 사이트 추가
brewnet static add --name my-site --from ./dist
brewnet static add --name my-site --from ./my-site.zip

# GitHub URL에서 클론 + 서빙
brewnet static add --name my-site --from-github https://github.com/user/repo
brewnet static add --name my-site --from-github https://github.com/user/repo --branch main

# 인터랙티브 모드
brewnet static add

# 사이트 목록
brewnet static list

# 파일 업데이트 (재시작 불필요)
brewnet static deploy my-site --from ./dist

# 사이트 제거
brewnet static remove my-site

# 기동/중지
brewnet static start my-site
brewnet static stop my-site

# 로그
brewnet static logs my-site [--tail 50]
```

### `brewnet static add` 인터랙티브 플로우

```
$ brewnet static add

? 소스 유형:
  ◉ GitHub URL
  ○ 로컬 디렉토리
  ○ ZIP 파일
  ○ 빈 사이트 (파일 업로드 예정)

? GitHub URL: https://github.com/user/my-homepage

  ⟳ 분석 중...
  ✅ 감지: 순수 HTML/CSS (빌드 불필요)

? 사이트 이름: my-homepage

? 도메인:
  ◉ my-homepage.yourdomain.com (기존 도메인에 서브도메인 추가)
  ○ 로컬 전용 (my-homepage.brewnet.local)

? SPA 모드 (React/Vue 라우팅): No

──────────────────────────────────────
✅ 사이트 생성 완료: my-homepage
🌐 URL:   https://my-homepage.yourdomain.com
📁 경로:  ~/.brewnet/static/my-homepage/
──────────────────────────────────────
```

---

## 5. Pro Dashboard — Static Sites 화면 스펙

### 사이드바 위치

```
Dashboard
Apps           ← 기존 (Docker 기반)
Static Sites   ← 이 스펙 (신규)
Git Server
Routing
Domains
Monitor
Settings
```

### 메인 화면 구조

```
┌────────────────────────────────────────────────────────────────────┐
│  Static Sites                              [+ Add Site]            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [사이트 목록]  [탐색/추가]  [로그]                                 │
│                                                                    │
│  3 sites  ·  2 running  ·  1 stopped                               │
│                                                                    │
│  ─── 사이트 카드 목록 (아래 참조) ───                               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 사이트 카드

```
┌────────────────────────────────────────────────────────────────┐
│  🟢 running    my-homepage                   [열기 ↗]           │
│  https://my-homepage.yourdomain.com                            │
│                                                                │
│  Type: Pure HTML/CSS    SPA: OFF    CORS: OFF                  │
│  Source: GitHub  github.com/user/my-homepage  (main)           │
│  Last deploy: 2026-03-18 14:32   commit: a3f1bc2               │
│                                                                │
│  [📂 Files]  [⚙ Config]  [📋 Logs]  [🔗 Git]  [🗑 Delete]    │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Add Site 모달 — 3단계 플로우

### Step 1 — 소스 선택

```
┌─────────────────────────────────────────────────────┐
│  + Add Static Site                     Step 1 / 3   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  어떻게 사이트를 가져올까요?                          │
│                                                     │
│  ┌─────────────────┐  ┌─────────────────┐           │
│  │  📂             │  │  🐙             │           │
│  │  파일 업로드     │  │  GitHub URL     │           │
│  │                 │  │                 │           │
│  │  ZIP 또는 폴더  │  │  Public repo    │           │
│  │  드래그&드롭    │  │  URL 입력       │           │
│  └─────────────────┘  └─────────────────┘           │
│  ┌─────────────────┐  ┌─────────────────┐           │
│  │  🦊             │  │  ✏️             │           │
│  │  Gitea 저장소   │  │  빈 사이트      │           │
│  │                 │  │                 │           │
│  │  내부 Gitea     │  │  파일 나중에    │           │
│  │  에서 선택      │  │  업로드         │           │
│  └─────────────────┘  └─────────────────┘           │
│                                                     │
│  사이트 이름 *  [my-homepage           ]            │
│                                                     │
│                          [취소]  [다음: 설정 →]     │
└─────────────────────────────────────────────────────┘
```

**파일 업로드 선택 시 확장:**
```
  드래그&드롭 영역
  ┌─────────────────────────────────────┐
  │                                     │
  │   📁 파일을 여기에 드롭하세요         │
  │   또는 클릭하여 선택                 │
  │                                     │
  │   지원: .zip, 폴더, HTML 파일        │
  └─────────────────────────────────────┘
```

**GitHub URL 선택 시 확장:**
```
  GitHub URL
  [https://github.com/user/repo    ]  [분석]

  분석 결과:
  ✅ 감지: Vite + React  →  dist/ 서빙
  □ 서빙 경로 직접 지정  [dist/    ]
```

### Step 2 — 도메인 + 서빙 설정

```
┌─────────────────────────────────────────────────────┐
│  + Add Static Site                     Step 2 / 3   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  도메인 설정                                         │
│                                                     │
│  ◉ 기존 도메인에 서브도메인 추가                     │
│  ○ 로컬 전용 (brewnet.local)                        │
│                                                     │
│  Root Domain   [yourdomain.com       ▼]             │
│  Subdomain     [my-homepage          ]              │
│  → https://my-homepage.yourdomain.com               │
│    ✅ Cloudflare Tunnel 자동 설정됨                  │
│                                                     │
│  ─── 서빙 옵션 ──────────────────────────────────   │
│                                                     │
│  SPA 모드     [ON  ●──────○ OFF]                    │
│  (404 → index.html fallback)                        │
│                                                     │
│  CORS         [OFF ○──────● OFF]                    │
│                                                     │
│              [← 뒤로]  [다음: 완료 →]               │
└─────────────────────────────────────────────────────┘
```

### Step 3 — 확인 + Gitea 연동(선택)

```
┌─────────────────────────────────────────────────────┐
│  + Add Static Site                     Step 3 / 3   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  확인                                                │
│  ─────────────────────────────────────────────────  │
│  사이트명:   my-homepage                             │
│  소스:       github.com/user/my-homepage             │
│  유형:       Vite → dist/                            │
│  도메인:     https://my-homepage.yourdomain.com      │
│  SPA:        ON                                     │
│                                                     │
│  ─── Gitea 자동 배포 (선택) ─────────────────────   │
│                                                     │
│  Git push 시 자동 재배포  [OFF ○──────● OFF]        │
│                                                     │
│  ON 시: Gitea에 Webhook 자동 등록                   │
│  main 브랜치 push → 자동 빌드 + 배포                 │
│                                                     │
│              [← 뒤로]  [✅ 사이트 생성]             │
└─────────────────────────────────────────────────────┘
```

---

## 7. 사이트 카드 액션 상세

### 📂 Files 패널 (슬라이드오버)

```
~/.brewnet/static/my-homepage/
├── index.html         2.3 KB   ●
├── style.css          8.1 KB   ●
└── assets/
    ├── logo.png       45 KB
    └── hero.webp      120 KB

총 12개 파일 · 1.4 MB

[📤 파일 업로드]  [🔄 GitHub에서 동기화]  [📥 ZIP 다운로드]
```

### ⚙ Config 패널 (슬라이드오버)

```
Display Name  [My Homepage        ]
Domain        [my-homepage.you…   ]
SPA 모드      [ON  ●──○]
CORS          [OFF ○──●]
Dir Listing   [OFF ○──●]
404 Page      [404.html           ]

서빙 경로     [dist/              ]
빌드 명령     [npm run build      ]  (Type C 시)

[저장]
```

### 📋 Logs 모달

```
배포 #3  2026-03-18 14:32  GitHub Push  ✅ 성공
  [14:32:01] git pull origin main
  [14:32:02] npm run build  (23.4s)
  [14:32:25] rsync dist/ → /static/  (8 files)
  [14:32:26] ✅ 배포 완료

배포 #2  2026-03-17 09:15  수동 배포  ✅ 성공
배포 #1  2026-03-15 22:08  첫 배포  ✅ 성공
```

---

## 8. 내부 구현 상세

### 파일 소스별 처리 로직

```typescript
// src/static/source-handler.ts

class StaticSourceHandler {

  // 경로 A: 파일 직접 업로드
  async handleFileUpload(file: File, siteName: string): Promise<void> {
    const destPath = `${BREWNET_DATA}/static/${siteName}`
    fs.mkdirSync(destPath, { recursive: true })

    if (file.name.endsWith('.zip')) {
      await unzip(file.path, destPath)
    } else {
      await fs.copyFile(file.path, `${destPath}/${file.name}`)
    }
    // SWS 볼륨에 이미 파일이 있으므로 재시작 불필요
  }

  // 경로 B: GitHub URL
  async handleGitHubClone(url: string, siteName: string, branch = 'main'): Promise<DetectionResult> {
    const repoPath = `${BREWNET_DATA}/static/${siteName}/.git-repo`
    const servePath = `${BREWNET_DATA}/static/${siteName}`
    fs.mkdirSync(repoPath, { recursive: true })

    // 클론 (depth=1 빠른 클론)
    await exec(`git clone --depth 1 -b ${branch} ${url} ${repoPath}`)

    // 자동 감지
    const result = await detectSiteType(repoPath)

    if (result.type === 'needs-build') {
      await this.runBuild(repoPath, result)
    }

    // 서빙 경로 → SWS 볼륨으로 rsync
    await exec(`rsync -av --delete ${result.serveRoot}/ ${servePath}/`)

    return result
  }

  // 빌드 (Type C)
  private async runBuild(repoPath: string, detection: DetectionResult): Promise<void> {
    // 일회성 Node.js 컨테이너 실행
    await exec(`
      docker run --rm \
        -v ${repoPath}:/app \
        -w /app \
        node:20-alpine \
        sh -c "npm install --silent && npm run build"
    `)
  }

  // GitHub에서 업데이트 (수동 또는 Webhook)
  async syncFromGitHub(siteName: string): Promise<void> {
    const repoPath = `${BREWNET_DATA}/static/${siteName}/.git-repo`
    const servePath = `${BREWNET_DATA}/static/${siteName}`

    const site = await getSite(siteName)
    await exec(`git -C ${repoPath} pull origin ${site.branch}`)

    if (site.buildRequired) {
      await this.runBuild(repoPath, site.detection)
    }

    // rsync → SWS 즉시 반영 (재시작 불필요)
    await exec(`rsync -av --delete ${site.detection.serveRoot}/ ${servePath}/`)
  }
}
```

### 디렉토리 구조

```
~/.brewnet/static/
├── my-homepage/
│   ├── .git-repo/          ← GitHub clone 저장소 (서빙 불사용)
│   │   ├── .git/
│   │   ├── src/
│   │   └── dist/
│   ├── index.html          ← SWS가 실제 서빙하는 파일들
│   ├── style.css
│   └── assets/
├── portfolio/
│   ├── index.html
│   └── ...
└── docs-site/
    └── ...
```

---

## 9. Docker Compose 생성 규칙

```yaml
# ~/.brewnet/docker-compose.static.yml (자동 생성/관리)

services:

  brewnet-static-my-homepage:
    image: joseluisq/static-web-server:2
    container_name: brewnet-static-my-homepage
    restart: unless-stopped
    environment:
      - SERVER_PORT=80
      - SERVER_ROOT=/public
      # SPA: true 시
      - SERVER_FALLBACK_PAGE=/public/index.html
      - SERVER_COMPRESSION=true
      - SERVER_DIRECTORY_LISTING=false
      - SERVER_HEALTH=true
    volumes:
      - ${HOME}/.brewnet/static/my-homepage:/public:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.static-my-homepage.rule=Host(`my-homepage.yourdomain.com`)"
      - "traefik.http.routers.static-my-homepage.entrypoints=web,websecure"
      - "traefik.http.routers.static-my-homepage.tls.certresolver=letsencrypt"
      - "traefik.http.services.static-my-homepage.loadbalancer.server.port=80"
      # 로컬 접근
      - "traefik.http.routers.static-my-homepage-local.rule=Host(`my-homepage.brewnet.local`)"
      - "traefik.http.routers.static-my-homepage-local.entrypoints=web"
      # Brewnet 메타
      - "brewnet.type=static"
      - "brewnet.site=my-homepage"
    networks:
      - brewnet-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 5s
      retries: 3

networks:
  brewnet-network:
    external: true
```

---

## 10. Gitea 연동 (선택)

### 연동 ON 시 동작

```
1. Gitea API → 저장소 Webhook 등록
   POST /api/v1/repos/{owner}/{repo}/hooks
   payload → POST http://brewnet-agent:9876/hooks/static/{siteId}

2. push 이벤트 수신 시:
   - git pull origin {branch}
   - 빌드 필요 시 docker run node:20-alpine npm run build
   - rsync → SWS 볼륨 (재시작 불필요)
   - 배포 로그 기록

3. 연동 해제 시:
   - Gitea Webhook 자동 삭제
   - 수동 배포로 전환
```

### GitHub Public Repo → Gitea Mirror (선택 제공)

```
GitHub public repo
      ↓
Gitea에 Mirror 설정 (Gitea의 Mirror 기능 사용)
  - 주기: 10분마다 sync
      ↓
Gitea Webhook → brewnet-agent
      ↓
자동 배포
```

이 방식으로 "GitHub에 push하면 홈서버에 자동 배포"가 가능합니다.

---

## 11. 오픈 구현 이슈

| # | 이슈 | 우선순위 | 비고 |
|---|------|----------|------|
| SD-01 | Next.js SSG 빌드 결과물 처리 (`next export` vs `output: 'export'`) | High | v13+ 기준 다름 |
| SD-02 | 빌드 실패 시 이전 배포 유지 (rollback) | High | rsync 전 백업 필요 |
| SD-03 | 빌드 컨테이너 메모리 제한 설정 | Medium | 기본 512MB 권장 |
| SD-04 | Private GitHub repo 지원 (PAT 입력) | Medium | 보안 고려 |
| SD-05 | 빌드 캐시 (node_modules) 볼륨 재사용 | Medium | 빌드 속도 개선 |
| SD-06 | 다수 사이트 동시 배포 경합 처리 | Medium | 배포 큐 구현 |
| SD-07 | ZIP 업로드 최대 용량 제한 | Low | 기본 500MB |
| SD-08 | Webflow/Squarespace export HTML 호환성 | Low | 상대경로 처리 |

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| 1.0.0 | 2026-03-18 | 최초 작성 |
