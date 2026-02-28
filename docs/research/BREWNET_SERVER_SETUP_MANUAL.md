# Brewnet 서버 프로그램 초기 세팅 매뉴얼

> **Brewnet** — Your server on tap. Just brew it.  
> **Date**: 2026-02-28

---

## 목차

1. [Traefik (Web Server / Reverse Proxy)](#1-traefik)
2. [Gitea (Git Server)](#2-gitea)
3. [Nextcloud (File Server)](#3-nextcloud)
4. [PostgreSQL 17 (Database)](#4-postgresql-17)
5. [Redis (Cache)](#5-redis)
6. [pgAdmin 4 (DB Admin UI)](#6-pgadmin-4)
7. [Jellyfin (Media Server)](#7-jellyfin)
8. [OpenSSH (SSH Server + SFTP)](#8-openssh)
9. [docker-mailserver (Mail Server)](#9-docker-mailserver)
10. [FileBrowser (File Browser)](#10-filebrowser)
11. [포트 요약 및 접속 맵](#11-포트-요약)

---

## 1. Traefik

### 특징

- Go로 작성된 오픈소스 리버스 프록시/로드 밸런서 (MIT License)
- Docker 라벨 기반 자동 서비스 디스커버리 — 컨테이너가 뜨면 자동으로 라우팅 등록
- Let's Encrypt 인증서 자동 발급/갱신
- 미들웨어 체인: BasicAuth, Rate Limit, IP Whitelist, Headers 등
- 웹 대시보드 내장으로 라우팅 상태 실시간 모니터링
- HTTP → HTTPS 자동 리다이렉트

### Docker Compose

```yaml
services:
  traefik:
    image: traefik:v2.11
    command:
      - "--api.insecure=true"                    # 대시보드 (개발용)
      - "--providers.docker=true"                # Docker 자동 디스커버리
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"     # Dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-certs:/certs
    networks:
      - brewnet
```

### 첫 페이지 접속

```
http://localhost:8080
```

대시보드가 즉시 표시된다. 별도 로그인 없음 (`api.insecure=true` 모드).

### 계정 설정 (프로덕션)

Traefik 자체에는 사용자 계정 개념이 없다. 대시보드 보호는 BasicAuth 미들웨어로 처리한다.

```bash
# htpasswd로 비밀번호 생성
sudo apt install apache2-utils
htpasswd -nb admin YOUR_PASSWORD
# 출력: admin:$apr1$...
```

이 값을 Docker 라벨로 적용:

```yaml
labels:
  - "traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$..."
  - "traefik.http.routers.dashboard.middlewares=auth"
```

### 초기 설정 포인트

- `--api.insecure=true`는 개발용. 프로덕션에서는 반드시 제거하고 BasicAuth 또는 Authelia 연동
- `exposedbydefault=false` 설정 후 각 서비스에 `traefik.enable=true` 라벨 추가가 안전
- Let's Encrypt 적용 시 `--certificatesresolvers.le.acme.email=YOUR_EMAIL` 추가

---

## 2. Gitea

### 특징

- Go로 작성된 경량 자체호스팅 Git 서비스 (MIT License)
- GitHub와 유사한 웹 UI (이슈, PR, 위키, 프로젝트 보드)
- GitHub Actions 호환 CI/CD (Gitea Actions)
- 메모리 사용량 ~200MB로 매우 가벼움 (GitLab 대비 1/10)
- LDAP, OAuth2, SMTP 인증 지원
- PostgreSQL, MySQL, SQLite 모두 지원

### Docker Compose

```yaml
services:
  gitea:
    image: gitea/gitea:latest
    container_name: gitea
    environment:
      - USER_UID=1000
      - USER_GID=1000
      - GITEA__database__DB_TYPE=postgres
      - GITEA__database__HOST=postgres:5432
      - GITEA__database__NAME=gitea
      - GITEA__database__USER=gitea
      - GITEA__database__PASSWD=${GITEA_DB_PASSWORD}
    ports:
      - "3000:3000"     # Web UI
      - "3022:22"       # SSH
    volumes:
      - gitea-data:/data
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - brewnet
      - brewnet-internal
```

### 첫 페이지 접속

```
http://localhost:3000
```

최초 접속 시 **Initial Configuration 페이지**가 표시된다. 이 페이지에서 아래 항목을 설정:

1. **Database Type**: PostgreSQL 선택
2. **Host**: `postgres:5432`
3. **Database Name / User / Password** 입력
4. **Server Domain**: 서버 IP 또는 도메인
5. **Gitea Base URL**: `http://YOUR_DOMAIN:3000/`

페이지 하단 **Optional Settings** 펼치기:

6. **Administrator Account Settings** 섹션에서 관리자 계정 생성

### 계정 설정

**방법 1: 웹 UI (권장)**

Initial Configuration 페이지 하단의 "Administrator Account Settings"에서:
- Username
- Password
- Email

을 입력하고 "Install Gitea" 클릭.

**방법 2: CLI (자동화용)**

```bash
docker exec -it gitea gitea admin user create \
  --username admin \
  --password YOUR_PASSWORD \
  --email admin@brewnet.dev \
  --admin
```

### 초기 설정 포인트

- SSH 포트를 호스트 22와 충돌하지 않도록 3022로 매핑
- `DISABLE_REGISTRATION=true`로 설정하면 관리자만 계정 생성 가능
- `REQUIRE_SIGNIN_VIEW=true`로 설정하면 로그인 없이 리포 열람 불가

---

## 3. Nextcloud

### 특징

- PHP로 작성된 자체호스팅 클라우드 스토리지 (AGPL-3.0 License)
- Google Drive/Dropbox 대체 — 파일 동기화, 공유, 협업
- 200+ 앱 확장: 캘린더, 연락처, 노트, 오피스 문서 편집
- WebDAV 프로토콜 지원
- 데스크톱/모바일 클라이언트 제공

### Docker Compose

```yaml
services:
  nextcloud:
    image: nextcloud:29-apache
    container_name: nextcloud
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_DB=nextcloud
      - POSTGRES_USER=nextcloud
      - POSTGRES_PASSWORD=${NC_DB_PASSWORD}
      - NEXTCLOUD_ADMIN_USER=admin
      - NEXTCLOUD_ADMIN_PASSWORD=${NC_ADMIN_PASSWORD}
      - NEXTCLOUD_TRUSTED_DOMAINS=localhost your.domain.com
      - REDIS_HOST=redis
    ports:
      - "8443:80"
    volumes:
      - nextcloud-data:/var/www/html
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - brewnet
      - brewnet-internal
```

### 첫 페이지 접속

```
http://localhost:8443
```

**환경변수로 admin 계정을 지정한 경우**: 자동 설치 완료 후 바로 파일 화면 표시.

**환경변수 미설정 시**: Installation Wizard가 표시되며 아래 항목 입력:
1. Admin 사용자명 / 비밀번호
2. Storage & Database → PostgreSQL 선택
3. DB 접속 정보 입력

### 계정 설정

**환경변수로 자동 생성 (권장)**:

```env
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=your-secure-password
```

이 두 변수를 **모두** 설정해야 작동한다. DB 관련 환경변수도 전부 설정되어 있어야 Installation Wizard를 건너뛴다.

**CLI로 추가 사용자 생성**:

```bash
docker exec -u www-data nextcloud php occ user:add username --display-name="Display Name"
# 비밀번호 입력 프롬프트 표시
```

### 초기 설정 포인트

- Redis 연결 필수 — 파일 잠금 방지 및 캐시 성능
- `NEXTCLOUD_TRUSTED_DOMAINS`에 접속할 도메인/IP를 반드시 등록
- 프로덕션에서는 apache 이미지 대신 fpm 이미지 + nginx 조합 권장
- Background jobs를 `cron`으로 변경: `docker exec -u www-data nextcloud php occ background:cron`

---

## 4. PostgreSQL 17

### 특징

- 세계에서 가장 진보된 오픈소스 관계형 DB (PostgreSQL License — BSD 계열)
- ACID 완전 지원, MVCC, JSON/JSONB 네이티브
- 풀텍스트 검색, GIS(PostGIS), 시계열 확장
- 논리/물리 복제, 파티셔닝
- Brewnet의 핵심 DB — Gitea, Nextcloud 등 모든 서비스가 공유

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: brewnet-postgresql
    environment:
      POSTGRES_USER: brewnet
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: brewnet_db
    volumes:
      - brewnet_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U brewnet"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - brewnet-internal
```

> **주의**: PostgreSQL 포트는 호스트에 노출하지 않는다. 내부 네트워크(`brewnet-internal`)에서만 접근 가능하며, 다른 컨테이너에서 `postgresql:5432`로 접속한다.

### 첫 접속

PostgreSQL은 웹 UI가 없다. 컨테이너 내부 CLI 또는 pgAdmin으로 접속:

```bash
# 컨테이너 내부 psql
docker exec -it brewnet-postgresql psql -U brewnet -d brewnet_db
```

### 계정 설정

**환경변수로 초기 설정**:

```env
POSTGRES_USER=brewnet          # 슈퍼유저
POSTGRES_PASSWORD=your-password
POSTGRES_DB=brewnet            # 초기 생성 DB
```

**다중 DB 초기화** (`init-db/01-init.sql`):

```sql
-- Gitea용 DB
CREATE USER gitea WITH PASSWORD 'gitea_password';
CREATE DATABASE gitea OWNER gitea;

-- Nextcloud용 DB
CREATE USER nextcloud WITH PASSWORD 'nc_password';
CREATE DATABASE nextcloud OWNER nextcloud;
```

`docker-entrypoint-initdb.d/`에 넣은 `.sql` 파일은 **최초 기동 시 1회만** 실행된다.

### 초기 설정 포인트

- Named volume(`brewnet_postgres_data`)을 사용하여 컨테이너 삭제 시 데이터 보존
- 내부 네트워크(`brewnet-internal`)에만 노출하여 외부 직접 접근 차단 — 호스트 포트 미노출
- pgAdmin 또는 Gitea/Nextcloud 등 같은 Docker 네트워크의 서비스에서 `postgresql:5432`로 접속

---

## 5. Redis

### 특징

- C로 작성된 인메모리 키-값 저장소 (BSD-3 License)
- 세션 스토리지, 캐시, 메시지 큐, Pub/Sub
- 단일 스레드 이벤트 루프 — 단순하고 빠름 (초당 10만+ 연산)
- Nextcloud 파일 잠금, Authelia 세션 등 다수 서비스가 의존
- RDB + AOF 영속성 지원

### Docker Compose

```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: brewnet-redis
    volumes:
      - brewnet_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    networks:
      - brewnet-internal
```

> **주의**: Redis 포트는 호스트에 노출하지 않는다. 내부 네트워크(`brewnet-internal`)에서만 접근 가능하며, 다른 컨테이너에서 `redis:6379`로 접속한다.

### 첫 접속

Redis는 웹 UI가 없다. CLI로 접속:

```bash
docker exec -it redis redis-cli -a YOUR_PASSWORD
# 또는
docker exec -it redis redis-cli
AUTH YOUR_PASSWORD
PING
# → PONG
```

### 계정 설정

Redis는 전통적인 사용자 계정 시스템이 없다. 기본은 단일 패스워드:

```
--requirepass YOUR_PASSWORD
```

Redis 6+에서 ACL (Access Control List)을 사용하면 다중 사용자 가능:

```bash
ACL SETUSER nextcloud on >nc_password ~nextcloud:* +@all
ACL SETUSER readonly on >read_password ~* +@read
```

### 초기 설정 포인트

- 프로덕션에서는 `--maxmemory`와 `--maxmemory-policy allkeys-lru` 설정 권장 — 메모리 무한 증가 방지
- 프로덕션에서는 `requirepass` 설정 권장 — 내부 네트워크 전용이라도 보안 강화
- 내부 네트워크(`brewnet-internal`)에서만 접근 가능 — 호스트 포트 미노출

---

## 6. pgAdmin 4

### 특징

- Python으로 작성된 PostgreSQL 전용 웹 관리 도구 (PostgreSQL License)
- SQL 에디터, 쿼리 실행, 실행 계획 시각화
- 테이블/인덱스/뷰/함수 GUI 관리
- 백업/복원 (pg_dump, pg_restore 내장)
- 서버 그룹으로 다수 DB 인스턴스 관리

### Docker Compose

```yaml
services:
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_EMAIL:-admin@brewnet.dev}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD}
    ports:
      - "5050:80"
    volumes:
      - pgadmin-data:/var/lib/pgadmin
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - brewnet
      - brewnet-internal
```

### 첫 페이지 접속

```
http://localhost:5050
```

로그인 화면이 표시된다.

### 계정 설정

**환경변수로 초기 관리자 설정 (필수)**:

```env
PGADMIN_DEFAULT_EMAIL=admin@brewnet.dev
PGADMIN_DEFAULT_PASSWORD=your-secure-password
```

이 두 변수는 **컨테이너 최초 기동 시 필수**다. 이후 웹 UI에서 비밀번호 변경 가능.

**로그인 후 DB 서버 등록**:

1. 좌측 패널 → "Add New Server" 클릭
2. **General** 탭: Name → `Brewnet PostgreSQL`
3. **Connection** 탭:
   - Host: `postgres` (Docker 컨테이너명)
   - Port: `5432`
   - Username: `brewnet`
   - Password: DB 비밀번호

### 초기 설정 포인트

- `PGADMIN_CONFIG_SERVER_MODE=False` → 로그인 건너뛰기 (로컬 개발용)
- `PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED=False` → 마스터 패스워드 비활성화 (개발용)
- `servers.json` 마운트로 DB 서버 자동 등록 가능

---

## 7. Jellyfin

### 특징

- C#/.NET으로 작성된 오픈소스 미디어 서버 (GPL-2.0 License)
- Plex/Emby의 완전한 무료 대안 — 프리미엄 잠금 기능 없음
- 영화, TV, 음악, 사진, 라이브 TV/DVR
- 하드웨어 트랜스코딩 지원 (Intel QSV, NVIDIA NVENC, VAAPI)
- 다양한 클라이언트: 웹, Android, iOS, Roku, Fire TV, Kodi
- DLNA 지원

### Docker Compose

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    user: "1000:1000"
    ports:
      - "8096:8096"       # Web UI
      - "7359:7359/udp"   # Client discovery
    volumes:
      - jellyfin-config:/config
      - jellyfin-cache:/cache
      - /path/to/media:/media:ro    # 미디어 라이브러리
    environment:
      - TZ=Asia/Seoul
    networks:
      - brewnet
```

### 첫 페이지 접속

```
http://localhost:8096
```

최초 접속 시 **Setup Wizard**가 자동 표시된다.

### 계정 설정 (Setup Wizard)

Setup Wizard 순서:

1. **Welcome** → 언어 선택 (한국어 지원)
2. **User** → 관리자 사용자명/비밀번호 설정
3. **Media Libraries** → 미디어 폴더 추가 (Movies, TV Shows, Music 등)
4. **Metadata** → 메타데이터 언어/국가 선택
5. **Remote Access** → 원격 접근 허용 여부
6. **Finish** → 완료

Jellyfin에는 기본 비밀번호가 없다. Wizard에서 직접 생성한다.

**추가 사용자 생성**: Dashboard → Users → `+` 버튼

### 초기 설정 포인트

- 미디어 폴더는 `:ro` (읽기 전용)로 마운트하는 것이 안전
- 하드웨어 트랜스코딩은 `--device=/dev/dri:/dev/dri` 추가 (Intel GPU)
- DLNA를 사용하려면 `--net=host` 필요 (Docker bridge에서는 작동 안 함)
- 포트 7359/udp는 LAN 내 클라이언트 자동 발견용

---

## 8. OpenSSH (SSH Server + SFTP)

### 특징

- 업계 표준 원격 접근 프로토콜 (BSD License)
- 키 기반 인증 — 패스워드보다 안전
- SFTP 내장 — 별도 FTP 서버 불필요
- 포트 포워딩, 터널링 지원
- Brewnet 컨테이너들의 원격 관리 진입점

### Docker Compose

```yaml
services:
  openssh-server:
    image: linuxserver/openssh-server:latest
    container_name: brewnet-openssh-server
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
      - PASSWORD_ACCESS=false       # 키 인증만 허용 (true로 변경 시 패스워드 인증 가능)
      - USER_NAME=admin
    ports:
      - "2222:2222"
    volumes:
      - brewnet_ssh_config:/config
    networks:
      - brewnet
```

> **참고**: Brewnet은 `USER_PASSWORD` 환경변수를 설정하지 않는다. `PASSWORD_ACCESS` 플래그만으로 패스워드 인증 허용 여부를 제어하며, 사용자 이름은 wizard에서 설정한 admin username이 전파된다.

### 첫 접속

```bash
# SSH
ssh brewnet@localhost -p 2222

# SFTP
sftp -P 2222 brewnet@localhost
```

### 계정 설정

**환경변수로 초기 사용자 설정**:

```env
USER_NAME=admin                # wizard에서 설정한 admin username
PASSWORD_ACCESS=false          # true: 패스워드 허용, false: 키 인증만
```

**SSH 키 등록 (권장)**:

```bash
# 호스트에서 키 생성
ssh-keygen -t ed25519 -C "brewnet@home"

# 공개키를 컨테이너에 복사
docker cp ~/.ssh/id_ed25519.pub ssh-server:/config/.ssh/authorized_keys
```

키 등록 후 `PASSWORD_ACCESS=false`로 전환하여 패스워드 로그인 비활성화.

### 초기 설정 포인트

- 호스트 SSH(22)와 충돌하지 않도록 2222 포트 사용
- 패스워드 인증은 초기 설정용, 프로덕션에서는 키 인증만 허용
- SFTP는 SSH 위에서 작동하므로 별도 컨테이너 불필요
- `SUDO_ACCESS=true`는 관리 작업 시 필요하지만 보안 주의

---

## 9. docker-mailserver

### 특징

- 컨테이너 하나에 완전한 메일 스택 (MIT License)
- Postfix (SMTP) + Dovecot (IMAP/POP3) + Rspamd (스팸 필터) + ClamAV (바이러스)
- DKIM, SPF, DMARC 지원
- Fail2Ban 내장 (브루트포스 차단)
- Let's Encrypt 인증서 연동
- **웹 UI 없음** — 모든 관리를 CLI로 수행

### Docker Compose

```yaml
services:
  mailserver:
    image: ghcr.io/docker-mailserver/docker-mailserver:latest
    container_name: mailserver
    hostname: mail.brewnet.dev
    ports:
      - "25:25"       # SMTP
      - "465:465"     # SMTP SSL
      - "587:587"     # SMTP STARTTLS
      - "993:993"     # IMAP SSL
    volumes:
      - mail-data:/var/mail
      - mail-state:/var/mail-state
      - mail-logs:/var/log/mail
      - mail-config:/tmp/docker-mailserver
      - /etc/localtime:/etc/localtime:ro
    environment:
      - ENABLE_RSPAMD=1
      - ENABLE_CLAMAV=1
      - ENABLE_FAIL2BAN=1
      - SSL_TYPE=letsencrypt
    cap_add:
      - NET_ADMIN     # Fail2Ban용
    networks:
      - brewnet
```

### 첫 접속

docker-mailserver에는 **웹 UI가 없다**. 메일 클라이언트(Thunderbird, Outlook 등)로 접속:

- IMAP: `mail.brewnet.dev:993` (SSL)
- SMTP: `mail.brewnet.dev:587` (STARTTLS) 또는 `465` (SSL)

### 계정 설정

**컨테이너 시작 후 CLI로 계정 생성** (최초 120초 내 권장):

```bash
# 이메일 계정 생성
docker exec -it mailserver setup email add admin@brewnet.dev
# → 비밀번호 입력 프롬프트

# 별칭 추가
docker exec -it mailserver setup alias add info@brewnet.dev admin@brewnet.dev

# 계정 목록 확인
docker exec -it mailserver setup email list

# DKIM 키 생성 (DNS에 등록)
docker exec -it mailserver setup config dkim
```

### 초기 설정 포인트

- DNS 레코드 필수: MX, SPF, DKIM, DMARC — 없으면 수신/발신 실패
- 많은 ISP가 포트 25를 차단함 — 사전 확인 필요
- IP 평판이 나쁘면 메일이 스팸 처리됨 — 클린 IP 필요
- SSL 인증서는 Traefik의 Let's Encrypt와 공유하거나 별도 발급
- ClamAV는 메모리를 ~1GB 사용하므로 리소스가 부족하면 `ENABLE_CLAMAV=0`

---

## 10. FileBrowser

### 특징

- Go로 작성된 경량 웹 파일 매니저 (Apache-2.0 License)
- 웹 브라우저로 파일 업로드/다운로드/편집/삭제
- 다중 사용자 지원 (사용자별 권한 분리)
- 코드 에디터 내장 (텍스트 파일 직접 편집)
- 공유 링크 생성
- 셸 명령어 실행 기능

### Docker Compose

```yaml
services:
  filebrowser:
    image: filebrowser/filebrowser:latest
    container_name: brewnet-filebrowser
    ports:
      - "8085:80"
    volumes:
      - brewnet_filebrowser_data:/srv
      - brewnet_filebrowser_db:/database
    networks:
      - brewnet
```

### 첫 페이지 접속

```
http://localhost:8085
```

로그인 화면이 표시된다.

### 계정 설정

**기본 관리자 계정**:

- Username: `admin`
- Password: **최초 기동 시 콘솔 로그에 랜덤 생성되어 출력됨**

```bash
# 초기 비밀번호 확인
docker logs filebrowser | grep "password"
# → Generated random admin password for quick setup: xOGWRHB0t8fq
```

> **중요**: 이 비밀번호는 **한 번만 표시**된다. 놓치면 DB 파일을 삭제하고 재시작해야 한다.

로그인 후 Settings → Profile 에서 비밀번호 변경.

**추가 사용자 생성**: Settings → User Management → New User

### 초기 설정 포인트

- `/srv`에 마운트한 디렉토리가 FileBrowser의 루트가 됨
- 각 사용자별 Scope(접근 가능 디렉토리)를 제한 가능
- 구버전(~v2.30)은 기본 비밀번호가 `admin/admin`이었으나, 최신 버전은 랜덤 생성
- `filebrowser.db` 파일에 모든 설정과 사용자 정보가 저장됨

---

## 11. 포트 요약

| 서비스 | 포트 | 프로토콜 | 접속 URL / 명령 |
|--------|------|----------|----------------|
| **Traefik** Dashboard | 8080 | HTTP | `http://localhost:8080` |
| **Traefik** Web | 80, 443 | HTTP/S | — |
| **Gitea** Web | 3000 | HTTP | `http://localhost:3000` |
| **Gitea** SSH | 3022 | SSH | `ssh git@localhost -p 3022` |
| **Nextcloud** | 8443 | HTTP | `http://localhost:8443` |
| **PostgreSQL** | 5432 (internal) | TCP | `docker exec -it brewnet-postgresql psql -U brewnet` |
| **Redis** | 6379 (internal) | TCP | `docker exec -it brewnet-redis redis-cli` |
| **pgAdmin** | 5050 | HTTP | `http://localhost:5050` |
| **Jellyfin** | 8096 | HTTP | `http://localhost:8096` |
| **SSH / SFTP** | 2222 | SSH | `ssh brewnet@localhost -p 2222` |
| **Mail** SMTP | 25, 465, 587 | TCP | 메일 클라이언트 설정 |
| **Mail** IMAP | 993 | TCP | 메일 클라이언트 설정 |
| **FileBrowser** | 8085 | HTTP | `http://localhost:8085` |

### 기본 계정 요약

| 서비스 | 계정 방식 | 기본값 |
|--------|----------|--------|
| **Traefik** | BasicAuth 미들웨어 | 기본 계정 없음 (직접 설정) |
| **Gitea** | 웹 Wizard 또는 CLI | 첫 페이지에서 관리자 생성 |
| **Nextcloud** | 환경변수 또는 웹 Wizard | `NEXTCLOUD_ADMIN_USER/PASSWORD` |
| **PostgreSQL** | 환경변수 | `POSTGRES_USER/PASSWORD` |
| **Redis** | `requirepass` 커맨드 | 기본 패스워드 없음 (직접 설정) |
| **pgAdmin** | 환경변수 (필수) | `PGADMIN_DEFAULT_EMAIL/PASSWORD` |
| **Jellyfin** | 웹 Setup Wizard | 기본 계정 없음 (Wizard에서 생성) |
| **SSH** | 환경변수 | `USER_NAME` + 키 인증 (`PASSWORD_ACCESS`로 제어) |
| **docker-mailserver** | CLI (`setup email add`) | 기본 계정 없음 (CLI로 생성) |
| **FileBrowser** | 자동 생성 | `admin` / 로그에 출력된 랜덤 비밀번호 |

---

*Brewnet Server Setup Manual v1.1.0 — MIT License*
