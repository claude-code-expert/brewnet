# Brewnet — Static Publish (SWS 연동) 완전 스펙

> **문서 목적**: Static-Web-Server(SWS) 기반 정적 사이트 호스팅 기능의 설치·설정·CLI·Pro Dashboard·Gitea 연동 전체 사양 정의  
> **대상**: Brewnet CLI 개발팀 / Pro Dashboard 팀 / Claude Code 에이전트  
> **작성일**: 2026-03-18  
> **사이트**: brewnet.dev | **라이선스**: Business Source License 1.1

---

## 목차

1. [Static-Web-Server 개요](#1-static-web-server-개요)
2. [아키텍처](#2-아키텍처)
3. [사이트 단위 데이터 모델](#3-사이트-단위-데이터-모델)
4. [CLI 명령어 스펙](#4-cli-명령어-스펙)
5. [Pro Dashboard — Static Sites 화면 스펙](#5-pro-dashboard--static-sites-화면-스펙)
6. [Gitea 연동 스펙](#6-gitea-연동-스펙)
7. [배포 파이프라인 플로우](#7-배포-파이프라인-플로우)
8. [Docker Compose 생성 규칙](#8-docker-compose-생성-규칙)
9. [Traefik 라우팅 통합](#9-traefik-라우팅-통합)
10. [오픈 구현 이슈](#10-오픈-구현-이슈)

---

## 1. Static-Web-Server 개요

### 1.1 기본 정보

| 항목 | 내용 |
|------|------|
| 프로젝트명 | static-web-server (SWS) |
| 라이선스 | MIT (완전 오픈소스) |
| 언어 | Rust |
| Docker 이미지 | `joseluisq/static-web-server:2` |
| 이미지 크기 | ~4MB (Alpine 기반) |
| GitHub | https://github.com/static-web-server/static-web-server |

### 1.2 주요 특징

```
✅ 빌드 없이 파일만 교체하면 즉시 반영 (볼륨 마운트 방식)
✅ SPA fallback 지원 (React/Vue 등 index.html 라우팅)
✅ Gzip / Brotli / Zstd 사전 압축 파일 자동 서빙
✅ CORS 환경변수 한 줄 설정
✅ Basic Auth 내장
✅ 디렉토리 리스팅 on/off
✅ 404 커스텀 페이지
✅ 헬스체크 엔드포인트 /health 내장
✅ 환경변수만으로 전체 설정 → CLI 자동화에 최적
```

### 1.3 Brewnet 채택 이유

기존 `App Deploy` 는 Dockerfile 빌드 → 컨테이너 기동 흐름이지만,  
**Static Publish** 는 빌드 단계 자체가 없거나 이미 완료된 결과물을 서빙하는 별도 개념입니다.

```
App Deploy (기존)          Static Publish (신규)
──────────────────         ──────────────────────
소스코드 → 빌드            HTML/CSS/JS/이미지
→ Docker 이미지            → 볼륨 마운트
→ 컨테이너 기동            → SWS가 즉시 서빙
→ Traefik 라우팅           → Traefik 라우팅
```

---

## 2. 아키텍처

### 2.1 전체 구조

```
사용자 브라우저
      │ https://my-homepage.yourdomain.com
      ▼
Cloudflare Edge (Tunnel)
      │
      ▼
cloudflared 컨테이너
      │ http://traefik:80
      ▼
Traefik (Host 매칭)
      │
      ├──▶ brewnet-static-my-homepage:80  ←── SWS 컨테이너 #1
      │         │ volume mount
      │         └─▶ ~/.brewnet/static/my-homepage/  (HTML/CSS/이미지)
      │
      └──▶ brewnet-static-portfolio:80    ←── SWS 컨테이너 #2
                │ volume mount
                └─▶ ~/.brewnet/static/portfolio/
```

### 2.2 사이트 격리 원칙

- **사이트 1개 = SWS 컨테이너 1개 = 볼륨 디렉토리 1개**
- 컨테이너명 패턴: `brewnet-static-{site-name}`
- 볼륨 경로 패턴: `~/.brewnet/static/{site-name}/`
- 포트는 외부 노출 없음 (Traefik internal network만 사용)

### 2.3 Gitea 연동 구조

```
Gitea 저장소 (my-homepage)
      │
      │ git push (main 브랜치)
      ▼
Gitea Webhook → POST http://brewnet-agent/hooks/static-deploy
      │
      ▼
brewnet-agent (내부 서비스)
      │
      ├─ 1. git pull → ~/.brewnet/static/my-homepage/
      ├─ 2. 파일 동기화 (rsync)
      └─ 3. SWS 컨테이너 재시작 없음 (볼륨이므로 즉시 반영)
```

---

## 3. 사이트 단위 데이터 모델

```typescript
interface StaticSite {
  // 기본 정보
  id: string;                    // UUID
  name: string;                  // 사이트 고유 이름 (URL slug)
  displayName: string;           // 대시보드 표시 이름
  description?: string;

  // 서빙 설정
  domain: string;                // 연결된 외부 도메인 (또는 subdomain)
  localDomain: string;           // {name}.brewnet.local (자동 생성)
  spaMode: boolean;              // SPA fallback 활성화 여부
  corsEnabled: boolean;
  directoryListing: boolean;

  // 파일 경로
  volumePath: string;            // ~/.brewnet/static/{name}/
  containerName: string;         // brewnet-static-{name}

  // Gitea 연동
  gitea: {
    enabled: boolean;
    repoOwner: string;           // Gitea 사용자명 또는 org
    repoName: string;            // Gitea 저장소명
    branch: string;              // 배포 브랜치 (기본: main)
    webhookId?: number;          // Gitea webhook ID
    deployOnPush: boolean;       // push 시 자동 배포
    subPath?: string;            // 저장소 내 서빙할 하위 경로 (예: dist/)
  };

  // 상태
  status: 'running' | 'stopped' | 'deploying' | 'error';
  lastDeployedAt?: Date;
  lastDeployCommit?: string;     // 마지막 배포 커밋 SHA
  createdAt: Date;
}
```

---

## 4. CLI 명령어 스펙

### 4.1 명령어 목록

```bash
# 사이트 추가 (새로 생성)
brewnet static add <name>

# 사이트 목록 조회
brewnet static list

# 사이트 삭제
brewnet static remove <name>

# 파일 수동 배포 (로컬 디렉토리에서)
brewnet static deploy <name> --from <local-path>

# Gitea 연동 설정
brewnet static link <name> --repo <owner/repo> [--branch main] [--sub-path dist/]

# Gitea 연동 해제
brewnet static unlink <name>

# 사이트 기동 / 중지
brewnet static start <name>
brewnet static stop <name>

# 사이트 설정 변경
brewnet static config <name> --spa true --cors true

# 배포 로그 확인
brewnet static logs <name> [--tail 50]
```

### 4.2 `brewnet static add` 인터랙티브 플로우

```
$ brewnet static add

? Site name (URL slug):     my-homepage
? Display name:             My Homepage
? Domain:
  ○ 신규 서브도메인 설정   → my-homepage.yourdomain.com
  ○ 로컬 전용             → my-homepage.brewnet.local
? SPA mode (React/Vue):     Yes
? CORS:                     No
? Gitea 연동:
  ○ 지금 설정
  ◉ 나중에 설정

────────────────────────────────────
✅ 사이트 생성됨: my-homepage
📁 파일 경로:  ~/.brewnet/static/my-homepage/
🌐 로컬 URL:  http://my-homepage.brewnet.local
────────────────────────────────────
파일을 ~/.brewnet/static/my-homepage/ 에 복사하면 즉시 반영됩니다.
```

### 4.3 `brewnet static deploy` 동작

```bash
brewnet static deploy my-homepage --from ./dist

# 내부 동작:
# 1. rsync -av --delete ./dist/ ~/.brewnet/static/my-homepage/
# 2. SWS 컨테이너 재시작 불필요 (볼륨 방식)
# 3. 배포 완료 로그 출력

✅ 배포 완료 (23개 파일, 1.2MB)
🌐 https://my-homepage.yourdomain.com
```

---

## 5. Pro Dashboard — Static Sites 화면 스펙

### 5.1 왼쪽 사이드바 메뉴 위치

```
┌─────────────────┐
│  🍺 Brewnet     │
├─────────────────┤
│  Dashboard      │
│  Apps           │  ← 기존 App Deploy
│  Static Sites   │  ← 신규 (이 스펙)
│  Git Server     │
│  Routing        │
│  Domains        │
│  Monitor        │
│  Settings       │
└─────────────────┘
```

### 5.2 Static Sites 메인 화면

```
┌────────────────────────────────────────────────────────────────────┐
│  Static Sites                              [+ Add Site]            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  2 sites running                                                   │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐  │
│ │  🟢 my-homepage                                              │  │
│ │  https://my-homepage.yourdomain.com                          │  │
│ │  ──────────────────────────────────────                      │  │
│ │  Gitea: brewnet-admin/my-homepage  (main)    ✅ 연동됨        │  │
│ │  Last deploy: 2026-03-18 14:32   commit: a3f1bc2             │  │
│ │  SPA: ON  │  CORS: OFF  │  Dir Listing: OFF                  │  │
│ │                                                              │  │
│ │  [📂 Files]  [⚙ Config]  [📋 Logs]  [🔗 Git]  [🗑 Delete]  │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐  │
│ │  🟢 portfolio                                                │  │
│ │  https://portfolio.yourdomain.com                            │  │
│ │  ──────────────────────────────────────                      │  │
│ │  Gitea: brewnet-admin/portfolio  (main)      ✅ 연동됨        │  │
│ │  Last deploy: 2026-03-17 09:15   commit: d82e491             │  │
│ │  SPA: OFF  │  CORS: ON  │  Dir Listing: OFF                  │  │
│ │                                                              │  │
│ │  [📂 Files]  [⚙ Config]  [📋 Logs]  [🔗 Git]  [🗑 Delete]  │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 5.3 Add Site 모달 — 3단계

#### Step 1: 기본 정보

```
┌───────────────────────────────────────────────────┐
│  ➕ Add Static Site                    [1/3]       │
├───────────────────────────────────────────────────┤
│                                                   │
│  Site Name *                                      │
│  [my-homepage              ]                      │
│  ℹ URL에 사용됩니다 (영문·숫자·하이픈만)           │
│                                                   │
│  Display Name                                     │
│  [My Homepage              ]                      │
│                                                   │
│  Description                                      │
│  [                         ]  (선택)              │
│                                                   │
│  ─────────────────────────────────────────────    │
│  Options                                          │
│                                                   │
│  SPA Mode          [ON  ●──────○  OFF]            │
│  (React/Vue SPA 404 → index.html fallback)        │
│                                                   │
│  CORS              [OFF ○──────●  OFF]            │
│                                                   │
│  Directory Listing [OFF ○──────●  OFF]            │
│                                                   │
│               [Cancel]  [Next: Domain →]          │
└───────────────────────────────────────────────────┘
```

#### Step 2: 도메인 연결

```
┌───────────────────────────────────────────────────┐
│  ➕ Add Static Site                    [2/3]       │
├───────────────────────────────────────────────────┤
│                                                   │
│  도메인 설정                                       │
│                                                   │
│  ◉ 기존 연결된 도메인에 서브도메인 추가            │
│  ○ 새 도메인 연결                                 │
│  ○ 로컬 전용 (brewnet.local)                      │
│                                                   │
│  ─ ◉ 선택 시 ─────────────────────────────────    │
│                                                   │
│  Root Domain  [yourdomain.com          ▼]         │
│  Subdomain    [my-homepage             ]          │
│                                                   │
│  → https://my-homepage.yourdomain.com             │
│    ✅ Cloudflare Tunnel 자동 설정됨               │
│                                                   │
│          [← Back]  [Next: Git Connect →]          │
└───────────────────────────────────────────────────┘
```

#### Step 3: Gitea 연동 (선택)

```
┌───────────────────────────────────────────────────┐
│  ➕ Add Static Site                    [3/3]       │
├───────────────────────────────────────────────────┤
│                                                   │
│  Gitea 연동  [ON  ●──────○  OFF]                  │
│                                                   │
│  ─ 연동 ON 시 ─────────────────────────────────   │
│                                                   │
│  Repository                                       │
│  [brewnet-admin  ▼] / [my-homepage     ▼]        │
│                    또는 [+ 새 저장소 생성]         │
│                                                   │
│  Branch         [main                  ]          │
│                                                   │
│  Sub Path       [dist/                 ]          │
│  ℹ 저장소 내 서빙할 경로 (비워두면 루트 전체)      │
│                                                   │
│  Deploy on push  [ON  ●──────○  OFF]              │
│  (main push 시 자동 배포)                          │
│                                                   │
│  ─────────────────────────────────────────────    │
│                                                   │
│  ○ Gitea 연동 없이 수동 배포만 사용               │
│                                                   │
│        [← Back]  [✅ Create Site]                 │
└───────────────────────────────────────────────────┘
```

### 5.4 사이트 카드 액션 상세

#### 📂 Files 버튼

```
슬라이드오버 패널 (우측)
┌─────────────────────────────────────┐
│  📂 my-homepage Files               │
│  ~/.brewnet/static/my-homepage/     │
├─────────────────────────────────────┤
│  index.html       2.3 KB   03-18   │
│  style.css        8.1 KB   03-18   │
│  /assets/                          │
│    logo.png       45 KB    03-17   │
│    hero.webp      120 KB   03-17   │
│                                    │
│  총 12개 파일 │ 1.4 MB             │
│                                    │
│  [📤 Upload Files]  [🔄 Sync Git]  │
└─────────────────────────────────────┘
```

#### ⚙ Config 버튼

```
슬라이드오버 패널 (우측)
┌─────────────────────────────────────┐
│  ⚙ my-homepage Config               │
├─────────────────────────────────────┤
│  Display Name  [My Homepage      ]  │
│  Domain        [my-homepage.you…  ] │
│  SPA Mode      [ON  ●──────○]       │
│  CORS          [OFF ○──────●]       │
│  Dir Listing   [OFF ○──────●]       │
│  404 Page      [404.html         ]  │
│                                    │
│              [Save Changes]         │
└─────────────────────────────────────┘
```

#### 📋 Logs 버튼

```
모달
┌───────────────────────────────────────────────────┐
│  📋 Deploy Logs — my-homepage                     │
├───────────────────────────────────────────────────┤
│                                                   │
│  ● 2026-03-18 14:32:01  Webhook received          │
│    commit: a3f1bc2  "Update hero image"           │
│    branch: main                                   │
│    ──────────────────────────────────             │
│    [14:32:01] git pull origin main                │
│    [14:32:02] Already up to date.                 │
│    [14:32:02] rsync dist/ → /static/              │
│    [14:32:03] ✅ 8 files synced (234 KB)          │
│    [14:32:03] Deploy complete                     │
│                                                   │
│  ● 2026-03-17 09:15:44  Manual deploy             │
│    [09:15:44] rsync ./build/ → /static/           │
│    [09:15:45] ✅ 24 files synced (1.2 MB)         │
│                                                   │
│                              [Close]              │
└───────────────────────────────────────────────────┘
```

#### 🔗 Git 버튼

```
슬라이드오버 패널
┌─────────────────────────────────────┐
│  🔗 Git 연동 — my-homepage          │
├─────────────────────────────────────┤
│  상태: ✅ 연동됨                     │
│  저장소: brewnet-admin/my-homepage  │
│  브랜치: main                       │
│  Sub Path: dist/                   │
│  Webhook: ✅ 활성 (#12)             │
│                                    │
│  [Gitea에서 열기 ↗]                 │
│                                    │
│  ─────────────────────────────────  │
│  수동 배포                          │
│  [🔄 지금 배포 실행]                │
│                                    │
│  ─────────────────────────────────  │
│  연동 설정 변경                     │
│  Branch  [main              ]       │
│  Sub Path [dist/            ]       │
│  Deploy on push [ON ●──○]          │
│                                    │
│  [Save]   [⛔ 연동 해제]            │
└─────────────────────────────────────┘
```

---

## 6. Gitea 연동 스펙

### 6.1 연동 방식 요약

```
Gitea 저장소 → Webhook → brewnet-agent → rsync → SWS 볼륨
```

### 6.2 Webhook 자동 등록

사이트 생성 시 Gitea API를 사용해 Webhook을 자동 등록합니다.

```typescript
// src/static/gitea-webhook.ts

async function registerWebhook(
  giteaBaseUrl: string,
  apiToken: string,
  owner: string,
  repo: string,
  siteId: string
): Promise<number> {
  const webhookUrl = `http://brewnet-agent:9876/hooks/static/${siteId}`;

  const response = await fetch(
    `${giteaBaseUrl}/api/v1/repos/${owner}/${repo}/hooks`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'gitea',
        active: true,
        events: ['push'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: process.env.BREWNET_WEBHOOK_SECRET,
        },
      }),
    }
  );

  const data = await response.json();
  return data.id; // webhook ID 저장 (연동 해제 시 삭제에 사용)
}
```

### 6.3 Webhook 수신 처리

```typescript
// src/static/deploy-handler.ts

interface WebhookPayload {
  ref: string;           // "refs/heads/main"
  commits: Array<{ id: string; message: string }>;
  repository: { name: string };
}

async function handleStaticDeploy(
  siteId: string,
  payload: WebhookPayload
) {
  const site = await getSite(siteId);

  // 1. 브랜치 확인
  const pushedBranch = payload.ref.replace('refs/heads/', '');
  if (pushedBranch !== site.gitea.branch) return;

  // 2. git pull
  await exec(`git -C ${site.volumePath} pull origin ${site.gitea.branch}`);

  // 3. subPath가 있으면 해당 경로를 볼륨 루트로 rsync
  if (site.gitea.subPath) {
    const sourcePath = path.join(site.volumePath, '.git-repo', site.gitea.subPath);
    await exec(`rsync -av --delete ${sourcePath}/ ${site.volumePath}/`);
  }

  // 4. 배포 기록 저장
  await saveDeploy({
    siteId,
    commit: payload.commits[0]?.id,
    message: payload.commits[0]?.message,
    trigger: 'webhook',
    deployedAt: new Date(),
  });
}
```

### 6.4 subPath 처리 전략

저장소에 빌드 결과물(`dist/`)과 소스(`src/`)가 함께 있는 경우:

```
저장소 구조 예시:
my-homepage/
├── src/           ← 소스코드 (서빙 불필요)
├── dist/          ← 빌드 결과물 (이것만 서빙)
│   ├── index.html
│   └── assets/
└── README.md

subPath: "dist/"
→ dist/ 내용만 SWS 볼륨에 복사
```

> **⚠️ 구현 이슈**: subPath 사용 시 저장소 자체 clone 경로와 볼륨 경로를 분리 관리해야 함.  
> `~/.brewnet/static/{name}/.git-repo/` 에 clone, `~/.brewnet/static/{name}/` 에 실제 서빙 파일 분리 권장.

### 6.5 새 저장소 자동 생성

Step 3 모달에서 "새 저장소 생성" 선택 시:

```typescript
// 1. Gitea API로 빈 저장소 생성
POST /api/v1/user/repos
{
  "name": "{site-name}",
  "description": "Brewnet Static Site: {displayName}",
  "private": false,
  "auto_init": true,
  "default_branch": "main"
}

// 2. 볼륨 디렉토리를 git init + remote 설정
git init ~/.brewnet/static/{name}
git remote add origin http://gitea:3000/{owner}/{name}.git

// 3. README.md 초기 커밋
echo "# {displayName}" > README.md
git add . && git commit -m "Initial commit by Brewnet"
git push -u origin main

// 4. Webhook 자동 등록
```

---

## 7. 배포 파이프라인 플로우

### 7.1 자동 배포 (Git Push → 자동 반영)

```
[개발자] git push origin main
        │
        ▼
[Gitea] Webhook 발송
  POST http://brewnet-agent:9876/hooks/static/{siteId}
        │
        ▼
[brewnet-agent] 수신 + 서명 검증 (HMAC-SHA256)
        │
        ├─ 브랜치 확인 (main인 경우만 진행)
        │
        ├─ git pull origin main
        │    (~/.brewnet/static/{name}/.git-repo/)
        │
        ├─ rsync (.git-repo/dist/ → static/{name}/)
        │    --delete (삭제된 파일 동기화)
        │
        ├─ SWS 컨테이너 재시작 불필요
        │    (볼륨 마운트 → 즉시 반영)
        │
        └─ 배포 로그 저장 + Dashboard 실시간 업데이트
               (WebSocket 이벤트: static:deployed)
```

### 7.2 수동 배포 (Dashboard에서 즉시 배포)

```
[Dashboard] 🔄 지금 배포 실행 클릭
        │
        ▼
[brewnet-agent] git pull + rsync 수행
        │
        ▼
[Dashboard] Logs 패널 실시간 출력
        │
        ▼
✅ 배포 완료
```

### 7.3 파일 직접 업로드 (Gitea 없이)

```
[Dashboard] 📂 Files → Upload Files
        │
        ▼
Multipart upload → brewnet-agent
        │
        ▼
파일 저장 → ~/.brewnet/static/{name}/
        │
        ▼
SWS 즉시 반영 (재시작 불필요)
```

---

## 8. Docker Compose 생성 규칙

### 8.1 사이트별 docker-compose 서비스 블록

```yaml
# ~/.brewnet/docker-compose.static.yml
# brewnet static add 시 자동 생성/추가

services:

  # Site: my-homepage
  brewnet-static-my-homepage:
    image: joseluisq/static-web-server:2
    container_name: brewnet-static-my-homepage
    restart: unless-stopped
    environment:
      - SERVER_PORT=80
      - SERVER_ROOT=/public
      - SERVER_FALLBACK_PAGE=/public/index.html  # SPA: true 시
      - SERVER_COMPRESSION=true
      - SERVER_DIRECTORY_LISTING=false
      - SERVER_CORS_ALLOW_ORIGINS=          # CORS: false 시 빈값
      - SERVER_HEALTH=true                  # /health 엔드포인트
      - SERVER_LOG_LEVEL=info
    volumes:
      - ${HOME}/.brewnet/static/my-homepage:/public:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.static-my-homepage.rule=Host(`my-homepage.yourdomain.com`)"
      - "traefik.http.routers.static-my-homepage.entrypoints=web,websecure"
      - "traefik.http.services.static-my-homepage.loadbalancer.server.port=80"
      - "traefik.http.routers.static-my-homepage.tls.certresolver=letsencrypt"
      # 헬스체크용
      - "traefik.http.routers.static-my-homepage-health.rule=Host(`my-homepage.yourdomain.com`) && Path(`/health`)"
    networks:
      - brewnet-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  # Site: portfolio
  brewnet-static-portfolio:
    image: joseluisq/static-web-server:2
    container_name: brewnet-static-portfolio
    # ... (동일 패턴)

networks:
  brewnet-network:
    external: true
```

### 8.2 SPA 모드 OFF 시 차이점

```yaml
# SPA: false → FALLBACK_PAGE 환경변수 제거
environment:
  - SERVER_PORT=80
  - SERVER_ROOT=/public
  # SERVER_FALLBACK_PAGE 없음
  - SERVER_COMPRESSION=true
```

### 8.3 CORS ON 시

```yaml
environment:
  - SERVER_CORS_ALLOW_ORIGINS=*
  - SERVER_CORS_ALLOW_HEADERS=*
```

---

## 9. Traefik 라우팅 통합

### 9.1 로컬 + 외부 이중 라우터

```yaml
labels:
  # 로컬 접근 (brewnet.local)
  - "traefik.http.routers.static-my-homepage-local.rule=Host(`my-homepage.brewnet.local`)"
  - "traefik.http.routers.static-my-homepage-local.entrypoints=web"
  - "traefik.http.services.static-my-homepage.loadbalancer.server.port=80"

  # 외부 접근 (Cloudflare Tunnel 연동 후 자동 추가)
  - "traefik.http.routers.static-my-homepage-ext.rule=Host(`my-homepage.yourdomain.com`)"
  - "traefik.http.routers.static-my-homepage-ext.entrypoints=web,websecure"
  - "traefik.http.routers.static-my-homepage-ext.tls.certresolver=letsencrypt"
```

### 9.2 Cloudflare Tunnel 자동 연동

도메인 Step에서 서브도메인 선택 시 기존 `BREWNET_DOMAIN_EXTERNAL_ACCESS.md` 의 Cloudflare API 자동화 로직을 재사용:

```
1. cloudflared tunnel ingress rule 추가
   → my-homepage.yourdomain.com → http://traefik:80

2. Cloudflare DNS CNAME 자동 생성
   → my-homepage.yourdomain.com → {tunnel-id}.cfargotunnel.com

3. Traefik Docker label 추가
   → docker-compose.static.yml 업데이트 후 reload
```

---

## 10. 오픈 구현 이슈

| # | 이슈 | 우선순위 | 비고 |
|---|------|----------|------|
| S-01 | subPath + git clone 저장소 분리 경로 규칙 확정 | High | `.git-repo/` 디렉토리 패턴 검토 |
| S-02 | 다수 사이트 동시 배포 시 rsync 경합 처리 | Medium | 배포 큐 구현 필요 |
| S-03 | 파일 직접 업로드 용량 제한 정책 | Medium | 기본 100MB / 사이트로 설정 예정 |
| S-04 | SWS 버전 업데이트 자동화 | Low | `brewnet update` 커맨드 통합 |
| S-05 | Gitea 저장소 삭제 시 사이트 연동 해제 동기화 | Medium | Gitea delete webhook 이벤트 처리 |
| S-06 | 사이트별 bandwidth 모니터링 (Traefik 메트릭 연동) | Low | Monitor 탭 통합 후순위 |
| S-07 | 동일 도메인 여러 사이트 경로 분기 지원 (`/blog`, `/docs`) | Low | 현재 스펙은 서브도메인 단위만 지원 |

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| 1.0.0 | 2026-03-18 | 최초 작성 |
