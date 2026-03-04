# Brewnet — Cloudflare Tunnel 운영 가이드

> Quick Tunnel(현재)과 Named Tunnel(도메인 취득 후)의 아키텍처 차이, 그리고 마이그레이션 방법을 다룹니다.

---

## 목차

1. [두 터널 방식 비교](#1-두-터널-방식-비교)
2. [현재 구조: Quick Tunnel + Path-prefix 라우팅](#2-현재-구조-quick-tunnel--path-prefix-라우팅)
3. [목표 구조: Named Tunnel + Subdomain 라우팅](#3-목표-구조-named-tunnel--subdomain-라우팅)
4. [Named Tunnel 사전 준비](#4-named-tunnel-사전-준비)
5. [Named Tunnel 설정 단계별 가이드](#5-named-tunnel-설정-단계별-가이드)
6. [brewnet 설정 변경](#6-brewnet-설정-변경)
7. [서비스별 접속 URL 비교](#7-서비스별-접속-url-비교)
8. [자주 묻는 질문](#8-자주-묻는-질문)

---

## 1. 두 터널 방식 비교

| 항목 | Quick Tunnel | Named Tunnel |
|------|-------------|--------------|
| **Cloudflare 계정** | 불필요 | 필요 (Free plan 가능) |
| **도메인** | 불필요 | 필요 (별도 구매) |
| **비용** | 완전 무료 | 터널 무료 + 도메인 비용 (~$10-15/년) |
| **외부 URL** | `*.trycloudflare.com` (랜덤) | `git.myserver.com` 등 고정 |
| **재시작 시 URL** | 매번 변경 | 고정 |
| **라우팅 방식** | Path-prefix (`/git/`, `/cloud/`) | Subdomain (`git.`, `cloud.`) |
| **서비스별 포트 노출** | 불가 (단일 URL) | 각 서비스 개별 포트 직접 라우팅 |
| **SSL** | 자동 (trycloudflare.com 인증서) | 자동 (Cloudflare 관리 인증서) |
| **보안** | 임시 연결, 프로덕션 부적합 | 프로덕션 적합 |
| **적합한 용도** | 개발/테스트, 도메인 없는 환경 | 실제 운영, 안정적 홈서버 |

---

## 2. 현재 구조: Quick Tunnel + Path-prefix 라우팅

### 왜 이 구조가 필요한가

Quick Tunnel은 **하나의 cloudflared 컨테이너 → 하나의 로컬 엔드포인트**만 지정할 수 있습니다. 여러 서비스를 하나의 URL로 노출하려면 앞단에 리버스 프록시가 필수입니다.

```
인터넷 사용자
    │
    ▼
*.trycloudflare.com  (단일 URL)
    │
    ▼
cloudflared  →  Traefik:80  (단일 로컬 엔드포인트)
                    │
                    ├─ PathPrefix(/git/)    →  Gitea:3000
                    ├─ PathPrefix(/cloud/)  →  Nextcloud:80
                    ├─ PathPrefix(/files/)  →  FileBrowser:80
                    ├─ PathPrefix(/pgadmin/)→  pgAdmin:80
                    └─ PathPrefix(/)        →  Landing Page:80
```

### 현재 구조의 제약 사항

**1. 서비스 루트 URL 고정 필요**

Gitea는 `ROOT_URL`을 기준으로 HTML 내 모든 링크를 생성합니다. Quick Tunnel에서는 `ROOT_URL=http://localhost/git/`으로 설정해야 하므로:

- `localhost:3000` 직접 접근 시 → CSS/JS 링크가 `/git/assets/...`로 생성되지만 Gitea가 해당 경로를 서빙하지 못함 → **CSS 깨짐**
- `localhost/git/`(Traefik 경유) 접근 시 → Traefik이 `/git` 스트립 후 Gitea로 전달 → 정상

**2. Quick Tunnel URL이 매 재시작마다 변경**

- Nextcloud의 `trusted_domains`를 매번 occ 명령으로 업데이트해야 함
- regex 패턴(`/.*.trycloudflare.com/`)으로 영구 등록하여 완화하지만 근본 해결은 아님

**3. SSH 포트는 Traefik 우회**

Gitea SSH(`git clone git@...`)는 HTTP가 아니므로 터널 경유 불가. 로컬 SSH 포트(3022)를 통해서만 가능.

### 현재 각 서비스 접속 URL (Quick Tunnel)

```
로컬:   http://localhost/git/          → Gitea
로컬:   http://localhost/cloud/        → Nextcloud
로컬:   http://localhost/files/        → FileBrowser
로컬:   http://localhost/dashboard/    → Traefik 대시보드 (BasicAuth)
외부:   https://<random>.trycloudflare.com/git/
외부:   https://<random>.trycloudflare.com/cloud/
```

> ⚠️ `localhost:3000`, `localhost:8443`, `localhost:8080`은 Quick Tunnel 모드에서 **의도적으로 비활성화**됩니다. Traefik 경유 URL을 사용하세요.

---

## 3. 목표 구조: Named Tunnel + Subdomain 라우팅

도메인을 취득하면 훨씬 깔끔한 구조로 전환 가능합니다.

```
인터넷 사용자
    │
    ├─  git.myserver.com    → cloudflared → Gitea:3000     (직접)
    ├─  cloud.myserver.com  → cloudflared → Nextcloud:80   (직접)
    ├─  files.myserver.com  → cloudflared → FileBrowser:80 (직접)
    ├─  db.myserver.com     → cloudflared → pgAdmin:80     (직접)
    └─  myserver.com        → cloudflared → Landing:80     (직접)
```

### Named Tunnel 구조의 장점

| 항목 | Quick Tunnel | Named Tunnel |
|------|-------------|--------------|
| Gitea ROOT_URL | `/git/` 서브패스 (복잡) | `git.myserver.com/` (서브패스 없음) |
| Nextcloud trusted_domains | 매 재시작마다 관리 필요 | `cloud.myserver.com` 고정 |
| Gitea 직접 포트 접근 | 불가 | `git.myserver.com:22` (SSH 포함) |
| Traefik 필요성 | 필수 | 선택적 (cloudflared가 직접 라우팅) |
| 서비스 격리 | 단일 프로세스 공유 | 각 서비스 독립 URL |

---

## 4. Named Tunnel 사전 준비

### 4.1 필요한 것

1. **도메인** — 아무 도메인 등록 업체에서 구매 (Namecheap, GoDaddy, Google Domains 등)
2. **Cloudflare 계정** — [cloudflare.com](https://cloudflare.com) 무료 가입
3. **도메인 네임서버 변경** — 도메인 등록 업체 → Cloudflare 네임서버로 위임

### 4.2 도메인 선택 팁

```
저렴한 도메인:
  .com   ~$10-15/년  (가장 신뢰도 높음)
  .net   ~$12/년
  .io    ~$30-40/년  (개발자 선호)
  .dev   ~$12-15/년  (Google 관리)
  .xyz   ~$1-5/년    (최저가, 신뢰도 낮음)

추천: myserver.com, myhome.net, homelab.dev 등
```

### 4.3 Cloudflare 네임서버 위임

도메인 등록 업체 관리 패널에서 네임서버를 Cloudflare에서 제공하는 주소로 변경:

```
예시:
  Before: ns1.namecheap.com, ns2.namecheap.com
  After:  alice.ns.cloudflare.com, bob.ns.cloudflare.com
```

전파 시간: 최대 24-48시간 (보통 1-2시간)

---

## 5. Named Tunnel 설정 단계별 가이드

### Step 1: Cloudflare에서 터널 생성

**방법 A: Cloudflare 대시보드 사용 (권장)**

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Zero Trust → Networks → Tunnels
2. "Create a tunnel" → Cloudflared 선택
3. 터널 이름 지정 (예: `myserver-home`)
4. 터널 토큰 복사 (나중에 `TUNNEL_TOKEN` 환경변수로 사용)

**방법 B: CLI 사용**

```bash
# cloudflared 설치 (호스트 머신에)
brew install cloudflare/cloudflare/cloudflared   # macOS
# 또는
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb         # Linux

# 로그인 및 터널 생성
cloudflared tunnel login
cloudflared tunnel create myserver-home

# 터널 토큰 확인
cloudflared tunnel token myserver-home
```

### Step 2: DNS 레코드 설정 (Cloudflare 대시보드)

도메인의 각 서비스에 CNAME 레코드 추가:

| 서브도메인 | 타입 | 값 |
|-----------|------|-----|
| `@` (루트) | CNAME | `<tunnel-id>.cfargotunnel.com` |
| `git` | CNAME | `<tunnel-id>.cfargotunnel.com` |
| `cloud` | CNAME | `<tunnel-id>.cfargotunnel.com` |
| `files` | CNAME | `<tunnel-id>.cfargotunnel.com` |
| `db` | CNAME | `<tunnel-id>.cfargotunnel.com` |

> Cloudflare 대시보드에서 Tunnel 생성 시 Public Hostname 설정으로 DNS 레코드 자동 생성됩니다.

### Step 3: Tunnel Ingress 규칙 설정

Cloudflare 대시보드 → Tunnel → Public Hostnames에서 추가:

| Public Hostname | Service |
|----------------|---------|
| `myserver.com` | `http://localhost:80` (Landing) |
| `git.myserver.com` | `http://localhost:3000` (Gitea HTTP) |
| `cloud.myserver.com` | `http://localhost:80` (Nextcloud via Traefik) |
| `files.myserver.com` | `http://localhost:8085` (FileBrowser) |
| `db.myserver.com` | `http://localhost:5050` (pgAdmin) |

> **Nextcloud**는 Named Tunnel에서도 Traefik 경유가 편리합니다. Nextcloud는 포트 80 단일 서비스이므로 `cloud.myserver.com → localhost:80 + StripPrefix` 설정이 필요할 수 있습니다. 또는 직접 `http://nextcloud:80`으로 라우팅하고 Traefik 제거 가능.

---

## 6. brewnet 설정 변경

Named Tunnel로 전환할 때 `brewnet init` 마법사에서 선택:

### 마법사 설정

```
Step 4: Domain & Network
  Provider:   tunnel (Named Tunnel 선택)
  Domain:     myserver.com
  SSL:        cloudflare (Cloudflare에서 자동 관리)

  Cloudflare:
    Tunnel Mode:  named
    Tunnel Token: <Step 1에서 복사한 토큰>
```

### 자동으로 변경되는 사항

Named Tunnel 선택 시 compose-generator가 자동으로 처리합니다:

**Gitea (가장 큰 변화):**
```yaml
# Quick Tunnel (현재)
environment:
  GITEA__server__ROOT_URL: "http://localhost/git/"  # 서브패스

# Named Tunnel (변경 후)
environment:
  # ROOT_URL 없음 → Gitea 기본값 사용 (서브패스 불필요)
ports:
  - "3000:3000"  # HTTP 포트 노출 복구
  - "3022:22"    # SSH 포트
```

**Nextcloud:**
```yaml
# Quick Tunnel (현재)
environment:
  OVERWRITEWEBROOT: "/cloud"          # 서브패스 prefix
  NEXTCLOUD_TRUSTED_DOMAINS: "..."    # 매 재시작마다 업데이트

# Named Tunnel (변경 후)
environment:
  NEXTCLOUD_TRUSTED_DOMAINS: "cloud.myserver.com localhost"
  # OVERWRITEWEBROOT 제거
```

**cloudflared:**
```yaml
# Quick Tunnel (현재)
command: ["tunnel", "--no-autoupdate", "--url", "http://traefik:80"]

# Named Tunnel (변경 후)
command: ["tunnel", "--no-autoupdate", "run"]
environment:
  TUNNEL_TOKEN: "${TUNNEL_TOKEN}"
```

---

## 7. 서비스별 접속 URL 비교

| 서비스 | Quick Tunnel (현재) | Named Tunnel (전환 후) |
|--------|--------------------|-----------------------|
| **Landing** | `https://<random>.trycloudflare.com/` | `https://myserver.com/` |
| **Gitea 웹** | `https://<random>.trycloudflare.com/git/` | `https://git.myserver.com/` |
| **Gitea SSH** | `ssh://localhost:3022` (로컬만) | `ssh://git.myserver.com:22` |
| **Nextcloud** | `https://<random>.trycloudflare.com/cloud/` | `https://cloud.myserver.com/` |
| **FileBrowser** | `https://<random>.trycloudflare.com/files/` | `https://files.myserver.com/` |
| **pgAdmin** | `https://<random>.trycloudflare.com/pgadmin/` | `https://db.myserver.com/` |
| **Traefik 대시보드** | `http://localhost/dashboard/` | `http://localhost/dashboard/` (로컬) |
| **로컬 Gitea** | `http://localhost/git/` | `http://localhost:3000/` |
| **로컬 Nextcloud** | `http://localhost/cloud/` | `http://localhost/cloud/` |

---

## 8. 자주 묻는 질문

**Q: Named Tunnel 비용은 얼마인가?**
> Cloudflare Tunnel 서비스 자체는 Free plan에 포함되어 완전 무료입니다. 도메인 비용만 부담하면 됩니다(보통 .com 기준 연 $10-15).

**Q: nginx나 caddy를 쓰면 문제가 해결되나?**
> 아니요. Nextcloud trusted_domains, Gitea ROOT_URL 문제는 리버스 프록시 종류와 무관하게 동일하게 발생합니다. 이는 각 서비스가 자체 설정 파일(config.php, app.ini)을 관리하는 방식에서 비롯되는 문제입니다.

**Q: Quick Tunnel에서 Gitea SSH clone은 어떻게 하나?**
> Quick Tunnel은 TCP/SSH를 지원하지 않습니다. Gitea SSH는 로컬 포트(3022)를 통해서만 가능합니다.
> ```bash
> git clone ssh://git@localhost:3022/username/repo.git
> ```
> Named Tunnel + Cloudflare Spectrum(유료) 또는 직접 포트 포워딩으로 외부 SSH 가능.

**Q: Named Tunnel 전환 시 기존 데이터는 유지되나?**
> 네. Docker 볼륨(Gitea 저장소, Nextcloud 파일, DB 데이터)은 docker-compose.yml 변경과 무관하게 유지됩니다. 단, Gitea `ROOT_URL`과 Nextcloud `trusted_domains`는 `docker exec` 명령으로 업데이트가 필요합니다.

**Q: Named Tunnel 전환 후 Nextcloud occ 업데이트 방법은?**
> ```bash
> # trusted_domains 업데이트
> docker exec -u www-data brewnet-nextcloud php occ config:system:set \
>   trusted_domains 0 --value=localhost
> docker exec -u www-data brewnet-nextcloud php occ config:system:set \
>   trusted_domains 1 --value=cloud.myserver.com
>
> # OVERWRITEWEBROOT 제거 (서브패스 불필요)
> docker exec -u www-data brewnet-nextcloud php occ config:system:delete \
>   overwritewebroot
> ```

**Q: Named Tunnel 전환 후 Gitea ROOT_URL 업데이트 방법은?**
> ```bash
> # app.ini 업데이트
> docker exec brewnet-gitea bash -c \
>   "sed -i 's|ROOT_URL = .*|ROOT_URL = https://git.myserver.com/|' /data/gitea/conf/app.ini"
> docker restart brewnet-gitea
> ```

---

## 참고 자료

- [Cloudflare Tunnel 공식 문서](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Gitea 환경변수 설정](https://docs.gitea.com/administration/config-cheat-sheet)
- [Nextcloud 역방향 프록시 설정](https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/reverse_proxy_configuration.html)
- `docs/research/BREWNET_CLOUDFLARE_TUNNEL_RESEARCH.md` — 상세 기술 연구 자료
- `docs/research/DOMAIN-GUIDE.md` — 도메인 구매 및 DNS 설정 가이드

---

*작성: 2026-03-04 | brewnet feature/boilerplate*
