# Brewnet Interactive Demo

`brewnet init` CLI 위자드의 인터랙티브 HTML 데모입니다.
브라우저에서 설치 플로우를 시뮬레이션하며, 모든 상태는 `localStorage`를 통해 페이지 간 유지됩니다.

## 실행 방법

```bash
npx serve public/demo
# 또는
cd public/demo && python3 -m http.server 8080
```

브라우저에서 `http://localhost:3000` (또는 `8080`) 접속 → `index.html`이 랜딩 페이지입니다.

---

## 파일 구조

```
public/demo/
├── index.html                    # 랜딩 페이지
├── brewnet-logo.html             # ASCII 아트 로고
├── step0-system-check.html       # Step 0: 시스템 점검
├── step1-project-setup.html      # Step 1: 프로젝트 설정
├── step2-server-components.html  # Step 2: 서버 컴포넌트 선택
├── step3-runtime.html            # Step 3: 런타임 & 보일러플레이트
├── step4-domain.html             # Step 4: 도메인 & 네트워크
├── step5-review.html             # Step 5: 리뷰 & 확인
├── step6-generate.html           # Step 6: 생성 & 시작
├── step7-complete.html           # Step 7: 완료
├── manage.html                   # 서비스 매니저 (설치 후)
├── css/
│   └── terminal.css              # 터미널 UI 스타일시트
└── js/
    └── wizard.js                 # 상태 관리 & 유틸리티
```

---

## 설치 위자드 플로우

```
index.html → step0 → step1 → step2 → step3 → step4 → step5 → step6 → step7
                                                                         ↓
                                                                    manage.html
```

### Step 0: System Check — 시스템 점검

시스템 요구사항을 사전 검증합니다.

| 항목 | 검증 내용 |
|------|-----------|
| OS | macOS / Linux 확인 |
| RAM | 최소 4GB |
| Disk | 최소 20GB 여유 공간 |
| Docker | Docker 엔진 설치 여부 |
| Node.js | v20+ 설치 여부 |
| Git | Git 설치 여부 |
| Ports | 80, 443, 8080 등 사용 가능 여부 |

### Step 1: Project Setup — 프로젝트 설정

프로젝트 기본 정보를 입력합니다.

- **프로젝트 이름**: 기본값 `my-homeserver`
- **프로젝트 경로**: 기본값 `~/brewnet/my-homeserver`
- **설치 유형**: Full Install (권장) / Partial Install

Full Install은 Web + App + DB가 기본 활성화되고, Partial Install은 Web Server만 필수로 나머지를 직접 선택합니다.

### Step 2: Server Components — 서버 컴포넌트 선택

관리자 계정을 생성하고 서버 컴포넌트를 토글 카드 방식으로 선택합니다.

| 컴포넌트 | 옵션 | 비고 |
|----------|------|------|
| Admin Account | 사용자명 / 비밀번호 | 필수, 모든 서비스에 전파 |
| Web Server | Traefik (기본) / Nginx / Caddy | 항상 활성 |
| File Server | Nextcloud / MinIO | 선택 |
| App Server | 토글만 (상세는 Step 3) | 선택 |
| Database | PostgreSQL / MySQL / MariaDB / SQLite + Cache (Redis / Valkey / KeyDB) | 선택, 인라인 설정 |
| Media | Jellyfin | 선택 |
| SSH Server | 포트 (기본 2222), 인증 방식, SFTP | 선택, File/Media 감지시 SFTP 자동 제안 |

**자격증명 전파**: 관리자 계정 한 번 입력 → Nextcloud, pgAdmin, Jellyfin, SSH, Mail 등 모든 서비스에 자동 적용됩니다.

### Step 3: Runtime & Boilerplate — 런타임 & 보일러플레이트

App Server가 활성화된 경우에만 표시됩니다.

- **언어 선택**: Python / Node.js / Java / Go / Rust
- **프레임워크 선택**: 언어별 주요 프레임워크 (예: Express, FastAPI, Spring Boot 등)
- **보일러플레이트 옵션**: 프로젝트 코드 생성 여부, 샘플 데이터, 개발 모드 (Hot-reload / Production)

### Step 4: Domain & Network — 도메인 & 네트워크

도메인 제공자를 선택하고 외부 접근을 설정합니다.

| 제공자 | 설명 |
|--------|------|
| Local Only | `brewnet.local` (hosts 파일 기반, 외부 접근 없음) |
| Own Domain (Cloudflare Tunnel) | 자체 도메인 + Cloudflare Named Tunnel |

**Cloudflare Tunnel**: Own Domain 선택 시 기본 활성화. NAT/CGNAT 환경에서도 외부 접근 가능.
- 터널 토큰 입력 시 시뮬레이션된 검증 상태 표시 (녹색 "Tunnel validated")
- Public Hostname 미리보기 (활성화된 서비스별 외부 URL)

**Mail Server**: 도메인이 Local이 아닌 경우에만 표시. docker-mailserver (SMTP 587, IMAP 993)를 설정합니다.

### Step 5: Review — 리뷰 & 확인

모든 선택 사항을 요약하여 보여줍니다.

- Project 정보, Admin Account, Server Components, Runtime, Domain
- SSH Server / Mail Server 상태
- 자격증명 전파 대상 서비스 목록
- 예상 리소스 (컨테이너 수, RAM, Disk)
- **Export Config** 버튼으로 `brewnet.config.json` 다운로드 가능

### Step 6: Generate — 생성 & 시작

설정 파일 생성과 Docker 컨테이너 시작을 시뮬레이션합니다.

| 단계 | 내용 |
|------|------|
| 1. 파일 생성 | docker-compose.yml, .env, Makefile, 서비스별 설정 파일 |
| 2. 이미지 풀 | 선택된 서비스의 Docker 이미지 다운로드 |
| 3. 컨테이너 시작 | docker-compose up 시뮬레이션 |
| 4. 헬스 체크 | 모든 컨테이너 상태 확인 |
| 5. 자격증명 전파 | 관리자 계정을 각 서비스에 적용 |
| 6. 외부 접근 검증 | Cloudflare Tunnel, DNS, HTTPS 응답 확인 |

### Step 7: Complete — 완료

설치 완료 후 모든 정보를 요약합니다.

- **서비스 엔드포인트**: 각 서비스의 URL과 포트 목록
- **자격증명 요약**: 서비스별 로그인 정보
- **Cloudflare Tunnel 헬스 상태**: DNS Resolution / Tunnel Connection / HTTPS Certificate 상태 표시
- **SSH/SFTP 접속 정보**: 접속 명령어 (활성화 시)
- **Mail 엔드포인트**: SMTP, IMAP, Webmail 주소 (활성화 시)
- **Mail DNS 레코드**: MX, SPF, DKIM, DMARC 설정 상태 표시 (활성화 시)
- **외부 접근 검증**: DNS 확인, HTTPS 테스트, 터널 상태 확인 명령어
- **트러블슈팅**: DNS 전파, Cloudflare 상태, 터널 로그, 502 에러, SSL 리다이렉트 대응
- **다음 단계 명령어**: `brewnet status`, `brewnet logs`, `brewnet credentials`, `brewnet storage monitor` 등

---

## 서비스 매니저 (manage.html)

설치 완료 후 사용하는 서비스 관리 페이지입니다.

| 탭 | 기능 |
|----|------|
| Status | 실행 중인 컨테이너 상태 (이름, 이미지, 포트, 상태) |
| Add Service | 새 서비스 추가 (File/Media/DB/SSH/Mail) |
| Remove Service | 기존 서비스 제거 |

---

## 핵심 파일 설명

### js/wizard.js

위자드 전체의 상태 관리와 유틸리티를 담당합니다.

- **WizardState**: `localStorage` 기반 상태 저장/로드, schemaVersion 마이그레이션
- **SERVICE_REGISTRY**: File Server, Web Server, Media 서비스 정의
- **DATABASE_REGISTRY**: Primary DB (PostgreSQL, MySQL, MariaDB, SQLite) + Cache (Redis, Valkey, KeyDB)
- **FRAMEWORKS**: 언어별 프레임워크 목록 (Python, Node.js, Java, Go, Rust)
- **유틸리티 함수**:
  - `collectAllServices(state)` — 활성화된 모든 서비스 ID 수집
  - `estimateResources(state)` — 컨테이너 수, RAM, Disk 추정
  - `getCredentialTargets(state)` — 자격증명 전파 대상 서비스 목록
  - `getImageName(serviceId)` — 서비스 ID → Docker 이미지 이름 매핑
  - `navigateNext()` / `navigatePrev()` — 스텝 간 네비게이션

### css/terminal.css

GitHub 스타일의 다크 터미널 UI를 제공합니다. 주요 컴포넌트:

- `.terminal` / `.terminal-titlebar` — 터미널 윈도우 프레임
- `.toggle-card` — 서버 컴포넌트 토글 카드
- `.checkbox-item` / `.check-box` — 체크박스 UI
- `.btn-success` / `.btn-secondary` / `.btn-danger` — 버튼 스타일
- `.progress-item` — Step 6 애니메이션 진행 표시
- `.alert-info` / `.alert-success` — 알림 박스
