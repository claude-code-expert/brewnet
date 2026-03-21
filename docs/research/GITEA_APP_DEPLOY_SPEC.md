# Brewnet — App Deploy 화면 기능 명세서

> **파일명**: `brewnet-app-deploy.html`  
> **버전**: v1.0  
> **작성일**: 2025  
> **페이지 진입**: Home Admin 우측 상단 `App Deploy` 버튼 클릭  
> **연락처**: brewnet.dev@gmail.com  
> **라이선스**: Business Source License 1.1

---

## 목차

1. [페이지 개요](#1-페이지-개요)
2. [화면 구조](#2-화면-구조)
3. [New App 모달](#3-new-app-모달)
4. [배포 앱 목록](#4-배포-앱-목록)
5. [Build / Deploy 동작](#5-build--deploy-동작)
6. [도메인 연결 모달](#6-도메인-연결-모달)
7. [앱 삭제](#7-앱-삭제)
8. [Gitea Repository 목록](#8-gitea-repository-목록)
9. [상태 정의](#9-상태-정의)
10. [데이터 구조](#10-데이터-구조)
11. [미결 사항 및 향후 작업](#11-미결-사항-및-향후-작업)

---
# 아래 사항 구현중 막히거나 의사 결정이 필요한 경우 사용자에게 에스컬레이션 제안 필수 (임의로 판단하고 구현하지 말것)
- 꼭 문서와 첨부 소스를 읽어본 뒤 파악 후 개발 시작

## 1. 페이지 개요

**App Deploy** 페이지는 Brewnet 홈 어드민의 핵심 배포 관리 화면입니다.

| 항목 | 내용 |
|------|------|
| 목적 | Gitea 레포지토리 기반 앱 빌드·배포·도메인 연결 통합 관리 |
| 핵심 동작 | New App 생성 → Gitea 자동 연결 → Build → Deploy |
| Build 정의 | Docker 이미지 빌드(코드 컴파일)만 수행 |
| Deploy 정의 | Traefik 라우팅 등록을 포함한 전체 배포 실행 |
| 하단 | Gitea 전체 Repo 표시 (App Deploy 연결 여부 구분) |

---

## 2. 화면 구조

```
┌─────────────────────────────────────────────────────────────┐
│ TOPBAR   Home / App Deploy          [↻ Refresh] [+ New App] │
├─────────────────────────────────────────────────────────────┤
│ EBOX  App Deploy 설명 + 태그                                │
├─────────────────────────────────────────────────────────────┤
│ STATS   TOTAL APPS | RUNNING | STOPPED | BUILDING           │
├─────────────────────────────────────────────────────────────┤
│ 🚀 배포 앱 [N]                    [전체 상태 ▼]             │
│ ┌─── APP CARD ────────────────────────────────────────────┐ │
│ │ [IC] my-blog  ● RUNNING  Go · Gin                      │ │
│ │      :8080 · git.local/admin/my-blog · 14 commits      │ │
│ │      🌐 blog.example.com ↗                              │ │
│ │ [Build] [Deploy] [■ Stop]         [🌐 도메인] [🗑 삭제] │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ...                                                          │
├─────────────────────────────────────────────────────────────┤
│ 📦 Gitea Repositories [6]        [Git Server에서 관리 →]    │
│ ┌─── REPO TABLE ──────────────────────────────────────────┐ │
│ │ name | 언어 | App Deploy 연결 | 접근 | 업데이트 | 액션  │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Topbar
- **Breadcrumb**: `Home / App Deploy`
- **↻ Refresh**: 앱 상태 및 레포 목록 새로고침
- **+ New App**: New App 생성 모달 오픈 (amber 강조 버튼)

### 2.2 ebox (설명 박스)
- 페이지 기능 안내 텍스트
- 태그: `Build = Docker 이미지 빌드`, `Deploy = Traefik 라우팅 포함 전체 배포`, `Cloudflare Tunnel 자동 연결`, `Gitea 전체 Repo 관리`

### 2.3 Stats Bar
| 지표 | 색상 | 설명 |
|------|------|------|
| TOTAL APPS | 기본 | 전체 등록 앱 수 |
| RUNNING | green | 실행 중인 앱 수 |
| STOPPED | red | 중지 상태 앱 수 |
| BUILDING | amber | 빌드 진행 중 앱 수 |

---

## 3. New App 모달

우측 상단 **+ New App** 클릭 시 오픈. 3개 탭으로 구성.

### 3.1 탭 1 — 보일러플레이트

**목적**: Brewnet 공식 보일러플레이트 템플릿을 선택해 Gitea 레포 생성 및 코드 푸시, 포트가 미리 점유된 경우 다른 포트로 자동 로드

**제공 템플릿 목록**:

| 언어 | 프레임워크 | 설명 | 기본 포트 |
|------|-----------|------|----------|
| Go | Gin | REST API + PostgreSQL | 8080 |
| Go | Echo | Web server + Redis | 8081 |
| Python | FastAPI | Async API + SQLAlchemy | 8000 |
| Python | Django | Full-stack + ORM | 8001 |
| Node.js | NestJS | TypeScript + Prisma | 3000 |
| Node.js | Express | Minimal REST API | 3001 |
| Rust | Actix-web | High-perf REST API | 8888 |
| Java | Spring Boot | Enterprise REST + JPA | 8080 |
| Kotlin | Ktor | Lightweight web server | 8082 |
| Kotlin | Spring Boot | Kotlin DSL + JPA | 8083 |
| React | Next.js | Full-stack App Router | 3000 |
| React | Vite + React | SPA + TypeScript | 5173 |

**입력 필드**:
- 앱 이름 (필수): 소문자·하이픈만 허용, Gitea repo 이름으로 사용
- 포트 (필수): 선택한 템플릿의 기본 포트 자동 입력

**동작 흐름**:
```
템플릿 선택 → 앱 이름 입력 → 포트 확인 → 앱 생성 및 Gitea 푸시
  └→ Gitea에 admin/<앱이름> 레포 자동 생성
  └→ 보일러플레이트 코드 푸시
  └→ 앱 목록에 'building' 상태로 추가
  
```

---

### 3.2 탭 2 — Git Clone

**목적**: 외부 Git URL(GitHub, GitLab 등)의 레포를 클론해 Gitea에 미러링

**입력 필드**:

| 필드 | 필수 | 설명 |
|------|------|------|
| Git URL | ✅ | https:// 또는 git@... 형식 |
| 앱 이름 | ✅ | URL에서 자동 추출, 수정 가능 |
| 포트 | ✅ | 앱 컨테이너 포트, 입력 후 중복 포트 점유일 경우 다른 포트로 자동 로드 |
| 브랜치 | - | 기본값: `main` |

**앱 이름 자동 추출**: Git URL 마지막 경로에서 추출  
예: `https://github.com/user/my-project.git` → `my-project`

**동작 흐름**:
```
URL 입력 → 이름 자동 추출 → 포트 입력 → 생성 버튼
  └→ git clone <URL> --branch <브랜치>
  └→ Gitea admin/<앱이름> 레포 생성
  └→ remote 변경 + git push
```

---

### 3.3 탭 3 — New Project

**목적**: 언어 + 프레임워크 선택으로 빈 Brewnet 프로젝트 스캐폴딩, 포트가 미리 점유된 경우 다른 포트로 자동 로드, 
- brew init에서 사용한 언어와 프레임워크를 기반으로 스캐폴딩 : 아래 언어 및 프레임워크 참조 
- 언어만 선택한 경우 언어의 기본 스캐폴딩을 생성하고, 프레임워크 까지 선택한 경우 공식 보일러 플레이트 클론 

**언어 및 프레임워크**:

| 언어 | 현재 지원 | 추가 필요 | 비고 |
| :--- | :--- | :--- | :--- |
| Go | Gin, Echo, Fiber | 
| Rust | Actix-web, Axum | 
| Java | Spring Boot, Spring Framework | 
| Python | FastAPI, Django, Flask | 
| Kotlin | Ktor, Spring Boot |
| Node.js | Express, NestJS, Next.js | 
| React | (현재 프론트엔드 범주 없음) | 


**입력 필드**: 앱 이름, 포트  
**실시간 프리뷰**: 입력 중 Gitea 레포 경로 및 포트 바인딩 미리보기 표시

**동작 흐름**:
```
언어 선택 → 프레임워크 선택 → 앱 이름/포트 입력 → 생성
  └→ brewnet-boilerplate/<lang>/<fw> 스캐폴딩
  └→ Gitea admin/<앱이름> 레포 생성 + 초기 커밋 푸시
  └→ Dockerfile + docker-compose.yml 자동 포함
```

---

### 3.4 공통 동작

- 앱 이름 입력 시 소문자·하이픈만 허용 (자동 정규화)
- 생성 완료 후 앱 목록에 `building` 상태로 즉시 추가
- Gitea 레포 목록 자동 갱신
- 약 2.5초 후 `stopped` 상태로 전환 (Gitea 푸시 완료 시 시뮬레이션)

---

## 4. 배포 앱 목록

### 4.1 앱 카드 구성

각 앱은 카드 형태로 표시되며 두 영역으로 구성:

**상단 정보 영역**:
```
[아이콘] 앱이름    [상태 뱃지]  [언어칩]  [프레임워크]
         포트 · Gitea 레포 경로 · 커밋 수 · 최근 액션
         🌐 도메인 링크 (연결 시 클릭 → 새 탭) / + 도메인 연결
```

**하단 액션 영역**:
```
[🔨 Build]  [🚀 Deploy]  [▶ Start / ■ Stop]      [🌐 도메인]  [🗑 삭제]
```

### 4.2 상태 필터

드롭다운으로 `전체 상태 / Running / Stopped / Building` 필터링

### 4.3 도메인 링크

- 도메인이 연결된 경우: `🌐 blog.example.com ↗` — 클릭 시 `target="_blank"` 새 탭 오픈
- 도메인 미연결 시: `+ 도메인 연결` 점선 버튼 — 클릭 시 도메인 모달 오픈

---

## 5. Build / Deploy 동작

### 5.1 Build (🔨)

**목적**: Docker 이미지 빌드만 수행. 컨테이너 미기동.

**실행 단계**:
| 단계 | 설명 |
|------|------|
| 1 | Git pull — 최신 커밋 가져오기 |
| 2 | Dockerfile 파싱 (멀티스테이지 감지) |
| 3 | Docker 이미지 빌드 (`<앱이름>:latest`) |
| 4 | 이미지 태그 및 로컬 레지스트리 등록 |

**상태 변화**: 없음 (이미지만 생성됨)

---

### 5.2 Deploy (🚀)

**목적**: 코드 빌드 + 컨테이너 기동 + Traefik 라우팅 등록 전체 수행

**실행 단계**:
| 단계 | 설명 |
|------|------|
| 1 | Git pull — 최신 커밋 가져오기 |
| 2 | Docker 이미지 빌드 |
| 3 | 기존 컨테이너 중지 (graceful shutdown) |
| 4 | 새 컨테이너 시작 (포트 바인딩) |
| 5 | Traefik 라우팅 등록 (`Host(도메인)` 규칙) |
| 6 | Health check (서비스 응답 확인) |

**상태 변화**: 완료 후 → `running`

---

### 5.3 Progress 모달

- 단계별 진행 상태 애니메이션 표시 (wait → active → done)
- 빌드 로그 실시간 출력 (스크롤 자동 이동)
- 완료 후 `닫기` 버튼 표시
- `building` 상태 앱은 Build/Deploy/Start 버튼 비활성화

---

## 6. 도메인 연결 모달

앱 카드의 **🌐 도메인** 버튼 또는 `+ 도메인 연결` 클릭 시 오픈.

모달 헤더에 대상 앱 이름 표시.

---

### 6.1 탭 1 — 새 Cloudflare 도메인 (자동 설정)

**대상**: 아직 도메인이 없거나 Cloudflare에서 새 도메인을 구성하는 경우

**입력 필드**:
| 필드 | 설명 |
|------|------|
| Cloudflare API Token | Zone:Edit + DNS:Edit 권한 필요 |
| 도메인 | 루트 도메인 (예: `example.com`) |
| 서브도메인 | 선택사항, 비워두면 루트 도메인 사용 |

**실시간 미리보기**: 서브도메인 입력 시 최종 URL 표시  
예: `myapp` + `example.com` → `myapp.example.com`

**자동 실행 단계**:
```
1. Cloudflare API 인증 확인 (Zone ID, Tunnel ID 조회)
2. Tunnel Ingress Rule 추가: hostname → localhost:PORT
3. DNS CNAME 레코드 생성: <sub> → <tunnel-id>.cfargotunnel.com
4. Traefik 라우팅 규칙 업데이트: Host 기반 레이블 적용
```

> ⚠ **주의**: Cloudflare SDK는 ingress rule 설정 시 DNS 레코드를 자동 생성하지 않음.  
> 별도의 DNS API 호출이 반드시 필요함. (Brewnet 구현 시 주의)
> 연결을 위한 추가 메뉴얼 설명 레이어나 ? 와 같은 도움말로 툴팁 (How to connect domain) 제공

---

### 6.2 탭 2 — 기존 도메인 연결 (수동 가이드)

**대상**: 이미 Cloudflare/GoDaddy/가비아 등에 도메인이 등록된 경우

**입력 필드**: 연결할 서브도메인 전체 입력 (예: `blog.yourdomain.com`)

**제공 DNS 설정 가이드**:

| 항목 | 값 |
|------|-----|
| Type | CNAME |
| Name | 입력한 서브도메인 prefix |
| Target | `<tunnel-id>.cfargotunnel.com` (자동 표시 + 복사 버튼) |

**안내 사항**:
- Cloudflare 사용 시: Proxy 상태를 **🟠 Proxied**로 설정 권장
- 다른 등록기: DNS 전파 최대 48시간 소요 안내
- 연결을 위한 추가 메뉴얼 설명 레이어나 ? 와 같은 도움말로 툴팁 (How to connect domain) 제공

**연결 확인 버튼**: DNS 레코드 설정 완료 후 서브도메인 재입력 → 확인

---

### 6.3 탭 3 — 서브도메인 추가

**대상**: 이미 루트 도메인이 Cloudflare Tunnel에 연결된 경우

**입력 필드**:
| 필드 | 설명 |
|------|------|
| 베이스 도메인 | 드롭다운 (이미 Tunnel 연결된 도메인 목록) |
| 서브도메인 프리픽스 | 입력 필드 (예: `myapp`) |

**실시간 미리보기**: `myapp` + `.example.com` → `myapp.example.com`

**자동 실행**: Tunnel ingress + Traefik Host 규칙 자동 업데이트

---

## 7. 앱 삭제

### 7.1 삭제 모달 동작

**열기**: 앱 카드의 **🗑 삭제** 버튼 클릭

**실행 중(running) 상태 경고**:
```
🔴 이 앱은 현재 실행 중입니다.
삭제하려면 먼저 Stop 버튼을 눌러 앱을 중지한 후 삭제하세요.
```
→ 삭제 확인 버튼 비활성화 (강제 불가)

**정지 상태 삭제 흐름**:
1. 삭제 경고 메시지 표시 (앱 이름 포함 하여 Gitea repo까지 삭제된다고 표시)
2. 앱 이름 직접 입력으로 삭제 의도 확인
3. 입력값이 앱 이름과 일치할 때만 삭제 버튼 활성화
4. 삭제 완료 시: 앱 목록에서 제거 + Gitea repo 연결 해제

> **Note**: 현재 프로토타입에서 Gitea 레포는 연결만 해제되며 실제 repo 삭제는 Git Server에서 별도 처리. 실제 구현 시 Gitea API 호출로 repo 삭제 포함 여부를 정책으로 결정 필요.

---

## 8. Gitea Repository 목록

### 8.1 표시 범위

- **Gitea 전체 레포** 표시 (App Deploy 생성 레포 + 일반 레포 모두)
- App Deploy 연결 여부를 뱃지로 구분
- 클릭시 Gitea 페이지로 이동

### 8.2 테이블 컬럼

| 컬럼 | 내용 |
|------|------|
| Repository | 이름 + private 뱃지 + 스타 수 |
| 언어 | 언어 칩 (색상 구분) |
| App Deploy | 연결된 앱 이름 뱃지 또는 `미연결` |
| 접근 | `git.local/admin/<name> ↗` 링크 |
| 최근 업데이트 | 상대 시간 |
| 액션 | 연결된 경우: `앱 보기` / 미연결: `+ 연결` |

### 8.3 연결 상태

| 상태 | 뱃지 | 색상 |
|------|------|------|
| App Deploy 연결 | `✔ <앱이름>` | green |
| 미연결 | `미연결` | grey |

### 8.4 Git Server 연결

하단 섹션 우측 **Git Server에서 관리 →** 버튼 클릭 시 Git Server 페이지로 이동

---

## 9. 상태 정의

### 9.1 앱 상태

| 상태 | 뱃지 | 색상 | 의미 |
|------|------|------|------|
| `running` | `● RUNNING` (점멸) | green | 컨테이너 실행 중 |
| `stopped` | `■ STOPPED` | red | 컨테이너 중지 |
| `building` | `⟳ BUILDING` (회전) | amber | 빌드/배포 진행 중 |

### 9.2 상태별 버튼 활성화

| 상태 | Build | Deploy | Start | Stop | 삭제 |
|------|-------|--------|-------|------|------|
| running | ✅ | ✅ | ❌ | ✅ | ⚠ (중지 후 삭제 요구) |
| stopped | ✅ | ✅ | ✅ | ❌ | ✅ (이름 확인 후) |
| building | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 10. 데이터 구조

### 10.1 App 객체

```typescript
interface App {
  id: number;
  name: string;          // Gitea repo 이름 = 앱 식별자
  lang: string;          // 'Go' | 'Python' | 'Node.js' | 'Rust' | 'Java' | 'Kotlin' | 'React'
  fw: string;            // 프레임워크명
  status: 'running' | 'stopped' | 'building';
  port: number;          // 컨테이너 내부 포트
  repo: string;          // 'admin/<name>' (Gitea 경로)
  domain: string | null; // 연결된 외부 도메인 (없으면 null)
  commits: number;       // 커밋 수
  lastAct: string;       // 마지막 액션 상대 시간
  image: string | null;  // Docker 이미지 태그
}
```

### 10.2 GiteaRepo 객체

```typescript
interface GiteaRepo {
  id: number;
  name: string;
  lang: string;
  private: boolean;
  stars: number;
  updated: string;       // 상대 시간
  appId: number | null;  // 연결된 App ID (없으면 null)
}
```

---

## 11. 미결 사항 및 향후 작업

### 구현 전 확인 필요

| 항목 | 내용 | 우선순위 |
|------|------|---------|
| Cloudflare API Token 범위 | Zone:Edit + DNS:Edit로 충분한지 확인 | 높음 |
| Tunnel ID 조회 방법 | cloudflared API 또는 설정 파일에서 자동 추출 | 높음 |
| 앱 삭제 시 Gitea repo 처리 | 연결 해제만? 또는 실제 repo 삭제? | 중간 |
| Build 로그 스트리밍 | WebSocket 또는 SSE 실시간 로그 전송 | 중간 |
| 포트 충돌 감지 | New App 생성 시 이미 사용 중인 포트 경고 | 중간 |
| 서브도메인 중복 확인 | 동일 도메인 중복 연결 방지 | 낮음 |

### 향후 추가 기능 (백로그)

- **Deploy Pipeline Monitor**: 빌드/배포 이력 + 롤백 기능
- **환경변수 관리**: 앱별 `.env` 편집 UI
- **Health Check 대시보드**: 앱별 응답 상태 실시간 모니터링
- **Git Webhook 자동 배포**: Gitea push → 자동 Build/Deploy 트리거
- **멀티 레플리카**: 동일 앱 다중 컨테이너 실행 지원

---

## 부록 — 디자인 시스템 참조

### 색상

| 변수 | 값 | 용도 |
|------|----|------|
| `--amber` | `#e8a849` | Primary 액션, 선택 상태 |
| `--teal` | `#3dd6c8` | 도메인 링크, 정보 표시 |
| `--green` | `#3de89a` | Running 상태, 성공 |
| `--red` | `#f04b5a` | Stopped 상태, 삭제, 오류 |
| `--bg0` | `#070d1a` | 최하단 배경 |
| `--bg2` | `#111e33` | 카드 배경 |

### 폰트

| 변수 | 폰트 | 용도 |
|------|------|------|
| `--mono` | JetBrains Mono | 코드, 레포 경로, 포트, 도메인 |
| `--sans` | Outfit | 본문 텍스트, 버튼 |

---

---

## Boilerplate vs New Project 모드 차이 — 발견일: 2026-03-17

### 증상
사용자가 Boilerplate 탭과 New Project 탭의 차이를 이해하지 못함. Boilerplate 탭에서 미설치 템플릿 선택 시 "not found" 에러로 앱 생성 실패.

### 근본 원인 (Root Cause)
두 모드는 완전히 다른 코드 경로를 탄다:

| 항목 | Mode A: Boilerplate | Mode C: New Project |
|------|---------------------|---------------------|
| 목적 | `brewnet init`에서 이미 설치된 보일러플레이트를 Gitea에 연결 | 스택 템플릿에서 새로 클론하여 독립 프로젝트 생성 |
| 소스 경로 | 기존 `projectPath/<stackId>` (이미 디스크에 존재) | 새로 `projectPath/apps/<appName>` 에 `cloneStack()` |
| 검증 | `readBoilerplateMeta()` — `.brewnet-boilerplate.json`에서 stackId 조회 | `resolveStackId()` — stacks 카탈로그에서 매칭 |
| 실패 조건 | `stackId`가 `.brewnet-boilerplate.json`에 없으면 실패 (`app-manager.ts:364`) | `resolveStackId()` 반환값이 null이면 실패 (`app-manager.ts:490`) |
| Docker | 기존 컨테이너 재빌드 (`docker compose up -d --build`) | 새 컨테이너 생성 |

핵심 파일:
- `app-manager.ts:353-423` — `_createModeA()` (보일러플레이트 연결)
- `app-manager.ts:477-536` — `_createModeC()` (새 프로젝트 생성)
- `app-manager.ts:236-243` — `readBoilerplateMeta()`
- `boilerplate-manager.ts` — `cloneStack()`, `generateEnv()`, `reinitGit()`

### UI 개선 방향
- Boilerplate 탭: "이미 설치된 보일러플레이트를 Gitea에 연결합니다" 안내
- New Project 탭: "스택 템플릿에서 새 프로젝트를 생성합니다" 안내
- Boilerplate 탭에서 미설치 템플릿은 비활성화 처리 필요

### 재발 방지 체크리스트
- [ ] Boilerplate 탭 진입 시 `/api/apps/boilerplates`로 설치 목록 조회
- [ ] 미설치 템플릿은 클릭 불가 처리 (disabled + "미설치" 표기)
- [ ] 안내 문구에 모드 차이 명시

---

## 앱 생성 Progress 모달 단계 순서 불일치 — 발견일: 2026-03-17

### 증상
앱 생성 시 Progress 모달에서 Step 1(Validating)이 "wait" 상태인데 Step 2(Gitea setup)가 "done"으로 표시됨. 이후 진행이 멈추고 에러 메시지 없음.

### 근본 원인 (Root Cause)
`_runCreateApp()` (`app-manager.ts:319-351`)이 Step 1(Gitea setup, index=1)을 먼저 실행한 뒤, Mode 함수에서 Step 0(Validating, index=0)을 뒤늦게 실행.

```typescript
// app-manager.ts:310 — Job 생성
const job = newJob(opts.appName, ['Validating', 'Gitea setup', 'Gitea repo', 'Git push', 'Docker up', 'Health check']);

// app-manager.ts:330-333 — Step 1(Gitea setup)을 먼저 실행
setStep(job, 1, 'running');
const giteaPrep = await gitea.prepare();
setStep(job, 1, 'done', giteaPrep.message);

// app-manager.ts:360-366 — _createModeA()에서 Step 0(Validating)을 나중에 실행
setStep(job, 0, 'running');
const metas = readBoilerplateMeta(ctx.projectPath);
```

UI는 배열 순서(0→1→2→3→4→5)로 표시하므로 비정상 상태 발생.

### 수정 내용
| 파일 | 변경 내용 |
|------|----------|
| `app-manager.ts` | `_runCreateApp()`에서 Step 0(Validating)을 먼저 실행하도록 순서 변경 |
| `apps-page.ts` | Progress 모달 실패 시 에러 메시지를 log-content에 표시 |

### 재발 방지 체크리스트
- [ ] job step index와 실제 실행 순서가 일치하는지 확인
- [ ] Progress 모달에서 failed 상태 시 error message가 반드시 표시되는지 확인

---

## Git Server 링크 404 오류 — 발견일: 2026-03-17

### 증상
Apps 페이지에서 "Git Server에서 관리 →" 버튼 클릭 시 `http://localhost:8088/git`으로 이동하여 404 에러 발생.

### 근본 원인 (Root Cause)
`apps-page.ts:204` — `<a href="/git">` 상대 경로 사용. Admin 패널이 `localhost:8088`에서 서빙되므로 상대 경로가 `http://localhost:8088/git`으로 해석됨. 실제 Gitea URL은 `http://localhost/git` (Traefik 리버스 프록시, 포트 80).

참고: `app-manager.ts:268`에서 `giteaBaseUrl = 'http://localhost/git'`으로 올바르게 정의되어 있음.

### 수정 내용
| 파일 | 변경 내용 |
|------|----------|
| `apps-page.ts:204` | `href="/git"` → `href="http://localhost/git"` |

### 재발 방지 체크리스트
- [ ] Apps 페이지에서 외부 서비스 링크는 반드시 절대 URL 사용
- [ ] Admin 패널(8088)과 Traefik(80)이 별도 포트임을 인지하고 상대 경로 사용 금지

---

*문서 끝 — brewnet.dev | brewnet.dev@gmail.com*
