# Brewnet Marketplace — 전체 아키텍처

> **문서 목적**: `brewnet add` 기반 서비스 마켓플레이스 전체 시스템 설계  
> **범위**: 웹 마켓플레이스 → CLI → 홈서버 배포 → 도메인 접근 전 구간  
> **작성일**: 2026-03-18  
> **사이트**: brewnet.dev | **라이선스**: Business Source License 1.1

---

## 목차

1. [전체 개념도](#1-전체-개념도)
2. [구성 요소 개요](#2-구성-요소-개요)
3. [서비스 패키지 포맷](#3-서비스-패키지-포맷)
4. [레지스트리 서버 설계](#4-레지스트리-서버-설계)
5. [CLI brewnet add 설계](#5-cli-brewnet-add-설계)
6. [웹 마켓플레이스 설계](#6-웹-마켓플레이스-설계)
7. [Pro Dashboard 마켓플레이스 탭](#7-pro-dashboard-마켓플레이스-탭)
8. [배포 파이프라인 전체 플로우](#8-배포-파이프라인-전체-플로우)
9. [서비스 카테고리 및 초기 패키지 목록](#9-서비스-카테고리-및-초기-패키지-목록)
10. [커뮤니티 패키지 기여 플로우](#10-커뮤니티-패키지-기여-플로우)
11. [보안 모델](#11-보안-모델)
12. [로드맵](#12-로드맵)

---

## 1. 전체 개념도

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BREWNET ECOSYSTEM                                 │
└─────────────────────────────────────────────────────────────────────┘

  ① 탐색                    ② 설치 명령               ③ 실행
  ──────────────────────    ─────────────────────    ──────────────────

  brewnet.dev               사용자 홈서버              인터넷
  /marketplace              ─────────────────          ──────────────
  ┌─────────────┐           ┌───────────────┐          브라우저
  │  Web        │   copy    │  Brewnet CLI  │          │
  │  Marketplace│ ────────▶ │               │          │ https://
  │             │  명령어    │  brewnet add  │          │ ghost.
  │ - 카탈로그   │           │    ghost      │          │ yourdomain
  │ - 문서       │           └──────┬────────┘          │ .com
  │ - 리뷰       │                  │                   ▼
  │ - 버전       │           ┌──────▼────────┐    ┌────────────┐
  └─────────────┘           │   Registry    │    │ Cloudflare │
                            │   API         │    │  Tunnel    │
  brewnet.dev               │ registry.     │    └─────┬──────┘
  /dashboard (Pro)          │ brewnet.dev   │          │
  ┌─────────────┐           └──────┬────────┘          │
  │  Dashboard  │                  │ 패키지 다운로드     ▼
  │  Marketplace│           ┌──────▼────────┐    ┌────────────┐
  │  탭         │           │  ~/.brewnet/  │    │  Traefik   │
  │             │           │  packages/    │    │  (라우팅)   │
  │ (설치 버튼  │           │  ghost/       │    └─────┬──────┘
  │  클릭만으로)│           └──────┬────────┘          │
  └─────────────┘                  │ docker compose     ▼
                                   │ up                 앱
                            ┌──────▼────────┐    (Ghost, Gitea,
                            │  컨테이너     │     SWS, Bludit...)
                            │  실행 중      │
                            └───────────────┘
```

---

## 2. 구성 요소 개요

| 구성 요소 | 위치 | 역할 |
|----------|------|------|
| **Web Marketplace** | brewnet.dev/marketplace | 서비스 탐색·문서·리뷰 |
| **Registry API** | registry.brewnet.dev | 패키지 메타데이터 + 다운로드 |
| **Package Store** | GitHub: brewnet-org/registry | 실제 패키지 파일 저장소 |
| **Brewnet CLI** | 사용자 홈서버 | add/remove/update 실행 |
| **brewnet-agent** | 홈서버 내부 컨테이너 | Dashboard API, Webhook 수신 |
| **Pro Dashboard** | 홈서버 내부 | Marketplace 탭 (GUI 설치) |

---

## 3. 서비스 패키지 포맷

모든 패키지는 **표준 디렉토리 구조**를 따릅니다.

### 3.1 패키지 디렉토리 구조

```
packages/
└── ghost/
    ├── brewnet.json          ← 패키지 매니페스트 (필수)
    ├── docker-compose.yml    ← 서비스 정의 템플릿 (필수)
    ├── .env.example          ← 환경변수 예시 (필수)
    ├── README.md             ← 설치/사용 가이드 (필수)
    ├── setup.sh              ← 설치 후 훅 (선택)
    ├── uninstall.sh          ← 제거 훅 (선택)
    └── assets/
        └── icon.png          ← 마켓플레이스 아이콘 (권장)
```

### 3.2 brewnet.json 스키마

```json
{
  "name": "ghost",
  "displayName": "Ghost",
  "version": "5.87.0",
  "description": "현대적인 퍼블리싱 플랫폼. 블로그·뉴스레터·멤버십 통합 관리",
  "category": "cms",
  "tags": ["blog", "cms", "newsletter", "publishing"],
  "license": "MIT",
  "homepage": "https://ghost.org",
  "icon": "assets/icon.png",
  "screenshot": "assets/screenshot.png",

  "author": {
    "name": "Brewnet Team",
    "type": "official"
  },

  "requirements": {
    "memory": "1GB",
    "disk": "2GB",
    "ports": [],
    "dependencies": ["mysql"]
  },

  "env": [
    {
      "key": "GHOST_URL",
      "label": "사이트 URL",
      "description": "Ghost가 서빙될 전체 URL",
      "required": true,
      "type": "url",
      "placeholder": "https://blog.yourdomain.com",
      "auto": "domain"
    },
    {
      "key": "GHOST_DB_PASSWORD",
      "label": "DB 패스워드",
      "required": true,
      "type": "password",
      "auto": "generate"
    },
    {
      "key": "GHOST_MAIL_FROM",
      "label": "발신 이메일",
      "required": false,
      "type": "email"
    }
  ],

  "domain": {
    "required": true,
    "subdomain": "blog",
    "description": "Ghost 블로그에 접근할 도메인"
  },

  "traefik": {
    "port": 2368,
    "healthCheck": "/ghost/api/admin/site/"
  },

  "postInstall": {
    "message": "Ghost가 설치되었습니다. 초기 설정을 위해 {domain}/ghost 에 접속하세요.",
    "links": [
      { "label": "Ghost 관리자", "url": "{domain}/ghost" },
      { "label": "블로그 보기",  "url": "{domain}" }
    ]
  },

  "brewnet": {
    "minCLIVersion": "0.5.0",
    "tier": "free",
    "verified": true
  }
}
```

### 3.3 docker-compose.yml 템플릿 규칙

```yaml
# packages/ghost/docker-compose.yml
# {{ }} 는 CLI가 env 값으로 치환하는 템플릿 변수

services:
  ghost:
    image: ghost:5-alpine
    container_name: brewnet-ghost
    restart: unless-stopped
    environment:
      url: "{{ GHOST_URL }}"
      database__client: mysql
      database__connection__host: brewnet-mysql
      database__connection__user: root
      database__connection__password: "{{ GHOST_DB_PASSWORD }}"
      database__connection__database: ghost
    volumes:
      - "${BREWNET_DATA}/ghost/content:/var/lib/ghost/content"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.ghost.rule=Host(`{{ GHOST_DOMAIN }}`)"
      - "traefik.http.routers.ghost.entrypoints=web,websecure"
      - "traefik.http.routers.ghost.tls.certresolver=letsencrypt"
      - "traefik.http.services.ghost.loadbalancer.server.port=2368"
      # Brewnet 메타태그 (Dashboard에서 파악용)
      - "brewnet.service=ghost"
      - "brewnet.version={{ GHOST_VERSION }}"
      - "brewnet.category=cms"
    networks:
      - brewnet-network

networks:
  brewnet-network:
    external: true
```

---

## 4. 레지스트리 서버 설계

### 4.1 Registry API 엔드포인트

```
Base URL: https://registry.brewnet.dev/v1

GET  /packages                    # 전체 패키지 목록 (페이지네이션)
GET  /packages?category=cms       # 카테고리 필터
GET  /packages?q=blog             # 검색
GET  /packages/{name}             # 단일 패키지 메타데이터
GET  /packages/{name}/versions    # 버전 목록
GET  /packages/{name}/download    # 최신 버전 패키지 다운로드 (tar.gz)
GET  /packages/{name}/{version}/download  # 특정 버전 다운로드
GET  /categories                  # 카테고리 목록
GET  /featured                    # 추천 패키지
GET  /stats                       # 설치 통계
POST /packages/{name}/install     # 설치 이벤트 기록 (익명)
```

### 4.2 패키지 목록 응답 예시

```json
{
  "total": 42,
  "packages": [
    {
      "name": "ghost",
      "displayName": "Ghost",
      "version": "5.87.0",
      "description": "현대적인 퍼블리싱 플랫폼",
      "category": "cms",
      "tags": ["blog", "cms"],
      "icon": "https://registry.brewnet.dev/assets/ghost/icon.png",
      "installs": 1284,
      "verified": true,
      "tier": "free",
      "requirements": { "memory": "1GB" }
    }
  ]
}
```

### 4.3 Registry 운영 방식

```
GitHub repo (brewnet-org/registry)
├── packages/          ← 패키지 파일 실제 저장
│   ├── ghost/
│   ├── gitea/
│   ├── bludit/
│   └── ...
├── index.json         ← 자동 생성 패키지 인덱스
└── .github/workflows/
    └── publish.yml    ← PR merge 시 index.json 자동 재생성

                 ↕ CDN
registry.brewnet.dev   ← Cloudflare Workers로 서빙 (초경량)
```

**Registry는 별도 서버 없이 GitHub + Cloudflare Workers 조합으로 운영.**  
→ 운영 비용 = $0, 다운타임 없음, 전 세계 CDN 자동 적용

---

## 5. CLI `brewnet add` 설계

### 5.1 명령어 전체 구조

```bash
# 기본 설치
brewnet add ghost

# 옵션 지정 설치
brewnet add ghost --domain blog.yourdomain.com

# 특정 버전
brewnet add ghost@5.80.0

# 여러 서비스 동시 설치
brewnet add ghost bludit static-web-server

# 설치된 서비스 목록
brewnet list

# 서비스 제거
brewnet remove ghost

# 서비스 업데이트
brewnet update ghost
brewnet update --all

# 마켓플레이스 검색 (터미널에서)
brewnet search blog
brewnet info ghost
```

### 5.2 `brewnet add` 내부 실행 흐름

```
사용자: brewnet add ghost
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 1: 레지스트리에서 패키지 메타 조회              │
│  GET registry.brewnet.dev/v1/packages/ghost          │
│  → 요구사항 확인 (memory, dependencies)              │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 2: 의존성 확인                                  │
│  ghost → mysql 필요                                  │
│  ? MySQL이 이미 설치되어 있습니다.                    │
│    공유 사용 하시겠습니까? [Y/n]                      │
│                                                     │
│  또는 신규 설치: MySQL도 함께 설치합니다.             │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 3: 환경변수 인터랙티브 수집                     │
│                                                     │
│  ? 블로그 도메인 [blog.yourdomain.com]:              │
│  ? DB 패스워드 [자동생성]:                           │
│  ? 발신 이메일 (선택):                               │
│                                                     │
│  auto 타입은 자동 생성 후 .env에 저장                 │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 4: 패키지 다운로드                              │
│  ~/.brewnet/packages/ghost/ 에 저장                  │
│  docker-compose.yml 템플릿 변수 치환                  │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 5: ~/.brewnet/docker-compose.yml 에 병합       │
│  (또는 ~/.brewnet/services/ghost/docker-compose.yml) │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 6: 볼륨 디렉토리 생성                           │
│  ~/.brewnet/data/ghost/                             │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 7: setup.sh 실행 (있는 경우)                    │
│  예: 초기 DB 스키마, 관리자 계정 생성                  │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 8: docker compose up -d                        │
│  + Traefik 라우팅 자동 적용 (label 기반)              │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 9: Cloudflare Tunnel ingress 등록 (도메인 있을 때)│
│  CNAME 자동 생성                                      │
└─────────────────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Step 10: 헬스체크 대기 (최대 60초)                   │
│  → 완료 메시지 출력                                   │
│                                                     │
│  ✅ Ghost 설치 완료!                                 │
│  ─────────────────────────────────────────          │
│  🌐 블로그:   https://blog.yourdomain.com            │
│  ⚙️  관리자:  https://blog.yourdomain.com/ghost      │
│  📁 데이터:   ~/.brewnet/data/ghost/                 │
└─────────────────────────────────────────────────────┘
```

### 5.3 패키지 상태 관리 파일

```json
// ~/.brewnet/installed.json
{
  "ghost": {
    "version": "5.87.0",
    "installedAt": "2026-03-18T14:00:00Z",
    "domain": "blog.yourdomain.com",
    "status": "running",
    "dataPath": "~/.brewnet/data/ghost",
    "composePath": "~/.brewnet/services/ghost/docker-compose.yml"
  },
  "gitea": { ... },
  "bludit": { ... }
}
```

---

## 6. 웹 마켓플레이스 설계

### 6.1 URL 구조

```
brewnet.dev/marketplace              ← 마켓플레이스 홈
brewnet.dev/marketplace/ghost        ← 패키지 상세 페이지
brewnet.dev/marketplace/category/cms ← 카테고리 뷰
brewnet.dev/marketplace/submit       ← 커뮤니티 패키지 제출
```

### 6.2 마켓플레이스 홈 레이아웃

```
┌─────────────────────────────────────────────────────────────────────┐
│  🍺 Brewnet  [Docs]  [Marketplace ●]  [GitHub]  [Get Started]       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Brewnet Marketplace                                                │
│  홈서버에 설치할 수 있는 오픈소스 서비스 모음                          │
│                                                                     │
│  [🔍 서비스 검색...                              ]                  │
│                                                                     │
│  [전체] [CMS·블로그] [파일·저장소] [미디어] [개발도구] [모니터링] [보안]│
│                                                                     │
├───────────────────── ✨ 추천 서비스 ────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 👻 Ghost │  │ 📁 SWS   │  │ 🦊 Gitea │  │ 📷 Immich│           │
│  │ CMS·블로그│  │ 정적호스팅│  │ Git서버  │  │ 사진백업 │           │
│  │ MIT      │  │ MIT      │  │ MIT      │  │ AGPL     │           │
│  │ ⭐ 4.8   │  │ ⭐ 4.9   │  │ ⭐ 4.7   │  │ ⭐ 4.6   │           │
│  │ 1.2k설치 │  │ 3.1k설치 │  │ 4.5k설치 │  │ 2.8k설치 │           │
│  │          │  │          │  │          │  │          │           │
│  │brewnet   │  │brewnet   │  │brewnet   │  │brewnet   │           │
│  │add ghost │  │add sws   │  │add gitea │  │add immich│           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                     │
├─────────────────── 전체 서비스 (42개) ──────────────────────────────┤
│                                                                     │
│  [필터: ✅ Official  □ Community]  [정렬: 인기순 ▼]                 │
│                                                                     │
│  ... 카드 그리드 ...                                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 패키지 상세 페이지

```
brewnet.dev/marketplace/ghost

┌─────────────────────────────────────────────────────────────────────┐
│  ◀ Marketplace                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  👻  Ghost                              ✅ Official  MIT            │
│  현대적인 퍼블리싱 플랫폼                                              │
│  v5.87.0 · CMS·블로그                                               │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  $ brewnet add ghost                            [📋 복사]     │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  [README]  [설치 가이드]  [변경 이력]  [소스코드 ↗]                  │
│  ─────────────────────────────────────────────────────────────────  │
│  ## 개요                                                            │
│  Ghost는 블로그, 뉴스레터, 멤버십을 통합 관리하는 오픈소스 CMS입니다. │
│  ...                                                               │
│                                                                     │
│  ## 요구사항                                                         │
│  - 메모리: 1GB 이상                                                  │
│  - 의존성: MySQL 8 (자동 설치됨)                                     │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  설치 통계                                                           │
│  1,284 설치 · 평점 4.8 · 마지막 업데이트: 2026-03-10               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Pro Dashboard 마켓플레이스 탭

```
┌─────────────────┐
│  🍺 Brewnet     │
├─────────────────┤
│  Dashboard      │
│  Apps           │
│  Static Sites   │
│  Marketplace  ← │  ← 신규 추가
│  Git Server     │
│  Routing        │
│  Domains        │
│  Monitor        │
│  Settings       │
└─────────────────┘
```

### 7.1 Dashboard 마켓플레이스 화면

```
┌────────────────────────────────────────────────────────────────────┐
│  Marketplace                              [🔍 검색]  [+ 직접 추가] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  설치됨 (3)  │  탐색  │  업데이트 있음 (1)                          │
│  ─────────────────────────────────────────────────────────────    │
│                                                                    │
│  ← 설치됨 탭 ────────────────────────────────────────────────────  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  👻 Ghost                           🟢 running           │    │
│  │  v5.87.0 · CMS·블로그                                     │    │
│  │  https://blog.yourdomain.com                             │    │
│  │                              [열기 ↗]  [⚙]  [🗑 제거]   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  🦊 Gitea                           🟢 running           │    │
│  │  v1.23.0 · Git서버                                        │    │
│  │  https://git.yourdomain.com                              │    │
│  │                              [열기 ↗]  [⚙]  [🗑 제거]   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ← 탐색 탭 ──────────────────────────────────────────────────────  │
│                                                                    │
│  [전체] [CMS] [파일] [미디어] [개발도구] [모니터링]                  │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ 📷 Immich│  │ 🎵 Navi  │  │ 📊 Grafana│  │ 🔐 Vault  │        │
│  │ 사진백업  │  │ 음악스트림│  │ 모니터링  │  │ 시크릿관리│        │
│  │ AGPL     │  │ GPL-3    │  │ AGPL     │  │ BSL      │        │
│  │          │  │          │  │          │  │          │        │
│  │[+ 설치]  │  │[+ 설치]  │  │[+ 설치]  │  │[+ 설치]  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 7.2 Dashboard에서 설치 클릭 시 모달

```
┌───────────────────────────────────────────────────┐
│  📷 Immich 설치                                   │
├───────────────────────────────────────────────────┤
│                                                   │
│  v1.99.0 · 사진·영상 백업 관리                    │
│  AGPL-3.0 · 메모리 2GB 이상 권장                  │
│                                                   │
│  ── 설정 ──────────────────────────────────────   │
│                                                   │
│  도메인 *                                          │
│  [photos.yourdomain.com              ]            │
│                                                   │
│  DB 패스워드                                       │
│  [●●●●●●●● 자동생성됨         ] [🔄]             │
│                                                   │
│  업로드 저장 경로                                  │
│  [~/.brewnet/data/immich/upload  ]               │
│                                                   │
│  ── 의존성 ─────────────────────────────────────  │
│  ✅ PostgreSQL — 이미 설치됨 (공유 사용)            │
│  ✅ Redis      — 이미 설치됨 (공유 사용)            │
│                                                   │
│           [취소]  [▶ 설치 시작]                    │
└───────────────────────────────────────────────────┘
```

### 7.3 설치 진행 모달

```
┌───────────────────────────────────────────────────┐
│  📷 Immich 설치 중...                             │
├───────────────────────────────────────────────────┤
│                                                   │
│  ████████████████████████░░░░░░  78%              │
│                                                   │
│  ✅ 패키지 다운로드                                │
│  ✅ 환경변수 설정                                  │
│  ✅ 볼륨 디렉토리 생성                             │
│  ▶  컨테이너 시작 중...                            │
│  ○  Traefik 라우팅 등록                            │
│  ○  Cloudflare Tunnel 연결                        │
│  ○  헬스체크                                      │
│                                                   │
│  [████ 로그 보기 ▼]                               │
│  docker pull ghcr.io/immich-app/immich-server...  │
│  Pulling from ghcr.io/immich-app...               │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 8. 배포 파이프라인 전체 플로우

```
사용자 인터페이스
┌────────────┐   ┌────────────┐
│ 웹          │   │ Dashboard  │
│ Marketplace│   │ (Pro)      │
│            │   │            │
│ 명령어 복사  │   │ 설치 버튼  │
└──────┬─────┘   └──────┬─────┘
       │                │
       ▼                ▼
┌────────────────────────────────────────────────────┐
│  Brewnet CLI / brewnet-agent                       │
│                                                    │
│  1. registry.brewnet.dev 에서 패키지 메타 조회       │
│  2. 의존성 확인 및 자동 해결                         │
│  3. 환경변수 수집 (CLI: 인터랙티브 / Dashboard: 폼) │
│  4. 패키지 다운로드 + 템플릿 변수 치환              │
│  5. docker-compose up -d                           │
│  6. Traefik 라우팅 자동 적용 (Docker label)         │
│  7. Cloudflare Tunnel ingress 추가 (CF API)        │
│  8. DNS CNAME 자동 생성                             │
│  9. 헬스체크 대기                                   │
│  10. installed.json 기록                           │
│  11. 완료 알림 (CLI 출력 / Dashboard WebSocket)     │
└────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────┐
│  런타임                                              │
│                                                    │
│  Docker 컨테이너    Traefik         Cloudflare       │
│  (ghost:5-alpine)  (라우팅)        (Tunnel+CDN)     │
│                                                    │
│  ~/.brewnet/data/  brewnet-network  yourdomain.com  │
│  ghost/            내부 통신        서브도메인        │
└────────────────────────────────────────────────────┘
```

---

## 9. 서비스 카테고리 및 초기 패키지 목록

### Phase 1 — Official 패키지 (런칭 시)

| 카테고리 | 서비스 | 명령어 | 라이선스 |
|----------|--------|--------|---------|
| **Git 서버** | Gitea | `brewnet add gitea` | MIT |
| **CMS·블로그** | Ghost | `brewnet add ghost` | MIT |
| **CMS·블로그** | Bludit | `brewnet add bludit` | MIT |
| **정적 호스팅** | Static-Web-Server | `brewnet add sws` | MIT |
| **파일 서버** | FileBrowser | `brewnet add filebrowser` | Apache-2.0 |
| **사진 백업** | Immich | `brewnet add immich` | AGPL-3.0 |
| **음악 스트리밍** | Navidrome | `brewnet add navidrome` | GPL-3.0 |
| **영상 스트리밍** | Jellyfin | `brewnet add jellyfin` | GPL-2.0 |
| **모니터링** | Uptime Kuma | `brewnet add uptime-kuma` | MIT |
| **모니터링** | Grafana + Prometheus | `brewnet add monitoring` | AGPL-3.0 |
| **비밀번호 관리** | Vaultwarden | `brewnet add vaultwarden` | GPL-3.0 |
| **메모·노트** | Memos | `brewnet add memos` | MIT |
| **링크 단축** | Shlink | `brewnet add shlink` | MIT |

### Phase 2 — 확장 패키지

| 카테고리 | 서비스 | 명령어 |
|----------|--------|--------|
| **클라우드 스토리지** | Nextcloud | `brewnet add nextcloud` |
| **북마크** | Linkding | `brewnet add linkding` |
| **RSS 리더** | FreshRSS | `brewnet add freshrss` |
| **홈 대시보드** | Homepage | `brewnet add homepage` |
| **토렌트** | qBittorrent | `brewnet add qbittorrent` |
| **레시피** | Mealie | `brewnet add mealie` |

---

## 10. 커뮤니티 패키지 기여 플로우

```
커뮤니티 개발자
      │
      │  1. GitHub Fork
      │     brewnet-org/registry
      │
      │  2. packages/{service}/ 디렉토리 생성
      │     brewnet.json + docker-compose.yml + README.md
      │
      │  3. PR 제출
      │
      ▼
Brewnet 팀 리뷰
  ├─ brewnet.json 스키마 자동 검증 (GitHub Action)
  ├─ docker-compose.yml 보안 검토 (privileged, host network 여부)
  ├─ 라이선스 확인
  └─ 수동 테스트 (설치 → 실행 → 제거)
      │
      ▼
Merge → index.json 자동 재생성 → 마켓플레이스 즉시 반영
```

### 10.1 패키지 배지 체계

| 배지 | 의미 |
|------|------|
| ✅ Official | Brewnet 팀이 직접 관리 |
| 🏅 Verified | 커뮤니티 제출, Brewnet 팀 검증 완료 |
| 🌱 Community | 커뮤니티 제출, 기본 검증만 |

---

## 11. 보안 모델

### 11.1 패키지 서명 (v2 예정)

```
패키지 배포 시:
1. Brewnet 팀이 tar.gz에 GPG 서명
2. CLI가 설치 전 서명 검증

brewnet add ghost
→ 패키지 다운로드
→ GPG 서명 검증 (brewnet-signing-key.pub)
→ 검증 실패 시 설치 거부
```

### 11.2 Docker Compose 제한 규칙

레지스트리 수락 조건:
```
❌ privileged: true       → 거부
❌ network_mode: host     → 거부 (예외: VPN 서비스)
❌ volumes: /:/host       → 거부
❌ cap_add: SYS_ADMIN     → 검토 필요
✅ brewnet-network 사용   → 필수
✅ 헬스체크 정의           → 권장
```

### 11.3 환경변수 보안

```
민감 정보 취급:
- auto: "generate" → CLI가 랜덤 생성, ~/.brewnet/.env.{service} 에 저장
- 평문 docker-compose.yml에 시크릿 직접 포함 금지
- ${BREWNET_SECRET_xxx} 패턴으로 참조
```

---

## 12. 로드맵

### Phase 1 — 마켓플레이스 기반 (v0.5)
```
✅ Registry API 설계 + GitHub repo 구조
✅ brewnet.json 스키마 확정
✅ 패키지 템플릿 엔진 구현 ({{ }} 치환)
✅ brewnet add / remove / list / update 명령어
✅ 초기 Official 패키지 13개
✅ brewnet.dev/marketplace 웹 페이지
```

### Phase 2 — Dashboard 통합 (v0.6)
```
○ Pro Dashboard Marketplace 탭
○ 설치 진행 실시간 모달 (WebSocket)
○ 설치된 서비스 상태 카드
○ 원클릭 업데이트
```

### Phase 3 — 커뮤니티 생태계 (v0.8)
```
○ 커뮤니티 패키지 PR 플로우 + GitHub Action 자동 검증
○ 패키지 평점·리뷰 시스템
○ 설치 통계 대시보드 (익명)
○ GPG 패키지 서명
```

### Phase 4 — 수익화 연계 (v1.0)
```
○ Pro 전용 패키지 (Brewnet 공식 엔터프라이즈 서비스)
○ 기업용 사설 레지스트리 지원
○ 패키지 번들 (예: "블로그 스타터팩" = Ghost + SWS + 모니터링)
```

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| 1.0.0 | 2026-03-18 | 최초 작성 |
