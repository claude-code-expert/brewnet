# FileBrowser App Integration

> 보일러플레이트 앱(create-app 스택)에서 FileBrowser를 파일 저장소로 연동하는 패턴.
> 사용자 요청을 앱 서버가 받아 FileBrowser REST API로 위임하는 서비스-투-서비스 구조.

---

## 아키텍처

```
사용자 브라우저
  ↓ POST /upload  (multipart or binary)
앱 컨테이너 (go-gin, nodejs-express 등)
  ↓ POST /api/resources/<path>  (X-Auth: token)
FileBrowser 컨테이너 (http://filebrowser:80, Docker 내부)
  ↓
호스트 파일시스템 (볼륨 마운트)
```

- 사용자는 FileBrowser URL을 직접 모름 — 앱이 프록시 역할
- FileBrowser는 외부에 노출되지 않음 (Traefik 라우팅 시 `/files` 경로만 웹 UI 제공)
- 앱-FileBrowser 간 통신은 Docker 내부 네트워크 전용

---

## docker-compose 설정

```yaml
services:
  # 보일러플레이트 앱 (예: go-gin, nodejs-express)
  app:
    environment:
      FB_URL: http://filebrowser:80
      FB_USERNAME: admin
      FB_PASSWORD: ${FB_PASSWORD}        # .env에서 주입
    networks:
      - brewnet

  filebrowser:
    image: filebrowser/filebrowser:latest
    volumes:
      - ./storage:/srv                   # 파일 저장 경로
      - ./filebrowser.db:/database.db
    environment:
      - FB_ROOT=/srv
      - FB_DATABASE=/database.db
    networks:
      - brewnet                          # 앱과 같은 네트워크 필수

networks:
  brewnet:
    external: true
```

`.env`:
```
FB_PASSWORD=<brewnet init 시 생성된 64자 hex 시크릿>
```

---

## FileBrowser REST API

### 인증

```
POST /api/login
Content-Type: application/json

{ "username": "admin", "password": "<password>" }

→ 200 OK: "<jwt_token_string>"
→ 이후 모든 요청: X-Auth: <token> 헤더
```

### 파일 작업

| 작업 | 메서드 | 경로 | 비고 |
|------|--------|------|------|
| 업로드 | `POST` | `/api/resources/<path>/<filename>?override=true` | Body: raw bytes |
| 다운로드 | `GET` | `/api/raw/<path>/<filename>` | Body: raw bytes |
| 삭제 | `DELETE` | `/api/resources/<path>/<filename>` | |
| 목록 조회 | `GET` | `/api/resources/<path>/` | JSON: `{ items: [...] }` |
| 디렉토리 생성 | `POST` | `/api/resources/<path>/` | Body 없음 |

---

## 구현 패턴

### 토큰 관리 원칙

- 앱 인스턴스 수명 동안 토큰을 **메모리에 캐시**
- FileBrowser JWT 기본 만료: 2시간
- 401 응답 시 env var 자격증명으로 **자동 재로그인** 후 1회 재시도
- 토큰은 절대 클라이언트(브라우저)에 전달하지 않음

### TypeScript (nodejs-express / nodejs-nestjs)

```typescript
// src/services/filebrowser.ts

export class FileBrowserClient {
  private token: string | null = null;

  private readonly url = process.env.FB_URL!;
  private readonly username = process.env.FB_USERNAME!;
  private readonly password = process.env.FB_PASSWORD!;

  private async login(): Promise<string> {
    const res = await fetch(`${this.url}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (!res.ok) throw new Error(`FileBrowser login failed: ${res.status}`);
    return res.json(); // raw JWT string
  }

  private async ensureToken(): Promise<string> {
    if (!this.token) this.token = await this.login();
    return this.token;
  }

  private async request(
    method: string,
    path: string,
    body?: BodyInit,
    headers?: Record<string, string>,
    retry = true,
  ): Promise<Response> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: { 'X-Auth': token, ...headers },
      body,
    });

    // 토큰 만료 시 1회 재시도
    if (res.status === 401 && retry) {
      this.token = null;
      return this.request(method, path, body, headers, false);
    }
    return res;
  }

  async upload(remotePath: string, buffer: Buffer): Promise<void> {
    const res = await this.request(
      'POST',
      `/api/resources${remotePath}?override=true`,
      buffer,
      { 'Content-Type': 'application/octet-stream' },
    );
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  }

  async download(remotePath: string): Promise<Buffer> {
    const res = await this.request('GET', `/api/raw${remotePath}`);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(remotePath: string): Promise<void> {
    const res = await this.request('DELETE', `/api/resources${remotePath}`);
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  }

  async list(remotePath: string): Promise<{ name: string; isDir: boolean; size: number }[]> {
    const res = await this.request('GET', `/api/resources${remotePath}`);
    if (!res.ok) throw new Error(`List failed: ${res.status}`);
    const data = await res.json();
    return data.items ?? [];
  }
}

// 싱글턴 — 토큰을 앱 수명 동안 재사용
export const fb = new FileBrowserClient();
```

라우트에서 사용:

```typescript
// src/routes/files.ts
import { fb } from '../services/filebrowser';

router.post('/upload', upload.single('file'), async (req, res) => {
  const buffer = req.file!.buffer;
  const remotePath = `/uploads/${req.file!.originalname}`;
  await fb.upload(remotePath, buffer);
  res.json({ path: remotePath });
});

router.get('/download/:filename', async (req, res) => {
  const buffer = await fb.download(`/uploads/${req.params.filename}`);
  res.send(buffer);
});

router.delete('/files/:filename', async (req, res) => {
  await fb.delete(`/uploads/${req.params.filename}`);
  res.status(204).send();
});
```

### Go (go-gin / go-echo / go-fiber)

```go
// internal/filebrowser/client.go
package filebrowser

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "os"
    "sync"
)

type Client struct {
    url      string
    username string
    password string
    token    string
    mu       sync.Mutex
}

func New() *Client {
    return &Client{
        url:      os.Getenv("FB_URL"),
        username: os.Getenv("FB_USERNAME"),
        password: os.Getenv("FB_PASSWORD"),
    }
}

func (c *Client) login() (string, error) {
    body, _ := json.Marshal(map[string]string{
        "username": c.username,
        "password": c.password,
    })
    resp, err := http.Post(c.url+"/api/login", "application/json", bytes.NewReader(body))
    if err != nil || resp.StatusCode != 200 {
        return "", fmt.Errorf("filebrowser login failed")
    }
    defer resp.Body.Close()
    var token string
    json.NewDecoder(resp.Body).Decode(&token)
    return token, nil
}

func (c *Client) ensureToken() (string, error) {
    c.mu.Lock()
    defer c.mu.Unlock()
    if c.token == "" {
        t, err := c.login()
        if err != nil {
            return "", err
        }
        c.token = t
    }
    return c.token, nil
}

func (c *Client) do(method, path string, body io.Reader, retry bool) (*http.Response, error) {
    token, err := c.ensureToken()
    if err != nil {
        return nil, err
    }
    req, _ := http.NewRequest(method, c.url+path, body)
    req.Header.Set("X-Auth", token)
    if method == "POST" {
        req.Header.Set("Content-Type", "application/octet-stream")
    }

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, err
    }
    // 토큰 만료 시 1회 재시도
    if resp.StatusCode == 401 && retry {
        c.mu.Lock()
        c.token = ""
        c.mu.Unlock()
        return c.do(method, path, body, false)
    }
    return resp, nil
}

func (c *Client) Upload(remotePath string, data []byte) error {
    resp, err := c.do("POST", "/api/resources"+remotePath+"?override=true", bytes.NewReader(data), true)
    if err != nil || resp.StatusCode >= 300 {
        return fmt.Errorf("upload failed: %v", err)
    }
    return nil
}

func (c *Client) Download(remotePath string) ([]byte, error) {
    resp, err := c.do("GET", "/api/raw"+remotePath, nil, true)
    if err != nil || resp.StatusCode != 200 {
        return nil, fmt.Errorf("download failed")
    }
    defer resp.Body.Close()
    return io.ReadAll(resp.Body)
}

func (c *Client) Delete(remotePath string) error {
    resp, err := c.do("DELETE", "/api/resources"+remotePath, nil, true)
    if err != nil || resp.StatusCode != 200 {
        return fmt.Errorf("delete failed")
    }
    return nil
}
```

### Python (python-fastapi / python-django)

```python
# services/filebrowser.py
import os
import httpx
from threading import Lock

class FileBrowserClient:
    def __init__(self):
        self.url = os.environ['FB_URL']
        self.username = os.environ['FB_USERNAME']
        self.password = os.environ['FB_PASSWORD']
        self._token: str | None = None
        self._lock = Lock()

    def _login(self) -> str:
        res = httpx.post(f'{self.url}/api/login', json={
            'username': self.username,
            'password': self.password,
        })
        res.raise_for_status()
        return res.json()  # raw JWT string

    def _ensure_token(self) -> str:
        with self._lock:
            if not self._token:
                self._token = self._login()
            return self._token

    def _request(self, method: str, path: str, content=None, retry=True) -> httpx.Response:
        token = self._ensure_token()
        headers = {'X-Auth': token}
        if content is not None:
            headers['Content-Type'] = 'application/octet-stream'

        res = httpx.request(method, f'{self.url}{path}', content=content, headers=headers)

        if res.status_code == 401 and retry:
            with self._lock:
                self._token = None
            return self._request(method, path, content, retry=False)
        return res

    def upload(self, remote_path: str, data: bytes) -> None:
        res = self._request('POST', f'/api/resources{remote_path}?override=true', content=data)
        res.raise_for_status()

    def download(self, remote_path: str) -> bytes:
        res = self._request('GET', f'/api/raw{remote_path}')
        res.raise_for_status()
        return res.content

    def delete(self, remote_path: str) -> None:
        res = self._request('DELETE', f'/api/resources{remote_path}')
        res.raise_for_status()

    def list_files(self, remote_path: str = '/') -> list[dict]:
        res = self._request('GET', f'/api/resources{remote_path}')
        res.raise_for_status()
        return res.json().get('items', [])

# 싱글턴
fb = FileBrowserClient()
```

FastAPI 라우트:

```python
# routers/files.py
from fastapi import APIRouter, UploadFile
from services.filebrowser import fb

router = APIRouter()

@router.post('/upload')
async def upload(file: UploadFile):
    data = await file.read()
    remote_path = f'/uploads/{file.filename}'
    fb.upload(remote_path, data)
    return {'path': remote_path}

@router.get('/download/{filename}')
async def download(filename: str):
    data = fb.download(f'/uploads/{filename}')
    return Response(content=data)

@router.delete('/files/{filename}')
async def delete(filename: str):
    fb.delete(f'/uploads/{filename}')
    return {'deleted': filename}
```

---

## 보안 원칙

| 원칙 | 이유 |
|------|------|
| `FB_PASSWORD`는 `.env`에만 저장, 코드에 하드코딩 금지 | 소스 코드 유출 시 자격증명 노출 방지 |
| 토큰은 서버 메모리에만 보관, 응답에 포함 금지 | 클라이언트가 FileBrowser에 직접 접근하는 것 차단 |
| FileBrowser 포트는 Traefik에서 앱에게만 내부 라우팅 | 외부에서 `/api/login` 직접 호출 불가 |
| 사용자별 격리가 필요하면 FileBrowser `scope` 사용 | 멀티테넌트 구조에서 디렉토리 격리 |

---

## 관련 문서

- [`docs/spec/brewnet-filebrowser-integration.md`](../spec/brewnet-filebrowser-integration.md) — FileBrowser 서비스 설치 및 Traefik 설정
- [`docs/CONNECT_BOILERPLATE.md`](../CONNECT_BOILERPLATE.md) — 보일러플레이트 스택 API 계약
