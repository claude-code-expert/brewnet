# HomeHub - PRD 검증 및 보완 사항

## 1. 핵심 요구사항 검증

### 1.1 사용자 시나리오 (Must-Have)

```
[MVP 핵심 플로우]

1. CLI로 HomeHub 설치
   ↓
2. 홈서버에 Git 서버 구축
   ↓
3. 외부에서 Git Push
   ↓
4. 자동으로 빌드 & 배포 (환경에 맞게)
   ↓
5. 외부에서 웹/파일/DB 접근 (인증 후)
```

### 1.2 기존 PRD 대비 검증 결과

| 요구사항 | 기존 PRD | 상태 | 조치 |
|---------|---------|:----:|------|
| CLI로 설치 | ✅ 있음 | OK | - |
| Docker 관리 | ✅ 있음 | OK | - |
| 외부 접근 (IP+포트) | ✅ 있음 | OK | - |
| 도메인/SSL | ✅ 있음 | OK | - |
| 서브도메인 관리 | ✅ 있음 | OK | - |
| 런타임 환경 | ✅ 있음 | OK | - |
| ACL/보안 | ✅ 있음 | OK | - |
| **자체 Git 서버** | ❌ 없음 | **추가 필요** | Git Server 모듈 신규 |
| **Git Push → 자동 배포** | ⚠️ 부분적 | **보완 필요** | 로컬 CI/CD 강화 |
| **파일 매니저** | ❌ 없음 | **추가 필요** | File Manager 모듈 신규 |
| **DB 웹 관리** | ❌ 없음 | **추가 필요** | Database Manager 모듈 신규 |
| **통합 인증** | ⚠️ 부분적 | **보완 필요** | SSO 시스템 강화 |
| **FTP/SFTP 서버** | ❌ 없음 | **추가 필요** | File Manager에 포함 |
| **네트워크 설정 가이드** | ❌ 없음 | **추가 필요** | Network 모듈 신규 |

### 1.3 최종 검증 결과 요약

| 항목 | 상태 | 비고 |
|------|:----:|------|
| CLI로 HomeHub 설치 | ✅ | curl \| bash |
| 자체 Git 서버 (Gitea) | ✅ | 본 문서에서 추가 |
| 외부에서 Git Push | ✅ | SSH 포트 2222 |
| 환경별 자동 빌드/배포 | ✅ | 런타임 감지 + Dockerfile 생성 |
| 서버 리스타트 | ✅ | Deploy 파이프라인에 포함 |
| IP+포트/도메인 접근 | ✅ | DDNS + SSL + nginx |
| 파일 웹 접근 | ✅ | File Manager 모듈 |
| DB 웹 관리 | ✅ | Database Manager 모듈 |
| 통합 인증 | ✅ | SSO 시스템 |
| 서브도메인 관리 | ✅ | CLI 및 Dashboard |

---

## 2. 수정된 MVP 우선순위

### 기존 MVP vs 수정된 MVP

```
[기존 MVP - 문제점]
├── Docker 관리 중심
├── GitHub 외부 의존
├── 파일/DB 관리 없음
├── 네트워크 설정 가이드 없음
└── "진짜 홈서버"로 부족

[수정된 MVP - 자체 완결형]
├── 외부 접근 우선 (네트워크 가이드 포함)
├── 파일 관리 (웹 + SFTP)
├── 자체 Git 서버 (외부 의존 제거)
├── Git Push → 자동 배포
├── DB 관리 (웹 UI)
└── 통합 인증
```

### 수정된 Phase 구성 (MVP 중심 재조정)

| Phase | 기간 | 핵심 목표 | 주요 기능 |
|-------|------|----------|----------|
| **Phase 1** | 2주 | **외부 접근 가능한 홈서버** | CLI 설치, 네트워크 설정, DDNS, SSL, 파일 매니저 기본 |
| **Phase 2** | 2주 | **Git 기반 배포 시스템** | Git 서버, 자동 배포 파이프라인 |
| **Phase 3** | 2주 | **데이터 관리** | DB 관리자, 통합 인증 강화 |
| **Phase 4** | 2주 | **운영 도구** | Docker GUI, 모니터링 |
| **Phase 5** | 2주 | **대시보드** | 웹 UI 통합, Pro 기능 |

---

## 3. 신규 모듈 상세 스펙

### 3.1 Network Check 모듈 (신규)

#### 개요

외부 접근을 위한 네트워크 설정 진단 및 가이드 제공. 홈서버 구축의 가장 첫 번째 장벽인 포트포워딩/방화벽 설정을 쉽게 해결.

#### CLI 명령어

```bash
# 네트워크 진단
homehub network check                  # 전체 네트워크 상태 진단
homehub network check --port 80        # 특정 포트 외부 접근 테스트
homehub network check --all            # 모든 필수 포트 테스트

# 공유기 가이드
homehub network guide                  # 공유기별 포트포워딩 가이드
homehub network guide --router iptime  # 특정 공유기 가이드
homehub network guide --router asus

# 방화벽 설정
homehub network firewall status        # 방화벽 상태
homehub network firewall allow 80      # 포트 허용
homehub network firewall allow 443
homehub network firewall allow 2222    # Git SSH

# UPnP 자동 설정 (지원되는 공유기)
homehub network upnp enable            # UPnP로 자동 포트포워딩
homehub network upnp status
homehub network upnp disable
```

#### 진단 출력 예시

```bash
$ homehub network check

🔍 Network Diagnostics
─────────────────────────────────────────
Public IP:    123.45.67.89
Local IP:     192.168.1.100
Gateway:      192.168.1.1
Router:       IPTIME (detected)

📡 Port Check Results
─────────────────────────────────────────
Port 80  (HTTP)  : ❌ Blocked - 포트포워딩 필요
Port 443 (HTTPS) : ❌ Blocked - 포트포워딩 필요
Port 2222 (SSH)  : ❌ Blocked - 포트포워딩 필요

⚠️  외부 접근이 차단되어 있습니다.

💡 해결 방법:
   1. homehub network guide --router iptime 실행
   2. 또는 homehub network upnp enable 시도

Run 'homehub network guide' for step-by-step instructions.
```

#### 공유기별 가이드 지원

| 공유기 | 자동 감지 | UPnP | 가이드 |
|--------|:--------:|:----:|:------:|
| IPTIME | ✅ | ✅ | ✅ |
| ASUS | ✅ | ✅ | ✅ |
| TP-Link | ✅ | ✅ | ✅ |
| Netgear | ✅ | ✅ | ✅ |
| 공유기 없음 (직접 연결) | ✅ | - | ✅ |
| 기타 | ❌ | ⚠️ | 일반 가이드 |

#### 필수 포트 목록

| 포트 | 용도 | 필수 여부 |
|------|------|:--------:|
| 80 | HTTP (SSL 발급용) | ✅ |
| 443 | HTTPS | ✅ |
| 2222 | Git SSH | ✅ |
| 3000 | Dashboard (내부) | ❌ |
| 8080 | 앱 (선택적) | ❌ |

---

### 3.2 Git Server 모듈

#### 개요

홈서버 내에서 동작하는 자체 Git 서버. 외부 GitHub 의존 없이 완전한 버전 관리 및 CI/CD 파이프라인 구축.

#### 기술 선택

| 옵션 | 장점 | 단점 | 선택 |
|------|------|------|:----:|
| Gitea | 경량, Go 단일 바이너리, 활발한 개발 | - | ✅ |
| Gogs | 매우 경량 | 개발 느림 | - |
| GitLab | 기능 풍부 | 리소스 많이 사용 | - |
| Soft Serve | 초경량 TUI | 웹 UI 없음 | - |

#### CLI 명령어

```bash
# Git 서버 설치 및 관리
homehub git install                    # Gitea 자동 설치
homehub git status                     # Git 서버 상태
homehub git start                      # Git 서버 시작
homehub git stop                       # Git 서버 중지

# 저장소 관리
homehub git repo list                  # 저장소 목록
homehub git repo create <name>         # 새 저장소 생성
homehub git repo delete <name>         # 저장소 삭제
homehub git repo clone-url <name>      # Clone URL 표시

# 사용자 관리
homehub git user list                  # 사용자 목록
homehub git user add <username>        # 사용자 추가
homehub git user remove <username>     # 사용자 삭제

# 배포 연동
homehub git hook setup <repo> --app <app>   # 자동 배포 설정
homehub git hook remove <repo>              # 배포 연동 해제
```

#### 자동 배포 파이프라인

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Git Push → Auto Deploy Flow                       │
└─────────────────────────────────────────────────────────────────────┘

[개발자 PC]                    [HomeHub 서버]
     │                              │
     │  git push origin main        │
     │ ────────────────────────────>│
     │                              │
     │                    ┌─────────▼─────────┐
     │                    │   Gitea Server    │
     │                    │   (post-receive)  │
     │                    └─────────┬─────────┘
     │                              │
     │                    ┌─────────▼─────────┐
     │                    │  HomeHub Webhook  │
     │                    │  /api/deploy/hook │
     │                    └─────────┬─────────┘
     │                              │
     │                    ┌─────────▼─────────┐
     │                    │  Build Pipeline   │
     │                    │  - Detect runtime │
     │                    │  - Install deps   │
     │                    │  - Build          │
     │                    └─────────┬─────────┘
     │                              │
     │                    ┌─────────▼─────────┐
     │                    │  Deploy & Restart │
     │                    │  - Stop old       │
     │                    │  - Start new      │
     │                    │  - Health check   │
     │                    └─────────┬─────────┘
     │                              │
     │      Deploy Complete         │
     │ <────────────────────────────│
     │                              │
```

#### 외부 접근 URL

| 서비스 | URL 형태 | 포트 |
|--------|----------|:----:|
| Git 웹 UI | `https://git.mydomain.com` | 443 |
| Git SSH | `ssh://git@mydomain.com:2222` | 2222 |
| Git HTTPS | `https://git.mydomain.com/user/repo.git` | 443 |

#### 설정 파일

```yaml
# ~/.homehub/git-server.yml
server:
  type: gitea
  port: 3000
  ssh_port: 2222
  domain: git.myserver.local
  
storage:
  repos: ~/.homehub/git/repos
  lfs: ~/.homehub/git/lfs
  
resources:
  memory: 512M
  cpu: 0.5

backup:
  enabled: true
  schedule: "0 2 * * *"  # 매일 2시
  retention: 7  # 7일 보관
```

#### 데이터베이스 스키마 추가

```sql
-- Git 저장소
CREATE TABLE git_repositories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    gitea_id INTEGER,
    default_branch TEXT DEFAULT 'main',
    
    -- 배포 연동
    linked_app_id TEXT REFERENCES apps(id),
    auto_deploy BOOLEAN DEFAULT FALSE,
    deploy_branch TEXT DEFAULT 'main',
    
    -- 통계
    size_kb INTEGER DEFAULT 0,
    commit_count INTEGER DEFAULT 0,
    last_push_at DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Git 사용자
CREATE TABLE git_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    gitea_id INTEGER,
    ssh_keys TEXT,  -- JSON array
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 배포 트리거 로그
CREATE TABLE deploy_triggers (
    id TEXT PRIMARY KEY,
    repo_id TEXT REFERENCES git_repositories(id),
    commit_hash TEXT,
    commit_message TEXT,
    pusher TEXT,
    branch TEXT,
    
    deploy_id TEXT REFERENCES deployments(id),
    status TEXT,  -- pending, building, success, failed
    
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### 3.3 File Manager 모듈

#### 개요

웹 브라우저에서 서버 파일에 접근하고 관리할 수 있는 파일 매니저. SFTP/WebDAV도 지원하여 다양한 방식으로 파일 전송 가능.

#### 기능 목록

| 기능 | Free | Pro | 설명 |
|------|:----:|:---:|------|
| 웹 파일 브라우저 | ✅ | ✅ | 폴더/파일 탐색 |
| 파일 업로드 | ✅ | ✅ | 드래그 앤 드롭, 다중 파일 |
| 파일 다운로드 | ✅ | ✅ | 단일/ZIP 압축 |
| 폴더 생성/삭제 | ✅ | ✅ | 기본 조작 |
| 파일 편집 | ✅ | ✅ | 텍스트 파일 편집 (Monaco) |
| 파일 검색 | ❌ | ✅ | 이름/내용 검색 |
| 공유 링크 | ❌ | ✅ | 만료일 설정 가능 |
| SFTP 서버 | ✅ | ✅ | SSH 기반 파일 전송 |
| WebDAV | ❌ | ✅ | HTTP 기반 파일 시스템 |
| 버전 관리 | ❌ | ✅ | 파일 히스토리 |
| 휴지통 | ❌ | ✅ | 삭제 복구 |

#### 외부 접근 URL

| 접근 방식 | URL/주소 | 인증 |
|----------|----------|:----:|
| 웹 UI | `https://files.mydomain.com` | SSO |
| SFTP | `sftp://mydomain.com:2222` | SSH Key / Password |
| WebDAV (Pro) | `https://mydomain.com/webdav` | SSO |
| 공유 링크 | `https://mydomain.com/share/<token>` | 토큰 (비밀번호 선택) |

#### CLI 명령어

```bash
# 파일 매니저 설정
homehub files config                   # 설정 보기
homehub files config --root /data      # 루트 디렉토리 변경
homehub files config --max-upload 100M # 최대 업로드 크기

# SFTP 서버
homehub files sftp status              # SFTP 상태
homehub files sftp enable              # SFTP 활성화
homehub files sftp disable             # SFTP 비활성화
homehub files sftp port 2222           # 포트 변경

# WebDAV (Pro)
homehub files webdav enable            # WebDAV 활성화
homehub files webdav disable           # WebDAV 비활성화

# 공유 링크 (Pro)
homehub files share create /path/to/file --expires 7d
homehub files share list
homehub files share revoke <share-id>
```

#### UI 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│  📁 File Manager                                    🔍 Search  ⚙️   │
├────────────────────┬────────────────────────────────────────────────┤
│                    │  📍 /home/user/projects                        │
│  Quick Access      │  ─────────────────────────────────────────────│
│  ├── 🏠 Home       │                                                │
│  ├── 📂 Projects   │  [⬆️ Upload] [📁 New Folder] [↻ Refresh]       │
│  ├── 🗄️ Backups    │                                                │
│  └── 📤 Shared     │  ┌────────────────────────────────────────────┐│
│                    │  │ ☐ │ Name          │ Size   │ Modified      ││
│  Storage           │  ├───┼───────────────┼────────┼───────────────┤│
│  ████████░░ 80%    │  │ ☐ │ 📁 my-app     │ -      │ 2024-01-15    ││
│  80GB / 100GB      │  │ ☐ │ 📁 backups    │ -      │ 2024-01-14    ││
│                    │  │ ☐ │ 📄 readme.md  │ 2.3 KB │ 2024-01-15    ││
│                    │  │ ☐ │ 📄 config.yml │ 1.1 KB │ 2024-01-15    ││
│                    │  │ ☐ │ 🖼️ logo.png   │ 45 KB  │ 2024-01-10    ││
│                    │  └────────────────────────────────────────────┘│
│                    │                                                │
│                    │  Selected: 0 items           [📥] [🗑️] [✏️]   │
└────────────────────┴────────────────────────────────────────────────┘
```

#### 설정 파일

```yaml
# ~/.homehub/file-manager.yml
storage:
  root: /home/user/data
  max_upload_size: 100M
  allowed_extensions: []  # 비어있으면 전체 허용
  denied_extensions: [exe, bat, sh]

sftp:
  enabled: true
  port: 2222
  
webdav:
  enabled: false
  path: /webdav

sharing:
  enabled: true
  default_expiry: 7d
  max_expiry: 30d
  
trash:
  enabled: true
  retention: 30d  # 30일 후 자동 삭제
  
versioning:
  enabled: true
  max_versions: 10
```

#### API 엔드포인트

```typescript
// 파일 API
GET    /api/files?path=/path          // 디렉토리 목록
GET    /api/files/download?path=/path // 파일 다운로드
POST   /api/files/upload              // 파일 업로드
POST   /api/files/mkdir               // 폴더 생성
DELETE /api/files?path=/path          // 파일/폴더 삭제
PUT    /api/files/move                // 이동/이름변경
PUT    /api/files/copy                // 복사
GET    /api/files/search?q=keyword    // 검색 (Pro)

// 공유 API (Pro)
POST   /api/files/share               // 공유 링크 생성
GET    /api/files/share               // 공유 목록
DELETE /api/files/share/:id           // 공유 취소
GET    /api/share/:token              // 공유 링크 접근 (공개)

// 편집 API
GET    /api/files/content?path=/path  // 파일 내용 읽기
PUT    /api/files/content             // 파일 내용 저장
```

#### 데이터베이스 스키마 추가

```sql
-- 파일 공유 링크
CREATE TABLE file_shares (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_by TEXT,
    
    -- 설정
    password_hash TEXT,
    expires_at DATETIME,
    max_downloads INTEGER,
    download_count INTEGER DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 파일 버전 (Pro)
CREATE TABLE file_versions (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    version INTEGER NOT NULL,
    size_bytes INTEGER,
    checksum TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(path, version)
);

-- 휴지통 (Pro)
CREATE TABLE file_trash (
    id TEXT PRIMARY KEY,
    original_path TEXT NOT NULL,
    trash_path TEXT NOT NULL,
    size_bytes INTEGER,
    
    deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);
```

---

### 3.4 Database Manager 모듈

#### 개요

홈서버에서 운영하는 데이터베이스를 웹 UI로 관리. 테이블 구조 확인, 데이터 조회/수정, 쿼리 실행, 백업/복원 기능 제공.

#### 지원 데이터베이스

| DB | 관리 UI 스타일 | 설치 | 기본 포트 |
|----|---------------|:----:|:--------:|
| MySQL/MariaDB | phpMyAdmin | Docker | 3306 |
| PostgreSQL | pgAdmin | Docker | 5432 |
| MongoDB | Mongo Express | Docker | 27017 |
| Redis | RedisInsight | Docker | 6379 |
| SQLite | 내장 뷰어 | - | - |

#### 외부 접근 URL

| 서비스 | URL | 인증 |
|--------|-----|:----:|
| DB 관리 UI | `https://db.mydomain.com` | SSO |
| MySQL 직접 연결 | `mydomain.com:3306` | DB 계정 |
| PostgreSQL 직접 연결 | `mydomain.com:5432` | DB 계정 |

> ⚠️ 보안 주의: DB 직접 연결 포트는 ACL로 IP 제한 필수

#### CLI 명령어

```bash
# DB 인스턴스 관리
homehub db list                        # 설치된 DB 목록
homehub db install mysql               # MySQL 설치 (Docker)
homehub db install postgres            # PostgreSQL 설치
homehub db install mongodb             # MongoDB 설치
homehub db install redis               # Redis 설치

# DB 제어
homehub db start mysql                 # DB 시작
homehub db stop mysql                  # DB 중지
homehub db restart mysql               # DB 재시작
homehub db logs mysql                  # DB 로그

# 데이터베이스/사용자 관리
homehub db create <db-name> --type mysql
homehub db drop <db-name>
homehub db user add <username> --db <db-name> --password <pass>
homehub db user remove <username>

# 백업/복원
homehub db backup <db-name>            # 백업 생성
homehub db backup <db-name> --schedule "0 2 * * *"  # 자동 백업
homehub db restore <db-name> <backup-file>
homehub db backups list                # 백업 목록

# 연결 정보
homehub db connect <db-name>           # 연결 문자열 출력
homehub db shell <db-name>             # DB CLI 접속
```

#### UI 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│  🗄️ Database Manager                              + Add Database    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Instances                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Type       │ Name        │ Port  │ Status  │ Actions           ││
│  ├────────────┼─────────────┼───────┼─────────┼───────────────────┤│
│  │ 🐬 MySQL   │ main-db     │ 3306  │ ● Run   │ [Open] [⏹] [⚙️]  ││
│  │ 🐘 Postgres│ analytics   │ 5432  │ ● Run   │ [Open] [⏹] [⚙️]  ││
│  │ 🍃 MongoDB │ logs        │ 27017 │ ○ Stop  │ [Open] [▶] [⚙️]  ││
│  │ 🔴 Redis   │ cache       │ 6379  │ ● Run   │ [Open] [⏹] [⚙️]  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  🐬 MySQL: main-db                                    ← Back        │
├────────────────────┬────────────────────────────────────────────────┤
│                    │                                                │
│  Databases         │  Tables in `myapp`                             │
│  ├── 📁 myapp      │  ┌────────────────────────────────────────────┐│
│  ├── 📁 wordpress  │  │ Table      │ Rows   │ Size   │ Engine     ││
│  └── 📁 nextcloud  │  ├────────────┼────────┼────────┼────────────┤│
│                    │  │ users      │ 1,234  │ 2.3 MB │ InnoDB     ││
│  [+ New Database]  │  │ posts      │ 45,678 │ 156 MB │ InnoDB     ││
│                    │  │ comments   │ 12,345 │ 8.9 MB │ InnoDB     ││
│                    │  │ sessions   │ 89     │ 128 KB │ MEMORY     ││
│                    │  └────────────────────────────────────────────┘│
│                    │                                                │
│                    │  [📊 Structure] [📄 Data] [🔍 Query] [💾 Export]│
└────────────────────┴────────────────────────────────────────────────┘
```

#### Query Editor UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔍 Query Editor                        Database: myapp ▼    [▶ Run]│
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ SELECT u.name, COUNT(p.id) as post_count                        ││
│  │ FROM users u                                                     ││
│  │ LEFT JOIN posts p ON u.id = p.user_id                           ││
│  │ GROUP BY u.id                                                    ││
│  │ ORDER BY post_count DESC                                         ││
│  │ LIMIT 10;                                                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│  ───────────────────────────────────────────────────────────────────│
│  Results (10 rows, 23ms)                        [📥 Export CSV]     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ name           │ post_count                                      ││
│  ├────────────────┼─────────────────────────────────────────────────┤│
│  │ John Doe       │ 156                                             ││
│  │ Jane Smith     │ 142                                             ││
│  │ Bob Wilson     │ 98                                              ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

#### 설정 파일

```yaml
# ~/.homehub/database.yml
instances:
  - name: main-db
    type: mysql
    version: "8.0"
    port: 3306
    data_dir: ~/.homehub/db/mysql
    memory: 512M
    
  - name: analytics
    type: postgres
    version: "16"
    port: 5432
    data_dir: ~/.homehub/db/postgres
    memory: 256M

backup:
  enabled: true
  schedule: "0 2 * * *"
  retention: 7
  storage: ~/.homehub/backups/db
  
  # 원격 백업 (Pro)
  remote:
    enabled: false
    type: s3
    bucket: my-backups
```

#### API 엔드포인트

```typescript
// 인스턴스 관리
GET    /api/db/instances              // DB 인스턴스 목록
POST   /api/db/instances              // DB 설치
DELETE /api/db/instances/:name        // DB 삭제
POST   /api/db/instances/:name/start  // DB 시작
POST   /api/db/instances/:name/stop   // DB 중지

// 데이터베이스/테이블
GET    /api/db/:instance/databases    // 데이터베이스 목록
POST   /api/db/:instance/databases    // 데이터베이스 생성
DELETE /api/db/:instance/databases/:db
GET    /api/db/:instance/:db/tables   // 테이블 목록
GET    /api/db/:instance/:db/tables/:table  // 테이블 구조
GET    /api/db/:instance/:db/tables/:table/data  // 테이블 데이터

// 쿼리 실행
POST   /api/db/:instance/query        // SQL 쿼리 실행

// 백업
GET    /api/db/backups                // 백업 목록
POST   /api/db/:instance/backup       // 백업 생성
POST   /api/db/:instance/restore      // 백업 복원

// 사용자 관리
GET    /api/db/:instance/users        // 사용자 목록
POST   /api/db/:instance/users        // 사용자 추가
DELETE /api/db/:instance/users/:user  // 사용자 삭제
```

#### 데이터베이스 스키마 추가

```sql
-- DB 인스턴스
CREATE TABLE db_instances (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,           -- mysql, postgres, mongodb, redis
    version TEXT,
    port INTEGER,
    container_id TEXT,
    status TEXT DEFAULT 'stopped',
    
    -- 리소스
    memory_limit TEXT,
    data_dir TEXT,
    
    -- 연결 정보 (암호화)
    root_password_encrypted TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- DB 백업
CREATE TABLE db_backups (
    id TEXT PRIMARY KEY,
    instance_id TEXT REFERENCES db_instances(id),
    database_name TEXT,
    
    file_path TEXT,
    file_size INTEGER,
    checksum TEXT,
    
    backup_type TEXT,             -- full, incremental
    status TEXT,                  -- pending, running, completed, failed
    
    started_at DATETIME,
    completed_at DATETIME,
    expires_at DATETIME
);

-- DB 쿼리 히스토리 (Pro)
CREATE TABLE db_query_history (
    id TEXT PRIMARY KEY,
    instance_id TEXT REFERENCES db_instances(id),
    database_name TEXT,
    
    query TEXT,
    execution_time_ms INTEGER,
    rows_affected INTEGER,
    
    executed_by TEXT,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### 3.5 통합 인증 시스템 (SSO)

#### 개요

모든 HomeHub 서비스(Dashboard, Git, File, DB)에 대한 중앙 집중식 인증. OAuth2 Provider 역할도 수행하여 배포된 앱에서도 HomeHub 계정으로 로그인 가능.

#### 인증 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HomeHub SSO Architecture                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│Dashboard│ │Git Server│ │File Mgr │ │ DB Mgr  │ │User Apps│
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │           │           │           │
     └───────────┴───────────┼───────────┴───────────┘
                             │
                    ┌────────▼────────┐
                    │  HomeHub Auth   │
                    │    Service      │
                    ├─────────────────┤
                    │ • Session Mgmt  │
                    │ • JWT Tokens    │
                    │ • OAuth2 Server │
                    │ • 2FA/MFA       │
                    │ • API Keys      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   User Store    │
                    │   (SQLite)      │
                    └─────────────────┘
```

#### 초기 설정 시나리오 (신규 추가)

```bash
$ homehub init

🏠 HomeHub Installer v1.0.0
─────────────────────────────────────────

[1/6] Checking system...          ✓
[2/6] Installing dependencies...  ✓
[3/6] Setting up Docker...        ✓
[4/6] Configuring network...      ✓
[5/6] Initializing database...    ✓
[6/6] Setting up authentication...

🔐 Create Admin Account
─────────────────────────────────────────
Username: admin
Email: admin@example.com
Password: ********
Confirm Password: ********

✅ Admin account created!

💡 Next steps:
   1. homehub network check     # 외부 접근 설정 확인
   2. homehub auth user add     # 추가 사용자 생성
   3. homehub domain ddns setup # DDNS 설정

Dashboard: http://localhost:3000
Login with: admin / [your password]
```

#### CLI 명령어

```bash
# 초기 설정
homehub auth init                      # 관리자 계정 생성 (최초 1회)
homehub auth init --reset              # 인증 시스템 초기화

# 사용자 관리
homehub auth user list
homehub auth user add <username> --password <pass> --email <email>
homehub auth user remove <username>
homehub auth user password <username>          # 비밀번호 변경

# 권한 관리
homehub auth permissions <username>            # 권한 보기
homehub auth grant <username> --service git    # Git 접근 허용
homehub auth grant <username> --service files  # 파일 접근 허용
homehub auth grant <username> --service db     # DB 접근 허용
homehub auth grant <username> --admin          # 관리자 권한
homehub auth revoke <username> --service db    # DB 접근 차단

# 2FA (Pro)
homehub auth 2fa enable <username>
homehub auth 2fa disable <username>
homehub auth 2fa reset <username>

# API Key (Pro)
homehub auth apikey create --name "CI/CD" --scope deploy
homehub auth apikey list
homehub auth apikey revoke <key-id>

# 세션
homehub auth sessions list <username>
homehub auth sessions revoke <session-id>
homehub auth sessions revoke-all <username>
```

#### 기능 목록

| 기능 | Free | Pro | Team |
|------|:----:|:---:|:----:|
| 로컬 로그인 | ✅ | ✅ | ✅ |
| 세션 관리 | ✅ | ✅ | ✅ |
| 서비스별 권한 | ✅ | ✅ | ✅ |
| 2FA (TOTP) | ❌ | ✅ | ✅ |
| API Key 관리 | ❌ | ✅ | ✅ |
| OAuth2 Provider | ❌ | ✅ | ✅ |
| LDAP 연동 | ❌ | ❌ | ✅ |
| 팀 멤버 관리 | ❌ | ❌ | ✅ |
| 역할 기반 권한 | ❌ | ❌ | ✅ |
| 감사 로그 | ❌ | ❌ | ✅ |

#### 서비스별 권한 매트릭스

| 권한 | Dashboard | Git | Files | DB |
|------|:---------:|:---:|:-----:|:--:|
| `viewer` | 읽기 | Clone | 다운로드 | 조회 |
| `member` | 읽기 | Push | 업로드/다운로드 | 조회/수정 |
| `admin` | 전체 | 전체 | 전체 | 전체 |

#### 데이터베이스 스키마 추가

```sql
-- 사용자
CREATE TABLE auth_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    
    -- 상태
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    
    -- 2FA
    totp_secret TEXT,
    totp_enabled BOOLEAN DEFAULT FALSE,
    
    -- 메타
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 권한
CREATE TABLE auth_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES auth_users(id),
    service TEXT NOT NULL,        -- dashboard, git, files, db
    permission TEXT NOT NULL,     -- viewer, member, admin
    resource TEXT,                -- 특정 리소스 (예: 특정 저장소)
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, service, permission, resource)
);

-- 세션
CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES auth_users(id),
    token_hash TEXT UNIQUE NOT NULL,
    
    ip_address TEXT,
    user_agent TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    last_used_at DATETIME
);

-- API Keys (Pro)
CREATE TABLE auth_api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES auth_users(id),
    name TEXT NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT,              -- 표시용 (예: "hh_****abcd")
    
    scopes TEXT,                  -- JSON array
    
    last_used_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OAuth2 클라이언트 (Pro)
CREATE TABLE oauth_clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_id TEXT UNIQUE NOT NULL,
    client_secret_hash TEXT NOT NULL,
    redirect_uris TEXT,           -- JSON array
    
    created_by TEXT REFERENCES auth_users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 감사 로그 (Team)
CREATE TABLE auth_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,         -- login, logout, permission_change, etc.
    target_type TEXT,             -- user, repo, database, etc.
    target_id TEXT,
    details TEXT,                 -- JSON
    
    ip_address TEXT,
    user_agent TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON auth_audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON auth_audit_logs(action);
CREATE INDEX idx_audit_logs_created ON auth_audit_logs(created_at);
```

---

## 4. 수정된 개발 로드맵

### Phase 1: 외부 접근 가능한 홈서버 (2주) - **MVP 핵심**

**목표**: CLI 설치 후 외부에서 파일/웹 접근 가능한 홈서버

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 1주 | CLI 기반 + 네트워크 설정 | 설치 스크립트, network check, DDNS, SSL |
| 2주 | 파일 매니저 기본 + 인증 | 웹 UI, 업로드/다운로드, SFTP, 로그인 |

**Phase 1 완료 시나리오**:
```bash
# 1. 설치
curl -fsSL https://get.homehub.io | bash
# → 관리자 계정 생성

# 2. 네트워크 확인
homehub network check
# → 포트 상태 확인, 가이드 제공

# 3. DDNS + SSL 설정
homehub domain ddns setup duckdns --token xxx --domain myserver
homehub domain ssl myserver.duckdns.org

# 4. 외부에서 접근
https://myserver.duckdns.org        # 대시보드
https://files.myserver.duckdns.org  # 파일 매니저
sftp://myserver.duckdns.org:2222    # SFTP
```

### Phase 2: Git 기반 배포 시스템 (2주)

**목표**: 자체 Git 서버 + Push 시 자동 배포

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 3주 | Git 서버 | Gitea 설치, 저장소 관리, SSH 접근 |
| 4주 | 자동 배포 | Webhook, 런타임 감지, Build → Deploy |

**Phase 2 완료 시나리오**:
```bash
# 1. Git 서버 시작
homehub git install

# 2. 저장소 생성 및 배포 연동
homehub git repo create my-app
homehub git hook setup my-app --app my-app

# 3. 외부에서 Push
git remote add homehub ssh://git@myserver.duckdns.org:2222/my-app.git
git push homehub main

# 4. 자동 배포됨!
# → https://my-app.myserver.duckdns.org
```

### Phase 3: 데이터 관리 (2주)

**목표**: DB 웹 관리 + 통합 인증 강화

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 5주 | Database Manager | MySQL/PostgreSQL 설치, 웹 UI |
| 6주 | 인증 강화 | 서비스별 권한, 2FA (Pro) |

**Phase 3 완료 시나리오**:
```bash
# DB 설치 및 접근
homehub db install mysql
# → https://db.myserver.duckdns.org

# 사용자별 권한 설정
homehub auth grant developer --service git --service files
homehub auth grant dba --service db --admin
```

### Phase 4: 운영 도구 (2주)

**목표**: 컨테이너 관리 및 모니터링

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 7주 | Docker GUI | 컨테이너 관리, 로그 뷰어, 웹 터미널 |
| 8주 | 모니터링 | 시스템 메트릭, 알림, ACL GUI |

### Phase 5: Pro 대시보드 (2주)

**목표**: 통합 웹 대시보드

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 9주 | 대시보드 통합 | 모든 기능 통합 UI, 라이선스 |
| 10주 | 출시 준비 | 문서화, 테스트, 베타 출시 |

---

## 5. 서비스별 URL 구조 정리

### 5.1 서브도메인 기반 (권장)

| 서비스 | URL | 포트 |
|--------|-----|:----:|
| Dashboard | `https://mydomain.com` | 443 |
| File Manager | `https://files.mydomain.com` | 443 |
| Git Web | `https://git.mydomain.com` | 443 |
| DB Manager | `https://db.mydomain.com` | 443 |
| 배포된 앱 | `https://[app-name].mydomain.com` | 443 |

### 5.2 경로 기반 (단일 도메인)

| 서비스 | URL |
|--------|-----|
| Dashboard | `https://mydomain.com/` |
| File Manager | `https://mydomain.com/files` |
| Git Web | `https://mydomain.com/git` |
| DB Manager | `https://mydomain.com/db` |
| 배포된 앱 | `https://mydomain.com/apps/[app-name]` |

### 5.3 CLI 설정

```bash
# 서브도메인 모드 (기본)
homehub config set url-mode subdomain

# 경로 모드
homehub config set url-mode path

# 커스텀 서브도메인 변경
homehub domain subdomain files --name storage  
# → https://storage.mydomain.com
```

---

## 6. 최종 기능 매트릭스

| 모듈 | 기능 | Free | Pro | Team |
|------|------|:----:|:---:|:----:|
| **설치** | One-line 설치 | ✅ | ✅ | ✅ |
| | 자동 업데이트 | ❌ | ✅ | ✅ |
| **네트워크** | 외부 접근 진단 | ✅ | ✅ | ✅ |
| | 공유기 가이드 | ✅ | ✅ | ✅ |
| | UPnP 자동 설정 | ✅ | ✅ | ✅ |
| **Git Server** | Gitea 설치/관리 | ✅ | ✅ | ✅ |
| | 저장소 생성 | ✅ | ✅ | ✅ |
| | Git Push 배포 | ✅ | ✅ | ✅ |
| | 웹 UI | CLI | ✅ | ✅ |
| **배포** | 자동 감지/빌드 | ✅ | ✅ | ✅ |
| | 롤백 | ❌ | ✅ | ✅ |
| | Blue-Green | ❌ | ❌ | ✅ |
| **도메인** | DDNS 설정 | ✅ | ✅ | ✅ |
| | 서브도메인 관리 | ✅ | ✅ | ✅ |
| | SSL 자동 발급 | ❌ | ✅ | ✅ |
| | 와일드카드 SSL | ❌ | ✅ | ✅ |
| **파일 관리** | 웹 파일 브라우저 | ✅ | ✅ | ✅ |
| | 업로드/다운로드 | ✅ | ✅ | ✅ |
| | SFTP 서버 | ✅ | ✅ | ✅ |
| | 공유 링크 | ❌ | ✅ | ✅ |
| | WebDAV | ❌ | ✅ | ✅ |
| **DB 관리** | MySQL/PostgreSQL | ✅ | ✅ | ✅ |
| | 웹 쿼리 에디터 | ❌ | ✅ | ✅ |
| | 자동 백업 | ❌ | ✅ | ✅ |
| **인증** | 로컬 로그인 | ✅ | ✅ | ✅ |
| | 서비스별 권한 | ✅ | ✅ | ✅ |
| | 2FA | ❌ | ✅ | ✅ |
| | API Key | ❌ | ✅ | ✅ |
| | 팀 관리 | ❌ | ❌ | ✅ |
| **Docker** | CLI 관리 | ✅ | ✅ | ✅ |
| | 웹 UI | ❌ | ✅ | ✅ |
| **모니터링** | 시스템 상태 | CLI | ✅ | ✅ |
| | 알림 | ❌ | ✅ | ✅ |
| **보안** | IP 화이트/블랙리스트 | CLI | ✅ | ✅ |
| | Rate Limiting | ❌ | ✅ | ✅ |
| | Geo Blocking | ❌ | ✅ | ✅ |
| | 접근 로그 | ❌ | ✅ | ✅ |

---

## 7. 결론

### 기존 PRD의 문제점

1. **외부 의존**: GitHub에 의존하는 배포 구조
2. **데이터 관리 부재**: 파일/DB 웹 관리 기능 없음
3. **네트워크 가이드 부재**: 포트포워딩 설정 안내 없음
4. **초기 인증 설정 부재**: 첫 실행 시 계정 생성 플로우 없음
5. **URL 구조 미정의**: 각 서비스 접근 URL 불명확
6. **자체 완결성 부족**: "홈서버"라기보다 "원격 서버 관리 도구"

### 보완된 PRD의 개선점

1. **자체 Git 서버**: Gitea 내장으로 외부 의존 제거
2. **완전한 데이터 관리**: File Manager + DB Manager
3. **네트워크 모듈**: 진단, 가이드, UPnP 자동 설정
4. **초기 설정 플로우**: 설치 시 관리자 계정 생성
5. **명확한 URL 구조**: 서브도메인/경로 기반 선택
6. **통합 인증**: 모든 서비스 SSO
7. **진정한 홈서버**: 웹, 파일, DB, Git 모두 자체 호스팅

### MVP 우선순위 재정의

```
[1순위 - Phase 1 (2주)] 외부 접근 가능한 홈서버
CLI 설치 → 네트워크 설정 → 파일 매니저 → 인증

[2순위 - Phase 2 (2주)] Git 기반 배포
Git 서버 → 자동 배포 파이프라인

[3순위 - Phase 3~5 (6주)] 확장 기능
DB 관리 → Docker GUI → 모니터링 → Pro 대시보드
```

### 핵심 사용자 여정

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HomeHub 핵심 사용자 여정                          │
└─────────────────────────────────────────────────────────────────────┘

[Phase 1: 홈서버 구축]
curl | bash → 계정 생성 → 네트워크 체크 → DDNS/SSL
                                              ↓
                                    외부에서 파일 접근 가능!
                                    
[Phase 2: 개발 환경]
Git 서버 설치 → 저장소 생성 → 배포 연동 설정
                                    ↓
                              git push → 자동 배포!

[Phase 3+: 고급 기능]
DB 설치 → 권한 설정 → 모니터링 → 팀 협업
```

---

*End of Document*
