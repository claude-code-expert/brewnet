# Brewnet 설치 가이드

> **"Your Home Server, Brewed Fresh"**
> 홈 서버를 처음부터 직접 세팅하는 인터랙티브 CLI 위저드

---

## 목차

1. [설치 흐름 개요](#1-설치-흐름-개요)
2. [Step 0 — 시스템 검사](#2-step-0--시스템-검사)
3. [Step 1 — 프로젝트 설정](#3-step-1--프로젝트-설정)
4. [Step 2 — 서버 컴포넌트](#4-step-2--서버-컴포넌트)
5. [Step 3 — 개발 스택 & 런타임](#5-step-3--개발-스택--런타임)
6. [Step 4 — 네트워크 설정](#6-step-4--네트워크-설정)
7. [Step 5 — 검토 & 확인](#7-step-5--검토--확인)
8. [Step 6 — 생성 & 시작](#8-step-6--생성--시작)
9. [Step 7 — 완료](#9-step-7--완료)
10. [서비스 전체 목록](#10-서비스-전체-목록)
11. [크리덴셜 전파 & 보안](#11-크리덴셜-전파--보안)
12. [생성되는 파일 구조](#12-생성되는-파일-구조)

---

## 1. 설치 흐름 개요

```
brewnet init
```

```
Step 0   Step 1     Step 2        Step 3      Step 4      Step 5   Step 6    Step 7
시스템 → 프로젝트 → 서버 컴포넌트 → 개발 스택 → 네트워크 → 검토 → 생성 → 완료
검사     설정                                    설정       확인
```

### 설치 방식

| 방식 | 활성화 항목 | 대상 |
|------|------------|------|
| **Full Install** | Web Server + Git Server + DB(PostgreSQL + Redis) | 일반 사용자 |
| **Partial Install** | Web Server + Git Server만 | 직접 구성을 원하는 사용자 |

---

## 2. Step 0 — 시스템 검사

설치 시작 전 환경을 자동으로 검사합니다. 사용자 입력 없음.

| 검사 항목 | 설명 |
|----------|------|
| OS 확인 | macOS / Ubuntu / Debian / CentOS 지원 여부 |
| Docker 설치 | Docker CLI 존재 여부 |
| Docker 데몬 | `docker info` 실행으로 데몬 실행 여부 확인 |
| 포트 가용성 | 80, 443, 3000, 3022 등 핵심 포트 충돌 검사 |
| 디스크 공간 | 최소 여유 공간 확인 |

> **BN001** — Docker 데몬 미실행 시 전용 해결 메뉴 표시
> **BN002** — 포트 충돌 시 상세 안내 출력

---

## 3. Step 1 — 프로젝트 설정

### 입력 항목

| 항목 | 설명 | 기본값 |
|------|------|--------|
| 프로젝트 이름 | 소문자 + 숫자 + 하이픈 (`^[a-z0-9][a-z0-9-]*$`) | `my-homeserver` |
| 프로젝트 경로 | 절대 경로 또는 `~` 경로 | `~/brewnet/my-homeserver` |
| 설치 방식 | Full Install / Partial Install | Full Install |

---

## 4. Step 2 — 서버 컴포넌트

### 4-1. 관리자 계정 (필수)

모든 서비스에 단일 관리자 계정이 전파됩니다.

| 항목 | 기본값 | 설명 |
|------|--------|------|
| 사용자명 | `admin` | 변경 가능 |
| 비밀번호 | 자동 생성 20자 | 수락 또는 직접 입력 (최소 8자) |
| 저장 방식 | `.env` 파일 | `chmod 600` 적용, 소유자만 읽기 가능 |

---

### 4-2. 웹 서버 ✅ 필수

리버스 프록시 역할. 외부 요청을 각 서비스로 라우팅합니다.

| 서비스 | Docker 이미지 | 포트 | 특징 |
|--------|--------------|------|------|
| **Traefik** ⭐ | `traefik:latest` | 80, 443, 8080(관리) | 자동 서비스 디스커버리, Docker 라벨 기반 라우팅 |
| Nginx | `nginx:latest` | 80, 443 | 성숙한 웹 서버, 수동 설정 |
| Caddy | `caddy:latest` | 80, 443 | 자동 HTTPS, 간결한 설정 |

> 기본값: **Traefik** (Docker Compose와 가장 통합이 잘 됨)

---

### 4-3. Git 서버 ✅ 필수

| 서비스 | Docker 이미지 | 포트 | 역할 |
|--------|--------------|------|------|
| **Gitea** | `gitea/gitea:latest` | 3000 (Web UI), 3022 (SSH) | GitHub/GitLab 대체 셀프호스팅 Git |

**접속 주소:**
- 로컬: `http://localhost:3000`
- Cloudflare Tunnel: `https://git.{도메인}`

**제공 기능:** 저장소 관리, Pull Request, 이슈 트래킹, 위키, CI/CD(Gitea Actions)

**DB 연동:** PostgreSQL 또는 MySQL 선택 시 자동으로 외부 DB 사용. 없으면 SQLite 사용.

---

### 4-4. 파일 서버 ☐ 선택

| 서비스 | Docker 이미지 | 포트 | 역할 |
|--------|--------------|------|------|
| **Nextcloud** | `nextcloud:latest` | 80 | 구글 드라이브 대체. 파일 동기화 + 캘린더 + 연락처 + 오피스 |
| MinIO | `minio/minio:latest` | 9001 (콘솔) | AWS S3 호환 오브젝트 스토리지 |

**접속 주소:**
- Nextcloud (Tunnel): `https://cloud.{도메인}`
- MinIO 콘솔 (Tunnel): `https://minio.{도메인}`

> Nextcloud와 MinIO는 둘 중 하나만 선택.
> DB 서버와 캐시가 함께 활성화되면 자동으로 연동.

---

### 4-5. 데이터베이스 서버 ☐ 선택

#### Primary DB — 하나 선택

| 서비스 | Docker 이미지 | 포트 | 권장 버전 |
|--------|--------------|------|----------|
| **PostgreSQL** ⭐ | `postgres:{버전}` | 5432 | 17 (기본) |
| MySQL | `mysql:{버전}` | 3306 | 8.0 (기본) |
| SQLite | 내장 | — | 3 |

**PostgreSQL 버전 선택:** 13 / 14 / 15 / 16 / **17**
**MySQL 버전 선택:** 5.7 / **8.0** / 8.3

**기본 DB 설정:**

| 항목 | 기본값 |
|------|--------|
| DB 이름 | `brewnet_db` |
| DB 사용자 | `brewnet` |
| DB 비밀번호 | 자동 생성 16자 |

#### DB 관리 UI (PostgreSQL 선택 시)

| 서비스 | Docker 이미지 | 포트 | 접속 (Tunnel) |
|--------|--------------|------|--------------|
| **pgAdmin** | `dpage/pgadmin4:latest` | 80 | `https://pgadmin.{도메인}` |

#### 캐시 레이어 — 하나 선택 (선택사항)

| 서비스 | Docker 이미지 | 포트 | 특징 |
|--------|--------------|------|------|
| **Redis** ⭐ | `redis:latest` | 6379 | 가장 널리 사용되는 인메모리 캐시 |
| Valkey | `valkey/valkey:latest` | 6379 | Redis 7.x 오픈소스 포크 (Linux Foundation) |
| KeyDB | `eqalpha/keydb:latest` | 6379 | 멀티스레드 Redis 호환 대체 |

> Gitea, Nextcloud는 캐시 선택 시 자동으로 연동됩니다.

---

### 4-6. 미디어 서버 ☐ 선택

| 서비스 | Docker 이미지 | 포트 | 역할 |
|--------|--------------|------|------|
| **Jellyfin** | `jellyfin/jellyfin:latest` | 8096 | Netflix 대체. 영상/음악/사진 스트리밍 |

**접속 주소:**
- 로컬: `http://localhost:8096`
- Tunnel: `https://media.{도메인}`

**제공 기능:** 영화/TV 라이브러리, 자막 자동 다운로드, 트랜스코딩, 모바일/TV 앱 지원

---

### 4-7. SSH 서버 ☐ 선택

| 서비스 | Docker 이미지 | 포트 | 역할 |
|--------|--------------|------|------|
| **OpenSSH** | `linuxserver/openssh-server:latest` | 2222 | 서버 원격 접속 |

**하위 설정:**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| 비밀번호 인증 | **OFF** | 보안상 키 기반 인증만 허용 |
| SFTP 서브시스템 | 조건부 자동 | 파일 서버 또는 미디어 서버 활성 시 자동 권장 |

> 파일 서버(Nextcloud/MinIO) 또는 Jellyfin 활성화 시 SFTP 활성화를 자동으로 권장합니다.

---

### 4-8. 메일 서버 ☐ 선택 (Tunnel 모드 시만 표시)

로컬 도메인에서는 표시되지 않습니다. Cloudflare Tunnel 설정 완료 후 표시됩니다.

| 서비스 | Docker 이미지 | 포트 | 역할 |
|--------|--------------|------|------|
| **docker-mailserver** | `mailserver/docker-mailserver:latest` | 25 (SMTP), 587 (제출), 993 (IMAPS) | 완전한 셀프호스팅 메일 서버 |

#### Port 25 자동 감지

설치 시 `smtp.cloudflare.com:25`에 자동으로 연결 시도 (3초 타임아웃):

- **포트 25 오픈** → 직접 메일 전송 가능 (일반 가정용 회선은 대부분 차단)
- **포트 25 차단** → SMTP Relay 설정 필요

#### SMTP Relay 선택 (포트 25 차단 시)

| 공급자 | 호스트 | 포트 | 무료 한도 | 인증 방법 |
|--------|--------|------|----------|----------|
| **Gmail SMTP** | `smtp.gmail.com` | 587 | 500통/일 | Gmail 주소 + App Password |
| SendGrid | `smtp.sendgrid.net` | 587 | 100통/일 | API Key |
| Custom | 사용자 입력 | 사용자 입력 | — | 사용자 입력 |
| Skip | — | — | — | 메일 서버 비활성화 |

> Gmail App Password 생성: Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호

---

## 5. Step 3 — 개발 스택 & 런타임

언어 또는 프론트엔드 기술을 하나 이상 선택하면 **App Server가 자동 활성화**됩니다.

### 5-1. 백엔드 언어 (다중 선택)

#### Python

| 프레임워크 | 특징 |
|-----------|------|
| **FastAPI** | 비동기, 자동 API 문서, 고성능 |
| Django | 풀스택, ORM, 관리자 UI 내장 |
| Flask | 경량 마이크로 프레임워크 |

#### Node.js

| 프레임워크 | 특징 |
|-----------|------|
| **Next.js** | 풀스택 React 프레임워크, SSR/SSG |
| Next.js (API only) | API 라우트만 사용 |
| Express | 미니멀 웹 프레임워크, 가장 널리 사용 |
| NestJS | Angular 스타일, TypeScript 기반 |
| Fastify | 고성능, 낮은 오버헤드 |

#### Java

| 프레임워크 | 특징 |
|-----------|------|
| **Spring Boot** | 자동 설정, 빠른 개발, 프로덕션 지향 |
| Spring Framework | 엔터프라이즈 Java 표준 |
| Pure Java | 프레임워크 없음 |

#### PHP

| 프레임워크 | 특징 |
|-----------|------|
| **Laravel** | 우아한 문법, Eloquent ORM, 풀스택 |
| Symfony | 엔터프라이즈, 컴포넌트 기반 |

#### .NET

| 프레임워크 | 특징 |
|-----------|------|
| **ASP.NET Core** | 크로스플랫폼 웹 프레임워크 |
| Blazor | .NET으로 인터랙티브 웹 UI |

#### Rust

| 프레임워크 | 특징 |
|-----------|------|
| Axum | Tokio 기반 비동기, Tower 미들웨어 |
| Actix Web | 고성능 액터 기반 |
| Rocket | 인체공학적 설계, 타입 안전 |

#### Go

| 프레임워크 | 특징 |
|-----------|------|
| Gin | 빠른 HTTP 라우터, 미니멀 |
| Echo | 고성능, 확장성 |
| Fiber | Express 스타일, fasthttp 기반 |

---

### 5-2. 프론트엔드 기술 (다중 선택)

| 기술 | 설명 |
|------|------|
| **Vue.js** | 프로그레시브 JS 프레임워크, 점진적 도입 가능 |
| **React** | UI 컴포넌트 라이브러리, 생태계 최대 |
| **TypeScript** | 정적 타입 JavaScript |
| **JavaScript** | 바닐라 JS |

---

### 5-3. FileBrowser ☐ (App Server 활성 시 자동 추가)

| 모드 | Docker 이미지 | 포트 | 역할 |
|------|--------------|------|------|
| Directory | `filebrowser/filebrowser:latest` | 80 | 웹 서버 정적 파일 관리 |
| **Standalone** | `filebrowser/filebrowser:latest` | 80 | 독립 파일 브라우저 컨테이너 |

**접속 주소 (Tunnel):** `https://files.{도메인}`

---

### 5-4. 보일러플레이트 생성 옵션

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| 프로젝트 파일 생성 | ON | 선택한 언어/프레임워크 기반 프로젝트 스캐폴딩 |
| 샘플 데이터 포함 | ON | 시드 데이터, 예시 파일 포함 |
| 개발 모드 | `hot-reload` | 파일 변경 시 자동 재시작 |
| 프로덕션 모드 | `production` | 최적화 빌드 |

---

## 6. Step 4 — 네트워크 설정

### 6-1. 도메인 공급자 선택

#### 옵션 1: Local (LAN 전용)

| 항목 | 값 |
|------|---|
| 도메인 | `{projectName}.local` |
| SSL | 자체 서명 인증서 |
| 외부 접속 | ❌ 불가 |
| Cloudflare | ❌ 비활성 |
| 메일 서버 | ❌ 표시 안 됨 |

> 인터넷 연결 없이 작동. 가정 내 LAN에서만 접속 가능.

---

#### 옵션 2: Cloudflare Tunnel (외부 접속)

| 항목 | 값 |
|------|---|
| SSL | Cloudflare 자동 관리 (Let's Encrypt 불필요) |
| 외부 접속 | ✅ 가능 |
| 포트 포워딩 | ❌ 불필요 |
| 공인 IP | ❌ 불필요 |

---

### 6-2. Cloudflare Tunnel 설정 방식

#### API 자동화 ⭐ (권장)

토큰 1회 입력으로 모든 설정을 자동 처리합니다.

**필요 권한:** Cloudflare API Token
- `Cloudflare Tunnel: Edit`
- `DNS: Edit`

> 위저드가 Pre-filled URL을 표시하고 브라우저를 자동으로 엽니다.

**자동화 단계:**

| 단계 | 작업 | 설명 |
|------|------|------|
| ① | 토큰 생성 URL 표시 | 필요 권한이 미리 채워진 URL 표시 + 브라우저 오픈 |
| ② | API 토큰 입력 | 생성한 토큰 붙여넣기 |
| ③ | 토큰 검증 | `GET /user/tokens/verify` → 계정 이메일 표시 |
| ④ | 계정 탐지 | `GET /accounts` → 1개면 자동 선택, 여러 개면 선택 |
| ⑤ | Zone 탐지 | `GET /zones` → active 도메인 자동 선택 또는 선택 |
| ⑥ | 터널 이름 입력 | 기본값: 프로젝트명 |
| ⑦ | 터널 생성 | `POST /accounts/{id}/cfd_tunnel` |
| ⑧ | Ingress 설정 | `PUT /cfd_tunnel/{id}/configurations` (서비스별 자동) |
| ⑨ | DNS 레코드 생성 | `POST /zones/{id}/dns_records` (서비스별 CNAME) |
| ⑩ | 토큰 삭제 | state에서 API 토큰 즉시 제거 (보안) |

**자동 생성되는 DNS CNAME 레코드:**

| 서비스 | 외부 주소 | 내부 라우팅 | 활성 조건 |
|--------|----------|------------|----------|
| Gitea | `git.{도메인}` | `gitea:3000` | 항상 |
| Nextcloud | `cloud.{도메인}` | `nextcloud:80` | 파일 서버 = Nextcloud |
| MinIO | `minio.{도메인}` | `minio:9001` | 파일 서버 = MinIO |
| Jellyfin | `media.{도메인}` | `jellyfin:8096` | 미디어 서버 활성 |
| pgAdmin | `pgadmin.{도메인}` | `pgadmin:80` | PostgreSQL + Admin UI |
| FileBrowser | `files.{도메인}` | `filebrowser:80` | FileBrowser 활성 |

---

#### Manual 설정

Cloudflare 대시보드에서 직접 터널을 생성하고 토큰을 붙여넣는 방식.

**절차:**
1. `https://one.dash.cloudflare.com` 접속
2. Networks → Connectors → Cloudflare Tunnels → Create a tunnel
3. Cloudflared 선택 → 이름 지정 → 저장
4. 설치 명령어에서 토큰 복사 (`cloudflared service install` 뒤의 긴 문자열)
5. 위저드에 붙여넣기

> 설치 후 대시보드에서 Published Applications → Add 로 서비스별 hostname을 수동 추가해야 합니다.

---

## 7. Step 5 — 검토 & 확인

설치 전 전체 설정을 한눈에 검토합니다.

### 표시 항목

| 섹션 | 내용 |
|------|------|
| 프로젝트 설정 | 이름, 경로, 설치 방식 |
| 관리자 계정 | 사용자명, 비밀번호(마스킹), 저장 방식 |
| 서버 컴포넌트 | 활성화된 모든 서비스 목록 |
| 개발 스택 | 선택한 언어, 프레임워크, 프론트엔드 |
| 네트워크 | 도메인 공급자, 터널 이름, Zone(도메인), SSL |
| 리소스 예측 | 예상 컨테이너 수, RAM 사용량, 디스크 용량 |
| 크리덴셜 전파 | 관리자 계정을 수신할 서비스 목록 |

### 액션 선택

| 액션 | 설명 |
|------|------|
| **Generate** | 설치 진행 (Step 6으로 이동) |
| Modify | 특정 단계로 돌아가 수정 |
| Export | `brewnet.config.json`으로 설정 내보내기 (비밀 제외) |

---

## 8. Step 6 — 생성 & 시작

### 자동 실행 순서

| 순서 | 작업 | 설명 |
|------|------|------|
| 1 | `docker-compose.yml` 생성 | 선택 서비스 기반 자동 생성 |
| 2 | `.env` 생성 | 모든 시크릿 포함, `chmod 600` |
| 3 | `.env.example` 생성 | 마스킹된 예시 파일 |
| 4 | `docker compose pull` | 이미지 다운로드 |
| 5 | `docker compose up -d` | 컨테이너 백그라운드 시작 |
| 6 | 헬스체크 대기 | 각 서비스 정상 기동 확인 |
| 7 | 외부 접속 검증 | Tunnel 모드: DNS/HTTPS 접속 확인 |

### 컨테이너 시작 순서 (의존성 기반)

```
1순위 (인프라)     → traefik / nginx / caddy / cloudflared
        ↓
2순위 (데이터베이스) → postgresql / mysql
        ↓
3순위 (캐시)       → redis / valkey / keydb
        ↓
4순위 (앱)         → gitea / nextcloud / minio / jellyfin
        ↓
5순위 (유틸)       → pgadmin / filebrowser / openssh-server / docker-mailserver
```

---

## 9. Step 7 — 완료

### 출력 정보

#### 서비스 엔드포인트 목록

설치된 모든 서비스의 접속 주소를 표시합니다.

#### Cloudflare Tunnel 정보 (Tunnel 모드)

| 항목 | 값 |
|------|---|
| 터널 이름 | 입력한 이름 |
| 터널 ID | API가 반환한 UUID |
| Zone(도메인) | 선택한 Cloudflare 도메인 |

#### 다음 단계 명령어

```bash
brewnet status              # 서비스 상태 확인
brewnet logs [service]      # 로그 보기
brewnet down                # 서비스 중지
brewnet up                  # 서비스 재시작
brewnet backup              # 백업 생성
```

#### 트러블슈팅

```bash
docker ps                   # 실행 중인 컨테이너 확인
docker compose logs -f      # 전체 로그 스트림
```

### 상태 페이지 자동 생성

설치 완료 후 `~/.brewnet/status/index.html`을 생성하고 브라우저를 자동으로 엽니다.

**상태 페이지 섹션:**

| 섹션 | 내용 |
|------|------|
| Services | 서비스 카드 (이름, 상태 배지, 로컬 URL, 외부 URL) |
| Credentials | 관리자명, 비밀번호 힌트 (마스킹 + 토글) |
| Network | 공급자, 도메인, 터널 정보 |
| Next Steps | CLI 명령어 카드 |

```bash
brewnet init             # 브라우저 자동 오픈 포함
brewnet init --no-open   # 브라우저 자동 오픈 비활성화
```

---

## 10. 서비스 전체 목록

### 인프라 & 프록시

| 서비스 | Docker 이미지 | 내부 포트 | 외부 포트 | 역할 |
|--------|--------------|----------|----------|------|
| Traefik | `traefik:latest` | — | 80, 443, 8080 | 리버스 프록시, 서비스 라우터 |
| Nginx | `nginx:latest` | — | 80, 443 | 웹 서버 / 리버스 프록시 |
| Caddy | `caddy:latest` | — | 80, 443 | 자동 SSL 웹 서버 |
| Cloudflared | `cloudflare/cloudflared:latest` | — | — (아웃바운드만) | Cloudflare Tunnel 커넥터 |

### 버전 관리

| 서비스 | Docker 이미지 | 내부 포트 | 외부 포트 | 역할 |
|--------|--------------|----------|----------|------|
| Gitea | `gitea/gitea:latest` | 3000 | 3000, 3022 | Git 서버 + 웹 UI |

### 데이터베이스

| 서비스 | Docker 이미지 | 내부 포트 | 외부 포트 | 역할 |
|--------|--------------|----------|----------|------|
| PostgreSQL | `postgres:17` | 5432 | — | 관계형 DB |
| MySQL | `mysql:8.0` | 3306 | — | 관계형 DB |
| Redis | `redis:latest` | 6379 | — | 인메모리 캐시 |
| Valkey | `valkey/valkey:latest` | 6379 | — | Redis 오픈소스 포크 |
| KeyDB | `eqalpha/keydb:latest` | 6379 | — | 멀티스레드 Redis 대체 |

> DB/캐시 포트는 외부에 노출되지 않습니다. 내부 Docker 네트워크 전용.

### DB 관리 UI

| 서비스 | Docker 이미지 | 내부 포트 | Tunnel 주소 | 역할 |
|--------|--------------|----------|-----------|------|
| pgAdmin | `dpage/pgadmin4:latest` | 80 | `https://pgadmin.{도메인}` | PostgreSQL 웹 관리 |

### 파일 서버

| 서비스 | Docker 이미지 | 내부 포트 | Tunnel 주소 | 역할 |
|--------|--------------|----------|-----------|------|
| Nextcloud | `nextcloud:latest` | 80 | `https://cloud.{도메인}` | 파일 동기화 + 협업 스위트 |
| MinIO | `minio/minio:latest` | 9000, 9001 | `https://minio.{도메인}` | S3 호환 오브젝트 스토리지 |

### 미디어

| 서비스 | Docker 이미지 | 내부 포트 | Tunnel 주소 | 역할 |
|--------|--------------|----------|-----------|------|
| Jellyfin | `jellyfin/jellyfin:latest` | 8096 | `https://media.{도메인}` | 미디어 스트리밍 서버 |

### 유틸리티

| 서비스 | Docker 이미지 | 내부 포트 | Tunnel 주소 | 역할 |
|--------|--------------|----------|-----------|------|
| FileBrowser | `filebrowser/filebrowser:latest` | 80 | `https://files.{도메인}` | 웹 파일 관리 UI |
| OpenSSH | `linuxserver/openssh-server:latest` | 2222 | — (직접 SSH) | SSH 원격 접속 |
| docker-mailserver | `mailserver/docker-mailserver:latest` | 25, 587, 993 | — | SMTP/IMAP 메일 서버 |

---

## 11. 크리덴셜 전파 & 보안

관리자 계정(username + password)이 자동으로 각 서비스에 주입됩니다.

### 전파 대상 서비스

| 서비스 | 환경변수 |
|--------|---------|
| Gitea | 초기 관리자 계정 설정 |
| Nextcloud | `NEXTCLOUD_ADMIN_USER`, `NEXTCLOUD_ADMIN_PASSWORD` |
| MinIO | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` |
| pgAdmin | `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD` |
| docker-mailserver | postmaster 계정 |
| FileBrowser | 관리자 계정 |

### 자동 생성 시크릿

| 항목 | 길이 | 저장 위치 |
|------|------|---------|
| 관리자 비밀번호 | 20자 | `.env` → `ADMIN_PASSWORD` |
| DB 비밀번호 | 16자 | `.env` → `DB_PASSWORD` |
| Redis/Cache 비밀번호 | 16자 | `.env` → `REDIS_PASSWORD` 등 |
| Gitea 시크릿 키 | 16자 | `.env` → `GITEA_SECRET_KEY` |
| SMTP Relay 비밀번호 | — | `.env` → `SMTP_RELAY_PASSWORD` |

### 보안 원칙

- `.env` 파일: `chmod 600` (소유자만 읽기/쓰기)
- Cloudflare API 토큰: 검증 후 state에서 즉시 삭제
- DB/캐시 포트: 외부 미노출 (Docker 내부 네트워크만)
- SSH: 기본값 키 기반 인증 (비밀번호 인증 OFF)
- 메일 서버: 포트 25 직접 노출 없이 Relay 경유 권장

---

## 12. 생성되는 파일 구조

```
{projectPath}/                          ← Step 1에서 지정한 경로
├── docker-compose.yml                  ← 전체 서비스 정의
├── .env                                ← 모든 시크릿 (chmod 600, 절대 커밋 금지)
└── .env.example                        ← 마스킹된 예시 (커밋 가능)

~/.brewnet/                             ← Brewnet 전역 데이터
├── config.json                         ← 전역 CLI 설정
├── status/
│   └── index.html                      ← 설치 완료 상태 페이지
└── db/
    └── brewnet.db                      ← SQLite (서비스/배포 이력)
```

### `.env` 파일 구조 예시

```dotenv
# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Xk9mP2...             # 자동 생성 20자

# Database
DB_PASSWORD=aB3nQ7...                # 자동 생성 16자

# Cache
REDIS_PASSWORD=cD5rS9...

# Cloudflare
CLOUDFLARE_TUNNEL_TOKEN=eyJhI...     # Cloudflare API에서 자동 수신

# Mail (Relay 설정 시)
SMTP_RELAY_USER=myemail@gmail.com
SMTP_RELAY_PASSWORD=abcd-efgh-...    # Gmail App Password

# Domain
BREWNET_DOMAIN=myserver.com
```

---

## 빠른 참조 — CLI 명령어

```bash
# 설치
brewnet init                    # 인터랙티브 위저드 실행
brewnet init --no-open          # 설치 후 브라우저 자동 오픈 비활성화
brewnet init --config path.json # 설정 파일로 사전 입력
brewnet init --non-interactive  # CI/자동화 모드 (--config 필수)

# 서비스 관리
brewnet up                      # 모든 서비스 시작
brewnet down                    # 모든 서비스 중지
brewnet status                  # 서비스 상태 확인
brewnet logs [service]          # 로그 보기

# 유지보수
brewnet backup                  # 백업 생성
brewnet restore <backup-id>     # 백업 복원
brewnet update                  # 서비스 업데이트

# 도메인
brewnet domain tunnel status    # Cloudflare Tunnel 상태
brewnet domain tunnel expose    # 새 공개 hostname 추가
```

---

*Brewnet — BUSL-1.1 License (converts to Apache 2.0 on 2029-01-01)*
*Licensor: codevillain*
