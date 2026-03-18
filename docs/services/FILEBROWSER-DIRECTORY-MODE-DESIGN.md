# FileBrowser Directory Mode — 보일러플레이트 앱 연동 설계

> **작성일**: 2026-03-18
> **상태**: 설계 완료 / 미구현
> **전제조건**: CLI + Admin Dashboard 완성 이후 단계
> **관련 문서**: [`FILEBROWSER-APP-INTEGRATION.md`](./FILEBROWSER-APP-INTEGRATION.md)

---

## 목차

1. [배경 — 두 가지 모드 정리](#1-배경--두-가지-모드-정리)
2. [현재 구현 공백 분석](#2-현재-구현-공백-분석)
3. [연동 방식 3가지](#3-연동-방식-3가지)
   - [방식 1 — API Proxy 패턴](#방식-1--api-proxy-패턴)
   - [방식 2 — Shared Volume Direct Access 패턴](#방식-2--shared-volume-direct-access-패턴)
   - [방식 3 — Admin Dashboard Files 탭](#방식-3--admin-dashboard-files-탭)
4. [방식 비교 및 권장](#4-방식-비교-및-권장)
5. [단계별 구현 계획](#5-단계별-구현-계획)
6. [Phase 1 — 인프라 연결 상세](#6-phase-1--인프라-연결-상세)
7. [Phase 2 — 보일러플레이트 템플릿 상세](#7-phase-2--보일러플레이트-템플릿-상세)
8. [Phase 3 — Admin Dashboard Files 탭 상세](#8-phase-3--admin-dashboard-files-탭-상세)
9. [보안 원칙](#9-보안-원칙)
10. [변경 파일 요약](#10-변경-파일-요약)

---

## 1. 배경 — 두 가지 모드 정리

### `FileBrowserMode` 타입 위치

```typescript
// packages/shared/src/types/wizard-state.ts:24
export type FileBrowserMode = 'directory' | 'standalone' | '';
```

FileBrowser는 **App Server(보일러플레이트)를 선택했을 때 자동으로 활성화**된다 (`applyDevStackAutoEnables`). 이후 wizard step 7에서 모드를 선택한다.

### 모드별 동작 비교

| 항목 | `directory` | `standalone` |
|------|------------|--------------|
| FileBrowser root 경로 | `/srv/data` | `/srv` |
| 컨테이너 생성 | ✅ 동일하게 생성 | ✅ 동일하게 생성 |
| 헬스체크 등록 | ❌ 미등록 | ✅ 등록 |
| 리소스 카운팅(RAM/disk) | ❌ 미포함 | ✅ 포함 |
| Cloudflare Tunnel 라우팅 | ❌ 미등록 | ✅ `files.도메인` |
| 설계 의도 | 앱 output 디렉토리를 FileBrowser로 탐색 | 범용 파일 매니저 |
| **현재 실제 동작** | **standalone과 동일** (볼륨 미연결) | 정상 동작 |

### root 경로 분기 코드

```typescript
// packages/cli/src/services/config-generator.ts:195
root: fb.mode === 'directory' ? '/srv/data' : '/srv',
```

이 한 줄이 두 모드의 유일한 실질적 차이다. **앱 컨테이너에 볼륨을 공유하는 코드가 없으므로**, directory 모드는 현재 standalone과 동일하게 동작한다.

---

## 2. 현재 구현 공백 분석

### 공백 1 — 볼륨 미공유

```typescript
// packages/cli/src/services/compose-generator.ts:115-120
case 'filebrowser':
  return [
    `${BREWNET_PREFIX}_filebrowser_data:/srv`,   // FileBrowser만 마운트
    `${BREWNET_PREFIX}_filebrowser_db:/database`,
    `${BREWNET_PREFIX}_filebrowser_config:/config`,
  ];
```

보일러플레이트 앱 컨테이너에는 `brewnet_filebrowser_data` 볼륨 마운트가 **없다**. 두 컨테이너가 같은 파일을 볼 수 없는 상태.

### 공백 2 — 환경변수 미주입

`boilerplate-manager.ts`의 `generateEnv()` 함수가 FileBrowser 자격증명(`FB_URL`, `FB_USERNAME`, `FB_PASSWORD`)을 `.env`에 **주입하지 않는다**.

### 공백 3 — 템플릿 코드 부재

16개 보일러플레이트 스택 템플릿에 `FileBrowserClient` 코드와 파일 업로드/다운로드 라우트가 **포함되어 있지 않다**.

### 공백 4 — Admin Dashboard 미연동

Admin Dashboard Apps 페이지에 FileBrowser 파일 목록을 볼 수 있는 UI가 없다.

---

## 3. 연동 방식 3가지

---

### 방식 1 — API Proxy 패턴

#### 개요

앱 서버가 FileBrowser REST API를 내부적으로 호출하는 프록시 구조. 사용자는 FileBrowser의 존재를 알지 못한다.

```
사용자 브라우저
    │  POST /upload  (multipart)
    ▼
앱 컨테이너 (go-gin, nodejs-express 등)
    │  POST /api/resources/uploads/file.png?override=true
    │  X-Auth: <jwt>
    ▼
FileBrowser 컨테이너 (http://filebrowser:80, Docker 내부 전용)
    │
    ▼
brewnet_filebrowser_data 볼륨 (/srv)
```

#### Docker 네트워크 구조

```
brewnet (외부 Docker 네트워크)
  ├─ traefik:80
  │   ├─ /apps/my-app → app:8080
  │   └─ /files       → filebrowser:80
  │
  ├─ filebrowser:80
  │   └─ 볼륨: brewnet_filebrowser_data → /srv
  │
  └─ app (nodejs-express / go-gin / ...)
      ├─ 환경변수: FB_URL=http://filebrowser:80
      ├─ 환경변수: FB_USERNAME=admin
      └─ 환경변수: FB_PASSWORD=<wizard admin password>
```

**핵심**: 앱과 FileBrowser는 `brewnet` 네트워크를 공유한다. `http://filebrowser:80`으로 Docker 내부 통신 가능. 이미 `addQuickTunnelAppLabels()`에서 앱 컨테이너를 `brewnet`에 연결하고 있으므로 **네트워크 연결은 이미 완료**된 상태다.

#### 구현 포인트

**① `boilerplate-manager.ts` `generateEnv()` 수정**

FileBrowser enabled + directory mode 조건에서 `.env`에 추가:

```
FB_URL=http://filebrowser:80
FB_USERNAME=admin
FB_PASSWORD=<state.admin.password>
```

**② 각 보일러플레이트 템플릿에 FileBrowserClient 추가**

조건부 활성화: `FB_URL` env가 없으면 FileBrowser 연동 코드가 비활성화되어야 한다. 나머지 스택에서 이 env 없이 실행해도 에러가 없어야 한다.

구현 코드는 [`FILEBROWSER-APP-INTEGRATION.md`](./FILEBROWSER-APP-INTEGRATION.md)에 TypeScript / Go / Python 세 가지 언어로 완전히 문서화되어 있다.

#### 장점 / 단점

| | |
|--|--|
| ✅ 앱이 파일 접근을 완전히 통제 | ❌ 16개 스택 템플릿 전부 수정 필요 |
| ✅ 사용자 인증과 결합 가능 (앱 세션 기반 접근 제어) | ❌ 파일 업로드 시 앱 → FB 두 번의 HTTP 오버헤드 |
| ✅ FileBrowser의 썸네일·공유링크 기능 활용 가능 | |
| ✅ 보안 모델이 명확 (토큰 서버에만 보관) | |

---

### 방식 2 — Shared Volume Direct Access 패턴

#### 개요

앱과 FileBrowser가 **동일한 Docker named volume**을 마운트하여 파일시스템 수준에서 직접 공유. FileBrowser는 웹 UI 역할만 한다.

```
앱 컨테이너
    /app/storage ◄─── 같은 볼륨 ───► /srv/data  FileBrowser 컨테이너
```

#### docker-compose 변경 내용

`injectTraefikForQuickTunnel()` 또는 별도 compose 패치 함수에서, `directory` 모드가 활성화된 경우 앱 컨테이너에 다음을 inject:

```yaml
services:
  app:
    volumes:
      - brewnet_filebrowser_data:/app/storage   # ← 추가
    environment:
      STORAGE_PATH: /app/storage                # ← 앱이 이 경로로 읽기/쓰기

volumes:
  brewnet_filebrowser_data:
    external: true   # ← 최상위에 선언
```

`directory` 모드에서 FileBrowser의 root는 `/srv/data`이고, 볼륨 전체 root는 `/srv`다. 앱이 `/app/storage` (= 볼륨 전체) 를 마운트하면 FileBrowser가 보는 `/srv/data`와 앱이 보는 `/app/storage/data`가 일치한다.

#### 앱 코드 패턴

API 호출 없이 표준 파일시스템 I/O:

```go
// Go
storagePath := os.Getenv("STORAGE_PATH")  // /app/storage
filePath := filepath.Join(storagePath, "data", "uploads", filename)
os.WriteFile(filePath, data, 0644)
```

```python
# Python
import os
storage = os.environ.get("STORAGE_PATH", "/app/storage")
with open(f"{storage}/data/uploads/{filename}", "wb") as f:
    f.write(data)
```

```typescript
// TypeScript/Node.js
const storage = process.env.STORAGE_PATH ?? '/app/storage';
await fs.writeFile(`${storage}/data/uploads/${filename}`, buffer);
```

#### 볼륨 권한 주의사항

FileBrowser 컨테이너는 `nobody` 사용자(UID 65534)로 실행되는 경우가 많다. 앱 컨테이너와 UID가 다르면 파일 읽기/쓰기 권한 충돌이 발생할 수 있다.

해결책:
```yaml
# FileBrowser 컨테이너에 user 설정 맞추기
filebrowser:
  user: "1000:1000"   # 앱 컨테이너와 동일 UID 사용
```

또는 볼륨을 `chmod 777`로 초기화하는 entrypoint 스크립트 추가.

#### 장점 / 단점

| | |
|--|--|
| ✅ HTTP 오버헤드 없음, 파일 I/O 직접 | ❌ UID/GID 권한 충돌 가능 (컨테이너별 다름) |
| ✅ 앱 코드 수정 최소화 (파일시스템 I/O만) | ❌ FileBrowser 메타데이터와 불일치 가능 |
| ✅ 대용량 파일 처리 유리 | ❌ 볼륨 경로 규약을 스택마다 맞춰야 함 |
| | ❌ FileBrowser의 공유링크·썸네일 기능 사용 불가 |

---

### 방식 3 — Admin Dashboard Files 탭

#### 개요

현재 Apps 페이지의 앱 카드 하단 accordion에 **Files 탭을 추가**하는 방식. CLI나 보일러플레이트 코드 수정 없이 대시보드 레벨에서 파일 관리를 제공한다.

```
Apps 페이지
  └─ 앱 카드 (accordion)
      ├─ Overview
      ├─ Git
      ├─ Deploy
      ├─ Logs
      ├─ Domain
      └─ Files  ← 신규 추가
```

#### 구현 옵션

**옵션 A — FileBrowser iframe embed**

```html
<!-- accordion Files 탭 내부 -->
<iframe
  src="/api/filebrowser-proxy?dir=/uploads/my-app"
  style="width:100%;height:400px;border:none"
></iframe>
```

Traefik이 `/files` 경로로 FileBrowser를 노출하므로, 이 URL을 iframe으로 임베드.

- 구현 단순
- FileBrowser 자체 UI가 Brewnet 테마와 맞지 않음

**옵션 B — admin-server.ts REST 프록시 + 커스텀 UI** (권장)

`admin-server.ts`에 `/api/apps/:name/files` 엔드포인트 추가:

```typescript
// admin-server.ts에 추가할 엔드포인트
app.get('/api/apps/:name/files', async (req, res) => {
  const { name } = req.params;
  const dir = (req.query.dir as string) || '/';

  // admin-server가 FileBrowser API를 내부 호출 (서버 사이드)
  const token = await getFileBrowserToken();
  const fbRes = await fetch(`http://filebrowser:80/api/resources${dir}`, {
    headers: { 'X-Auth': token },
  });
  const data = await fbRes.json();
  res.json(data);
});

app.post('/api/apps/:name/files', async (req, res) => {
  // 파일 업로드 프록시
  const token = await getFileBrowserToken();
  const dir = `/uploads/${req.params.name}`;
  // multipart → FileBrowser raw upload
  ...
});
```

`apps-page.ts` accordion Files 탭:

```javascript
function loadAccFiles(appName) {
  var el = document.getElementById('accp-' + appName + '-files');
  fetch('/api/apps/' + encodeURIComponent(appName) + '/files?dir=/uploads/' + appName)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var items = d.items || [];
      el.innerHTML = items.map(function(f) {
        return '<div class="acc-info-row">'
          + '<span class="acc-info-key">' + escH(f.name) + '</span>'
          + '<span class="acc-info-val">'
          + (f.isDir ? '📁' : '📄 ' + formatBytes(f.size))
          + ' <a href="/api/apps/' + encodeURIComponent(appName) + '/files/download/'
          + encodeURIComponent(f.name) + '" download>' + '⬇' + '</a>'
          + '</span></div>';
      }).join('') || '<div style="color:var(--txt3)">파일 없음</div>';
    })
    .catch(function() {
      el.innerHTML = '<div style="color:var(--txt3)">FileBrowser 미활성화</div>';
    });
}
```

#### 장점 / 단점

| | |
|--|--|
| ✅ CLI 수정 없이 대시보드만 변경 | ❌ FileBrowser가 disabled면 빈 화면 |
| ✅ 앱별 파일 현황을 Brewnet UI로 확인 | ❌ 보일러플레이트 앱의 파일 업로드와 무관 |
| ✅ 즉시 가시적인 결과 | |
| ✅ 수정 파일 2개만 (`apps-page.ts`, `admin-server.ts`) | |

---

## 4. 방식 비교 및 권장

### 종합 비교

| 기준 | 방식 1 (API Proxy) | 방식 2 (Shared Volume) | 방식 3 (Dashboard) |
|------|------------------|----------------------|------------------|
| 구현 위치 | CLI + 각 스택 템플릿 | CLI compose 패치 | `apps-page.ts` + `admin-server.ts` |
| 수정 파일 수 | 많음 (16+ 파일) | 적음 (2-3 파일) | 적음 (2 파일) |
| 안정성 | 높음 | 볼륨 권한 위험 | 높음 |
| 구현 난이도 | 중간 (코드 이미 문서화) | 중간 (권한 처리 주의) | 낮음 |
| 보일러플레이트 앱 코드 변경 | 필요 | 최소 | 불필요 |
| FileBrowser 미활성화 시 | 앱 정상 동작 (env 없음 → 연동 비활성) | 앱 정상 동작 (볼륨 없음 → fallback) | 빈 탭 |
| 사용자 파일 접근 제어 | 앱 레벨에서 가능 | 없음 | FileBrowser 계정 기반 |

### 권장 조합

**방식 3 → 방식 1** 순서로 구현.

1. **방식 3 먼저** (Phase 3): CLI 변경 없이 대시보드에서 즉시 파일 관리 UI 제공. 현재 standalone FileBrowser를 선택한 사용자도 즉시 혜택.

2. **방식 1 이후** (Phase 1+2): `directory` 모드의 본래 설계 의도 달성. 앱에서 FileBrowser로 파일을 올리고 대시보드에서 바로 확인 가능.

방식 2는 볼륨 권한 문제로 인한 컨테이너별 동작 불일치 위험이 있어 **권장하지 않는다**.

---

## 5. 단계별 구현 계획

```
Phase 3 — Admin Dashboard Files 탭        [독립적, 즉시 시작 가능]
  ├─ apps-page.ts: accordion Files 탭 추가
  ├─ admin-server.ts: /api/apps/:name/files 엔드포인트
  └─ FileBrowser 미활성화 시 graceful fallback

Phase 1 — 인프라 연결 (CLI)               [Phase 3 이후 또는 병행]
  ├─ boilerplate-manager.ts generateEnv(): FB 환경변수 주입
  └─ 조건: fileBrowser.enabled && mode === 'directory'

Phase 2 — 보일러플레이트 템플릿 수정       [Phase 1 이후]
  ├─ nodejs-express, nodejs-nestjs
  ├─ go-gin, go-echo, go-fiber
  ├─ python-fastapi, python-django, python-flask
  ├─ rust-actix-web, rust-axum
  ├─ java-springboot, java-spring
  └─ kotlin-ktor, kotlin-springboot
  (nodejs-nextjs*, 즉 unified 스택은 API Routes로 처리)
```

---

## 6. Phase 1 — 인프라 연결 상세

### 6.1 `boilerplate-manager.ts` 수정

`generateEnv()` 함수에서 WizardState를 참조할 수 있으면 다음 조건으로 `.env` 항목 추가:

```typescript
// boilerplate-manager.ts generateEnv() 내부
if (state.servers.fileBrowser.enabled) {
  envLines.push(`FB_URL=http://filebrowser:80`);
  envLines.push(`FB_USERNAME=${state.admin.username || 'admin'}`);
  envLines.push(`FB_PASSWORD=${state.admin.password}`);
}
```

> **주의**: `generateEnv()`가 현재 `state` 전체를 받지 않고 일부 옵션만 받는다면 `FileBrowserOptions`를 `generateEnvOptions`에 추가해야 한다.

### 6.2 `generate.ts` 섹션 7b 수정

보일러플레이트 clone 후 `.env` 생성 시점에 FileBrowser 조건 전달:

```typescript
// generate.ts 섹션 7b
boilerplateGenerateEnv(appDir, stackId, dbDriver, {
  hostPort: backendPort,
  frontendPort,
  dbUser: dbOpts.dbUser,
  dbPassword: state.admin.password,
  dbName: dbOpts.dbName,
  // 추가
  fileBrowserEnabled: state.servers.fileBrowser.enabled,
  fileBrowserUsername: state.admin.username,
  fileBrowserPassword: state.admin.password,
});
```

---

## 7. Phase 2 — 보일러플레이트 템플릿 상세

### 7.1 조건부 활성화 원칙

각 스택에서 `FB_URL` env가 없으면 FileBrowser 연동 코드가 **silently 비활성화**되어야 한다. 없을 때 앱 시작 실패가 있으면 안 된다.

```typescript
// Node.js 예시
const fbEnabled = !!process.env.FB_URL;
if (fbEnabled) {
  app.use('/upload', uploadRouter);
  app.use('/files', filesRouter);
}
```

```go
// Go 예시
fbURL := os.Getenv("FB_URL")
if fbURL != "" {
  r.POST("/upload", uploadHandler)
  r.GET("/files", listFilesHandler)
}
```

### 7.2 각 스택별 추가 파일

#### Node.js (nodejs-express, nodejs-nestjs)

```
src/
  services/
    filebrowser.ts    ← FileBrowserClient 클래스 (FILEBROWSER-APP-INTEGRATION.md 참조)
  routes/
    files.ts          ← /upload, /download/:name, /files, DELETE /files/:name
```

#### Go (go-gin, go-echo, go-fiber)

```
internal/
  filebrowser/
    client.go         ← Client struct + Upload/Download/Delete/List
handlers/
  files.go            ← HTTP 핸들러
```

#### Python (python-fastapi, python-django, python-flask)

```
services/
  filebrowser.py      ← FileBrowserClient class
routers/
  files.py            ← /upload, /download/{filename}, /files
```

#### Rust (rust-actix-web, rust-axum)

```
src/
  filebrowser/
    client.rs         ← FileBrowserClient struct (reqwest 기반)
  routes/
    files.rs
```

#### Java/Kotlin (java-springboot, kotlin-ktor 등)

```
src/main/.../
  filebrowser/
    FileBrowserClient.java (또는 .kt)
  controller/
    FileController.java (또는 .kt)
```

### 7.3 공통 API 엔드포인트 규약

보일러플레이트 스택이 FileBrowser 연동 시 노출하는 엔드포인트를 통일한다:

| 메서드 | 경로 | 동작 |
|--------|------|------|
| `POST` | `/upload` | multipart/form-data 파일 업로드 → FileBrowser `/uploads/` 저장 |
| `GET` | `/files` | `/uploads/` 파일 목록 조회 |
| `GET` | `/download/:filename` | 파일 다운로드 |
| `DELETE` | `/files/:filename` | 파일 삭제 |

> 이 엔드포인트는 보일러플레이트 API 계약(`CONNECT_BOILERPLATE.md`)에 추가 등록 필요.

---

## 8. Phase 3 — Admin Dashboard Files 탭 상세

### 8.1 `admin-server.ts` 엔드포인트 추가

```typescript
// FileBrowser 토큰 캐시 (서버 수명 동안 재사용)
let fbToken: string | null = null;

async function getFileBrowserToken(): Promise<string> {
  if (fbToken) return fbToken;
  const res = await fetch('http://filebrowser:80/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: wizardState.admin.username,
      password: wizardState.admin.password,
    }),
  });
  if (!res.ok) throw new Error('FileBrowser login failed');
  fbToken = await res.json();
  return fbToken!;
}

// GET /api/apps/:name/files?dir=/uploads/my-app
app.get('/api/apps/:name/files', async (req, res) => {
  try {
    const dir = (req.query.dir as string) || `/uploads/${req.params.name}`;
    const token = await getFileBrowserToken();
    const fbRes = await fetch(`http://filebrowser:80/api/resources${dir}`, {
      headers: { 'X-Auth': token },
    });
    if (fbRes.status === 401) {
      fbToken = null;  // 토큰 만료 → 다음 요청에서 재로그인
      return res.status(503).json({ error: 'FileBrowser auth failed' });
    }
    if (!fbRes.ok) return res.status(fbRes.status).json({ error: 'FileBrowser error' });
    res.json(await fbRes.json());
  } catch {
    res.status(503).json({ error: 'FileBrowser unavailable' });
  }
});

// GET /api/apps/:name/files/download/:filename
app.get('/api/apps/:name/files/download/:filename', async (req, res) => {
  try {
    const dir = `/uploads/${req.params.name}/${req.params.filename}`;
    const token = await getFileBrowserToken();
    const fbRes = await fetch(`http://filebrowser:80/api/raw${dir}`, {
      headers: { 'X-Auth': token },
    });
    if (!fbRes.ok) return res.status(fbRes.status).json({ error: 'Not found' });
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
    res.setHeader('Content-Type', fbRes.headers.get('content-type') || 'application/octet-stream');
    const buf = Buffer.from(await fbRes.arrayBuffer());
    res.send(buf);
  } catch {
    res.status(503).json({ error: 'FileBrowser unavailable' });
  }
});
```

### 8.2 `apps-page.ts` accordion 수정

#### accordion 탭 목록에 Files 추가

```javascript
// 기존: ['ov','git','deploy','logs','domain']
// 변경: ['ov','git','deploy','logs','domain','files']

var accHtml = '<div class="acc-panel" id="acc-' + EN + '">'
  + '<div class="acc-tabs">'
  + '<span class="acc-tab active" onclick="switchAccTab(\'' + EN + '\',\'ov\')">Overview</span>'
  + '<span class="acc-tab" onclick="switchAccTab(\'' + EN + '\',\'git\')">Git</span>'
  + '<span class="acc-tab" onclick="switchAccTab(\'' + EN + '\',\'deploy\')">Deploy</span>'
  + '<span class="acc-tab" onclick="switchAccTab(\'' + EN + '\',\'logs\')">Logs</span>'
  + '<span class="acc-tab" onclick="switchAccTab(\'' + EN + '\',\'domain\')">Domain</span>'
  + '<span class="acc-tab" onclick="switchAccTab(\'' + EN + '\',\'files\')">📁 Files</span>'
  + '</div>'
  + '<div class="acc-body" id="accbody-' + EN + '">'
  + ...
  + '<div class="acc-tp" id="accp-' + EN + '-files"><div style="color:var(--txt3);font-size:12px">Loading...</div></div>'
  + '</div></div>';
```

#### `switchAccTab()` 수정

```javascript
function switchAccTab(appName, tab) {
  var tabNames = ['ov', 'git', 'deploy', 'logs', 'domain', 'files'];
  // ... 기존 코드 ...
  if (tab === 'files') loadAccFiles(appName);
}
```

#### `loadAccFiles()` 함수 추가

```javascript
function loadAccFiles(appName) {
  var el = document.getElementById('accp-' + appName + '-files');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--txt3);font-size:12px">불러오는 중...</div>';

  fetch('/api/apps/' + encodeURIComponent(appName) + '/files')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var items = d.items || [];
      if (!items.length) {
        el.innerHTML = '<div style="color:var(--txt3);font-size:12px;padding:12px 0">파일 없음</div>';
        return;
      }
      el.innerHTML = '<div class="acc-section">'
        + '<div class="acc-section-title">Files (' + items.length + '개)</div>'
        + items.map(function(f) {
            var icon = f.isDir ? '📁' : '📄';
            var size = f.isDir ? '' : ' · ' + formatBytes(f.size);
            var dl = f.isDir ? '' : ' <a href="/api/apps/' + encodeURIComponent(appName)
              + '/files/download/' + encodeURIComponent(f.name)
              + '" style="color:var(--teal);font-size:10px;font-family:var(--mono)">⬇ 다운로드</a>';
            return '<div class="acc-info-row">'
              + '<span class="acc-info-key">' + icon + ' ' + escH(f.name) + '</span>'
              + '<span class="acc-info-val" style="font-size:11px">'
              + escH(f.modified ? new Date(f.modified * 1000).toLocaleDateString('ko') : '') + size + dl
              + '</span></div>';
          }).join('')
        + '</div>';
    })
    .catch(function() {
      el.innerHTML = '<div style="color:var(--txt3);font-size:12px">FileBrowser 미활성화 또는 오프라인</div>';
    });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}
```

---

## 9. 보안 원칙

| 원칙 | 이유 |
|------|------|
| `FB_PASSWORD`는 `.env`에만, 코드 하드코딩 금지 | 소스 코드 유출 시 자격증명 노출 방지 |
| FileBrowser JWT 토큰은 서버 메모리에만 보관, 클라이언트 응답에 포함 금지 | 클라이언트가 FileBrowser에 직접 접근하는 것 차단 |
| 401 수신 시 토큰 무효화 후 1회 재로그인만 허용 | 무한 재시도 방지 |
| FileBrowser 포트(80/8085)는 Traefik을 통해서만 노출, 앱 간 내부 통신은 컨테이너 이름 사용 | 외부에서 `/api/login` 직접 호출 불가 |
| 사용자별 파일 격리가 필요하면 FileBrowser `scope` 기능 활용 | 멀티테넌트 환경에서 디렉토리별 접근 제한 |
| admin-server.ts의 FileBrowser 프록시 엔드포인트는 인증된 요청에만 응답 | admin dashboard는 로컬 전용이므로 현재 인증 불필요하나, 향후 원격 접속 시 고려 |

---

## 10. 변경 파일 요약

### Phase 3 (즉시 시작 가능)

| 파일 | 변경 내용 |
|------|----------|
| `packages/cli/src/services/apps-page.ts` | accordion Files 탭 추가 + `loadAccFiles()` + `formatBytes()` |
| `packages/cli/src/services/admin-server.ts` | `GET /api/apps/:name/files`, `GET /api/apps/:name/files/download/:filename` |

### Phase 1 (CLI 수정)

| 파일 | 변경 내용 |
|------|----------|
| `packages/cli/src/services/boilerplate-manager.ts` | `generateEnv()` — FileBrowser 환경변수 조건부 주입 |
| `packages/cli/src/wizard/steps/generate.ts` | 섹션 7b — `fileBrowserEnabled` 옵션 전달 |

### Phase 2 (보일러플레이트 템플릿)

| 파일 | 변경 내용 |
|------|----------|
| 각 스택 `src/services/filebrowser.{ts,go,py,rs,java,kt}` | FileBrowserClient 추가 |
| 각 스택 라우트 파일 | `/upload`, `/files`, `/download/:name` 엔드포인트 추가 |
| 각 스택 `.env.example` | `FB_URL`, `FB_USERNAME`, `FB_PASSWORD` 항목 추가 |
| `docs/CONNECT_BOILERPLATE.md` | 파일 업로드/다운로드 API 계약 등록 |

---

## 부록 — FileBrowser REST API 요약

> 전체 구현 코드는 [`FILEBROWSER-APP-INTEGRATION.md`](./FILEBROWSER-APP-INTEGRATION.md) 참조.

### 인증

```
POST /api/login
Content-Type: application/json
{ "username": "admin", "password": "<password>" }
→ 200 OK: "<jwt_token_string>"
이후 모든 요청: X-Auth: <token>
```

### 파일 작업

| 작업 | 메서드 | 경로 |
|------|--------|------|
| 업로드 | `POST` | `/api/resources/<path>?override=true` |
| 다운로드 | `GET` | `/api/raw/<path>` |
| 목록 조회 | `GET` | `/api/resources/<dir>/` |
| 삭제 | `DELETE` | `/api/resources/<path>` |
| 디렉토리 생성 | `POST` | `/api/resources/<dir>/` (body 없음) |

FileBrowser 내부 호출 URL: `http://filebrowser:80` (Docker 네트워크, 외부 노출 불필요)
