# Brewnet — 사용 가이드

> **Your Home Server, Brewed Fresh**
> CLI 설치부터 서비스 관리, 종료, 완전 제거까지의 전체 가이드입니다.

---

## 목차

1. [설치](#1-설치)
2. [초기 설정 — `brewnet init`](#2-초기-설정--brewnet-init)
3. [서비스 관리](#3-서비스-관리)
4. [관리 패널 — `brewnet admin`](#4-관리-패널--brewnet-admin)
5. [서비스 종료](#5-서비스-종료)
6. [언인스톨 — `brewnet uninstall`](#6-언인스톨--brewnet-uninstall)
7. [자주 묻는 질문](#7-자주-묻는-질문)

---

## 1. 설치

### 원라인 설치 (권장)

```bash
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash
```

설치가 완료되면 PATH를 재로드합니다.

```bash
source ~/.zshrc    # zsh 사용 시
source ~/.bashrc   # bash 사용 시
```

설치 확인:

```bash
brewnet --version
```

### 사전 요구사항

| 항목 | 최소 버전 | 비고 |
|------|-----------|------|
| Node.js | 20+ | `node --version` |
| pnpm | 최신 | 없으면 자동 설치 |
| Docker | 27+ | 없으면 init 시 자동 설치 |
| OS | macOS 12+ / Ubuntu 20.04+ | |
| RAM | 2GB+ | 권장 4GB+ |
| 디스크 | 20GB+ | 서비스 수에 따라 다름 |

> Docker가 설치되어 있지 않아도 됩니다. `brewnet init` 실행 시 자동으로 설치합니다.
> - macOS: Homebrew(`brew install --cask docker`)
> - Linux: 공식 convenience script(`get.docker.com`)

---

## 2. 초기 설정 — `brewnet init`

```bash
brewnet init
```

7단계 대화형 위저드가 시작됩니다.

### 위저드 단계별 안내

#### Step 0 — 시스템 체크
OS, Docker, 포트(80/443), 디스크/RAM 요구사항을 자동으로 검사합니다.
Docker가 없으면 자동 설치를 제안합니다.

#### Step 1 — 프로젝트 설정
- **프로젝트 이름**: 디렉터리명으로 사용됩니다 (예: `homeserver`)
- **설치 경로**: 기본값 `~/brewnet/<프로젝트명>`
- **설치 유형**: Full Install (전체) / Partial Install (선택)

#### Step 2 — 서버 컴포넌트

| 컴포넌트 | 선택지 | 기본값 |
|----------|--------|--------|
| 웹 서버 (필수) | Traefik / Nginx / Caddy | Traefik |
| 파일 서버 | Nextcloud / MinIO | 비활성 |
| DB 서버 | PostgreSQL / MySQL + Redis/Valkey | PostgreSQL + Redis |
| 미디어 | Jellyfin | 비활성 |
| SSH 서버 | OpenSSH (포트 2222) | 비활성 |
| 관리자 계정 | 사용자명 + 비밀번호 자동 생성 | admin / 20자 랜덤 |

#### Step 3 — 개발 스택 (선택)
- **백엔드 언어**: Python / Node.js / Java / PHP / .NET / Rust / Go (복수 선택)
- **언어별 프레임워크**:
  - Python: FastAPI / Django / Flask
  - Node.js: Next.js / Express / NestJS / Fastify
  - Java: Spring Boot / Spring / Pure Java
  - PHP: Laravel / Symfony
  - .NET: ASP.NET Core / Blazor
  - Rust / Go: 프레임워크 없음
- **프론트엔드**: Vue.js / React / TypeScript / JavaScript (복수 선택)
- **FileBrowser**: 파일 브라우저 컨테이너 (directory / standalone)
- **보일러플레이트**: 샘플 프로젝트 파일 생성 여부

언어/프레임워크가 필요 없으면 **Skip**을 선택하면 됩니다.

#### Step 4 — 도메인 & 네트워크

**로컬 (LAN 전용)**
- 인터넷 연결 불필요
- `<프로젝트명>.local` 로 접근 (같은 네트워크에서만)

**Cloudflare Tunnel (외부 접근)**
> 포트포워딩 없이 인터넷에서 접근 가능합니다.

Cloudflare 설정 순서:
1. [dash.cloudflare.com](https://dash.cloudflare.com) 로그인
2. **Websites → Add a site** → 도메인 등록 후 네임서버 변경
3. 우측 상단 프로필 → **My Profile → API Tokens → Create Token**
   → "Edit Cloudflare Tunnel" 템플릿 선택
   → Zone Resources: 사용할 도메인
   → **Create Token** → 토큰 복사
4. 위저드에서 토큰 붙여넣기 → 나머지는 자동 처리

> **Manual 모드**: API 토큰 없이 [one.dash.cloudflare.com](https://one.dash.cloudflare.com) 에서 직접 터널을 만들고 Connector Token을 붙여넣을 수도 있습니다.

#### Step 5 — 검토 및 확인
설정 요약을 보여줍니다. 문제가 없으면 **Generate** 를 선택합니다.

#### Step 6 — 생성 & 시작
- `docker-compose.yml` 생성
- `.env` 생성 (chmod 600)
- 인프라 설정 파일 생성
- Docker 이미지 pull
- 서비스 시작 (의존성 순서 자동 처리)

#### Step 7 — 완료
- 서비스별 접속 URL 표시
- 관리자 계정 정보 표시
- `~/.brewnet/status/index.html` 로컬 상태 페이지 자동 오픈

### 유용한 플래그

```bash
brewnet init --no-open    # 브라우저 자동 오픈 비활성
```

---

## 3. 서비스 관리

### 상태 확인

```bash
brewnet status
```

모든 서비스의 실행 상태, 포트, 헬스체크 결과를 테이블로 표시합니다.

### 서비스 시작 / 중지

```bash
brewnet up       # 모든 서비스 시작 (docker compose up -d)
brewnet down     # 모든 서비스 중지 (docker compose down)
```

### 로그 확인

```bash
brewnet logs             # 전체 서비스 로그
brewnet logs traefik     # 특정 서비스 로그
brewnet logs gitea -f    # 실시간 로그 follow
```

### 서비스 추가 / 제거

```bash
brewnet add jellyfin     # 서비스 추가 (Jellyfin)
brewnet add nextcloud    # 서비스 추가 (Nextcloud)
brewnet remove jellyfin  # 서비스 제거
```

### 백업 / 복원

```bash
brewnet backup                  # 현재 상태 백업 (tar.gz)
brewnet restore <backup-id>     # 백업으로 복원
```

---

## 4. 관리 패널 — `brewnet admin`

로컬 웹 관리 패널을 엽니다.

```bash
brewnet admin             # 기본 포트 8088
brewnet admin --port 9000 # 포트 지정
```

브라우저에서 `http://localhost:8088` 접속.

**패널 기능**:
- 서비스 목록 및 실행 상태 확인
- 서비스 시작 / 중지 (버튼 클릭)
- 새 서비스 설치
- 서비스 제거

> localhost 전용으로 실행됩니다. 외부에서는 접근할 수 없습니다.

---

## 5. 서비스 종료

### 일시 중지 (데이터 유지)

```bash
brewnet down
```

컨테이너를 중지하지만 Docker 볼륨(데이터)은 유지됩니다.
`brewnet up` 으로 다시 시작하면 모든 데이터가 그대로 복원됩니다.

### 재시작

```bash
brewnet down && brewnet up
```

### 서버 재부팅 후 자동 시작

모든 컨테이너는 `restart: unless-stopped` 정책으로 설정되어 있습니다.
Docker 데몬이 시작되면 컨테이너도 자동으로 재시작됩니다.

---

## 6. 언인스톨 — `brewnet uninstall`

### 삭제 전 미리 확인

```bash
brewnet uninstall --dry-run
```

실제로 아무것도 삭제하지 않고 삭제 대상 목록만 출력합니다.

```
Dry-run mode — no changes will be made.

Installed projects:
  ▶ homeserver  /Users/username/brewnet/homeserver

The following will be removed:
  [remove] Docker containers + volumes
  [remove] Docker networks: brewnet, brewnet-internal
  [remove] Project directory: /Users/username/brewnet/homeserver

  ⚠  WARNING: Database and file server data will be permanently deleted.
     Use --keep-data to preserve volumes.

Dry-run complete. No changes made.
```

### 완전 제거

```bash
brewnet uninstall
```

다음을 순서대로 제거합니다:
1. Docker 컨테이너 + 볼륨(`docker compose down --volumes`)
2. Docker 네트워크 (`brewnet`, `brewnet-internal`)
3. 프로젝트 디렉터리
4. `~/.brewnet/status`, `~/.brewnet/state`
5. 위저드 상태 파일 (`~/.brewnet/projects/<name>/`)

### 옵션별 제거

| 명령어 | 설명 |
|--------|------|
| `brewnet uninstall` | 전체 제거 (데이터 포함) |
| `brewnet uninstall --keep-data` | Docker 볼륨 보존 (DB, 파일 데이터 유지) |
| `brewnet uninstall --keep-config` | 프로젝트 디렉터리 보존 (컨테이너만 중지) |
| `brewnet uninstall --force` | 확인 프롬프트 없이 바로 제거 |
| `brewnet uninstall --dry-run` | 삭제 없이 대상 목록만 확인 |

### 옵션 조합 예시

```bash
# 데이터는 보존하고 컨테이너/네트워크만 정리
brewnet uninstall --keep-data --keep-config

# 확인 없이 완전 제거 (CI/스크립트 자동화용)
brewnet uninstall --force
```

### Cloudflare Tunnel 수동 제거

`brewnet uninstall`은 Cloudflare Tunnel 레코드를 자동으로 삭제하지 않습니다.
Cloudflare Tunnel을 사용했다면 아래에서 수동으로 삭제하세요.

1. [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Networks → Tunnels**
2. 생성된 터널 선택 → **Delete**
3. **DNS** 탭 → 생성된 CNAME 레코드 삭제

### 재설치

```bash
brewnet init
```

언인스톨 후 다시 `brewnet init`을 실행하면 새 프로젝트를 설정할 수 있습니다.
`install.sh`를 다시 실행할 필요는 없습니다.

---

## 7. 자주 묻는 질문

**Q: `brewnet init` 실행 중 Docker를 설치하려면 인터넷이 필요한가요?**
A: 예, Docker 자동 설치는 인터넷이 필요합니다. 이후 서비스 이미지 pull도 인터넷이 필요합니다. 그 외 핵심 CLI 기능은 오프라인에서 동작합니다.

**Q: 비밀번호를 잊어버렸어요.**
A: 초기 설정 완료 후 생성된 `~/.brewnet/status/index.html` 파일에서 확인할 수 있습니다. 또는 프로젝트 디렉터리의 `.env` 파일을 확인하세요.

**Q: 서비스를 중지했다가 다시 시작하면 데이터가 유지되나요?**
A: 예. `brewnet down` → `brewnet up` 은 Docker 볼륨을 삭제하지 않으므로 모든 데이터가 유지됩니다. 데이터를 삭제하려면 `docker compose down --volumes` 또는 `brewnet uninstall`을 사용하세요.

**Q: 포트 80/443이 이미 사용 중이에요.**
A: `brewnet init` Step 0에서 포트 충돌을 감지하고 해결 방법을 안내합니다. 기존 서비스를 중지하거나 대체 포트를 사용하세요.

**Q: `brewnet admin`에 접속이 안 돼요.**
A: `brewnet up`으로 서비스가 실행 중인지 확인하세요. 관리 패널은 로컬에서만 접근 가능합니다 (`http://localhost:8088`).

---

*Brewnet · BUSL-1.1 → Apache 2.0 (2029-01-01) · [GitHub](https://github.com/claude-code-expert/brewnet)*
