# 보일러플레이트 외부 접속 테스트 체크리스트

## 메타데이터

| 항목 | 내용 |
|------|------|
| **생성일** | 2026-03-14 |
| **상태** | 🔄 진행 중 |
| **목적** | 16종 스택 전체의 외부 URL(Cloudflare Tunnel) 접속 및 경로 정상 동작 검증 |
| **브랜치** | develop |

## 배경

`nodejs-nestjs` 스택에서 다음 두 가지 버그를 발견·수정했으나, 나머지 15종 스택은 미검증 상태:

1. **Vite 빈 화면** — `patchViteConfig()` 미적용 시 에셋 경로가 `/assets/...` 절대경로로 생성 → Traefik catch-all이 JS 대신 landing HTML 반환
2. **Traefik 컨테이너 미등록** — `wget` 헬스체크 주입 시 wget 없는 이미지(Python/Java/Rust)에서 `unhealthy` → Traefik 라우터 미등록

관련 troubleshooting 문서:
- `troubleshooting/vite-blank-screen-traefik-subpath.md`
- `troubleshooting/traefik-skips-unhealthy-containers.md`

---

## 검증 항목 (스택별)

각 스택에 대해 아래 3가지 항목을 확인:

| # | 항목 | 확인 방법 |
|---|------|-----------|
| A | **백엔드 Traefik 등록** | `curl http://localhost:8080/api/http/routers` 에 해당 스택 라우터 존재 |
| B | **백엔드 외부 URL 응답** | `curl https://<tunnel>/<stackId>/api/hello` → JSON 응답 (landing HTML 아님) |
| C | **프론트엔드 외부 URL 렌더링** | 브라우저로 `https://<tunnel>/apps/<stackId>-ui/` 접속 → 빈 화면 없음, 이미지 정상 |

---

## 스택별 테스트 현황

### Node.js

| 스택 | A. 백엔드 라우터 | B. 백엔드 외부 URL | C. 프론트엔드 외부 URL | 비고 |
|------|:-:|:-:|:-:|------|
| `nodejs-nestjs` | ✅ | ✅ | ✅ | 기준 스택 — 버그 발견 및 수정 완료 |
| `nodejs-express` | ⬜ | ⬜ | ⬜ | |
| `nodejs-nextjs` | ⬜ | ⬜ | ⬜ | unified (포트 3000, 프론트 없음) |
| `nodejs-nextjs-full` | ⬜ | ⬜ | ⬜ | unified (포트 3000, 프론트 없음) |

### Python

| 스택 | A. 백엔드 라우터 | B. 백엔드 외부 URL | C. 프론트엔드 외부 URL | 비고 |
|------|:-:|:-:|:-:|------|
| `python-django` | 🔄 | 🔄 | ⬜ | 백엔드 라우터 fix 적용, 재검증 필요 |
| `python-fastapi` | ⬜ | ⬜ | ⬜ | curl/wget 여부 확인 필요 |
| `python-flask` | ⬜ | ⬜ | ⬜ | curl/wget 여부 확인 필요 |

### Go

| 스택 | A. 백엔드 라우터 | B. 백엔드 외부 URL | C. 프론트엔드 외부 URL | 비고 |
|------|:-:|:-:|:-:|------|
| `go-gin` | ⬜ | ⬜ | ⬜ | Alpine 이미지 여부 확인 필요 |
| `go-echo` | ⬜ | ⬜ | ⬜ | |
| `go-fiber` | ⬜ | ⬜ | ⬜ | |

### Java / Kotlin

| 스택 | A. 백엔드 라우터 | B. 백엔드 외부 URL | C. 프론트엔드 외부 URL | 비고 |
|------|:-:|:-:|:-:|------|
| `java-springboot` | ⬜ | ⬜ | ⬜ | wget 없음 가능성 높음 |
| `java-spring` | ⬜ | ⬜ | ⬜ | wget 없음 가능성 높음 |
| `kotlin-ktor` | ⬜ | ⬜ | ⬜ | wget 없음 가능성 높음 |
| `kotlin-springboot` | ⬜ | ⬜ | ⬜ | wget 없음 가능성 높음 |

### Rust

| 스택 | A. 백엔드 라우터 | B. 백엔드 외부 URL | C. 프론트엔드 외부 URL | 비고 |
|------|:-:|:-:|:-:|------|
| `rust-actix-web` | ⬜ | ⬜ | ⬜ | wget 없음 가능성 높음, 빌드 600s |
| `rust-axum` | ⬜ | ⬜ | ⬜ | wget 없음 가능성 높음, 빌드 600s |

---

## 범례

| 기호 | 의미 |
|------|------|
| ✅ | 검증 완료, 정상 |
| ❌ | 검증 완료, 버그 있음 |
| 🔄 | 수정 적용됨, 재검증 필요 |
| ⬜ | 미검증 |

---

## 테스트 절차

```bash
# 1. create-app으로 스택 생성
brewnet create-app <name> --stack <stackId>

# 2. 백엔드 라우터 등록 확인 (A)
curl -s http://localhost:8080/api/http/routers | jq '.[].name' | grep <stackId>

# 3. 백엔드 외부 URL 확인 (B)
curl https://<tunnel>/<stackId>/api/hello
# 기대값: {"message": "Hello from ..."}
# 실패: <!DOCTYPE html> (landing page)

# 4. 프론트엔드 외부 URL 확인 (C)
# 브라우저에서 https://<tunnel>/apps/<stackId>-ui/ 접속
# DevTools Console에서 에러 없는지 확인
# Network 탭에서 /assets/*.js 가 200 JS 응답인지 확인
```

---

## 알려진 위험 스택

wget이 없을 가능성이 높아 A 항목에서 실패할 수 있는 스택:
- **Python** (Debian slim — apt로 wget 설치 가능하나 보일러플레이트 미포함 가능)
- **Java / Kotlin** (Eclipse Temurin JRE — wget 없음)
- **Rust** (distroless 또는 scratch 기반 — wget 없음)
- **Go** (Alpine 기반 — wget 없음, 단 curl도 없음)

`patchDockerfileHealthcheck()`는 `localhost` → `127.0.0.1` 만 교체하며, wget 자체가 없는 경우는 보일러플레이트 `HEALTHCHECK` 커맨드 종류에 의존.
