# Brewnet CLI — Step 3: Dev Stack & Runtime 언어/프레임워크 명세

> REQ-1.3.5, REQ-12.1 / USER-STORY §4
> **최종 수정**: 2026년 2월
> **기준**: 각 언어/프레임워크의 최신 안정 버전 (2026년 2월 기준)

---

## 개요

사용자가 언어를 선택하면, 각 언어별로 **프레임워크 Sub-Prompt**가 즉시 표시된다.
이 문서는 각 언어의 런타임 버전, 지원 프레임워크, 기본 포트, Docker 베이스 이미지, 라이선스를 정의한다.

---

## 3-A. Backend Language Selection (다중 선택)

| 필드 | 타입 | 기본값 | 옵션 |
|------|------|--------|------|
| `devStack.languages` | `string[]` | `[]` | `'python'` \| `'nodejs'` \| `'java'` \| `'kotlin'` \| `'rust'` \| `'go'` |

| Language | 표시명 | 런타임 버전 | Docker 베이스 이미지 | 기본 포트 |
|----------|--------|------------|---------------------|----------|
| python | Python 3.13 | 3.13.x | `python:3.13-slim` | 8000 |
| nodejs | Node.js 22 LTS | 22.x | `node:22-alpine` | 3000 |
| java | Java 21 LTS (Eclipse Temurin) | 21.x | `eclipse-temurin:21-jre-alpine` | 8080 |
| kotlin | Kotlin 2.3 (JVM 21) | 2.3.x | `eclipse-temurin:21-jre-alpine` | 8080 |
| rust | Rust (latest stable) | 1.85.x | `rust:1.85-slim` → multi-stage build | 8080 |
| go | Go 1.24 | 1.24.x | `golang:1.24-alpine` → multi-stage build | 8080 |

---

## 3-B. Framework Selection (선택된 언어별 1개 — Sub-Prompt)

| 필드 | 타입 | 기본값 |
|------|------|--------|
| `devStack.frameworks` | `object` | `{}` |

`devStack.frameworks`는 `{ nodejs: 'nextjs', python: 'fastapi' }` 형태의 객체이다.

---

### 🐍 Python 3.13

> Sub-Prompt: `Select Python framework:`

| Framework | 표시명 | 버전 | 라이선스 | 기본 포트 | 기본값 | 설명 |
|-----------|--------|------|---------|----------|:------:|------|
| `fastapi` | FastAPI | 0.133.x | MIT | 8000 | ✅ (recommended) | 비동기 고성능 API 프레임워크. Pydantic 기반 자동 검증, OpenAPI 자동 생성 |
| `django` | Django | 6.0.x | BSD-3 | 8000 | | 풀스택 웹 프레임워크. ORM, Admin, Auth 내장. 대규모 프로젝트에 적합 |
| `flask` | Flask | 3.1.x | BSD-3 | 5000 | | 마이크로 프레임워크. 최소한의 코어, 확장으로 기능 추가. 학습 곡선 낮음 |

```
Select Python framework:
  > FastAPI  (default, recommended) — 비동기 고성능 API, OpenAPI 자동 생성
    Django   — 풀스택 웹 프레임워크, ORM/Admin 내장
    Flask    — 마이크로 프레임워크, 최소한의 코어
```

---

### 🟢 Node.js 22 LTS

> Sub-Prompt: `Select Node.js framework:`

| Framework | 표시명 | 버전 | 라이선스 | 기본 포트 | 기본값 | 설명 |
|-----------|--------|------|---------|----------|:------:|------|
| `nextjs` | Next.js | 15.x | MIT | 3000 | ✅ (recommended) | React 풀스택 프레임워크. SSR/SSG, App Router, API Routes 내장 |
| `express` | Express | 5.x | MIT | 3000 | | 가장 널리 쓰이는 Node.js 웹 프레임워크. 미들웨어 생태계 방대 |
| `nestjs` | NestJS | 11.x | MIT | 3000 | | TypeScript 우선 엔터프라이즈 프레임워크. Angular 스타일 모듈 구조, DI 내장 |

```
Select Node.js framework:
  > Next.js  (default, recommended) — React 풀스택, SSR/SSG/API Routes
    Express  — 가장 널리 쓰이는 미들웨어 기반 프레임워크
    NestJS   — TypeScript 엔터프라이즈, Angular 스타일
```

---

### ☕ Java 21 LTS (Eclipse Temurin)

> Sub-Prompt: `Select Java framework:`
> **참고**: Spring Framework와 Spring Boot는 별개 프레임워크이다.
> Spring Framework는 코어 DI/AOP 프레임워크이며, Spring Boot는 자동 설정 기반의 독립 실행형 래퍼이다.

| Framework | 표시명 | 버전 | 라이선스 | 기본 포트 | 기본값 | 설명 |
|-----------|--------|------|---------|----------|:------:|------|
| `spring` | Spring Framework | 7.0.x | Apache-2.0 | 8080 | | 엔터프라이즈 코어 프레임워크. DI/AOP/MVC 직접 구성, 세밀한 제어 가능 |
| `springboot` | Spring Boot | 4.0.x | Apache-2.0 | 8080 | ✅ (recommended) | Spring 기반 자동 설정. 내장 서버, 스타터 의존성, 빠른 프로젝트 시작 |

```
Select Java framework:
    Spring Framework — 엔터프라이즈 코어, DI/AOP 직접 구성
  > Spring Boot      (default, recommended) — 자동 설정, 내장 서버, 빠른 시작
```

---

### 🟣 Kotlin 2.3 (JVM 21)

> Sub-Prompt: `Select Kotlin framework:`

| Framework | 표시명 | 버전 | 라이선스 | 기본 포트 | 기본값 | 설명 |
|-----------|--------|------|---------|----------|:------:|------|
| `ktor` | Ktor | 3.4.x | Apache-2.0 | 8080 | ✅ (recommended) | JetBrains 공식. 코루틴 네이티브 비동기 서버, 경량 플러그인 아키텍처 |
| `springboot-kt` | Spring Boot (Kotlin) | 4.0.x | Apache-2.0 | 8080 | | Spring Boot의 Kotlin DSL 지원. Java 생태계 활용 + Kotlin 간결한 문법 |

```
Select Kotlin framework:
  > Ktor              (default, recommended) — JetBrains 공식, 코루틴 네이티브
    Spring Boot (Kotlin) — Spring 생태계 + Kotlin DSL
```

---

### 🦀 Rust (latest stable)

> Sub-Prompt: `Select Rust framework:`

| Framework | 표시명 | 버전 | 라이선스 | 기본 포트 | 기본값 | 설명 |
|-----------|--------|------|---------|----------|:------:|------|
| `axum` | Axum | 0.8.x | MIT | 8080 | ✅ (recommended) | Tokio 팀 개발. Tower 미들웨어 호환, 타입 안전 라우팅, 모던 async 설계 |
| `actix-web` | Actix Web | 4.x | MIT/Apache-2.0 | 8080 | | 최고 성능 프레임워크. 액터 모델 기반, 벤치마크 1위 |

```
Select Rust framework:
  > Axum       (default, recommended) — Tokio 생태계, Tower 미들웨어, 타입 안전
    Actix Web  — 최고 성능, 액터 모델
```

---

### 🐹 Go 1.24

> Sub-Prompt: `Select Go framework:`

| Framework | 표시명 | 버전 | 라이선스 | 기본 포트 | 기본값 | 설명 |
|-----------|--------|------|---------|----------|:------:|------|
| `gin` | Gin | 1.10.x | MIT | 8080 | ✅ (recommended) | 가장 인기 있는 Go 프레임워크. 경량, 빠른 라우팅, 방대한 미들웨어 생태계 |
| `echo` | Echo | 4.x | MIT | 8080 | | 깔끔한 API 설계. HTTP/2, 자동 TLS, 내장 밸리데이션, 강력한 문서화 |
| `fiber` | Fiber | 3.x | MIT | 8080 | | Express.js 스타일 API. fasthttp 기반 최고 성능. Node.js 개발자 전환에 최적 |

```
Select Go framework:
  > Gin    (default, recommended) — 가장 인기, 경량 고성능, 방대한 생태계
    Echo   — 깔끔한 API, HTTP/2, 내장 밸리데이션
    Fiber  — Express.js 스타일, fasthttp 최고 성능
```

---

## 3-C. Frontend Selection (선택사항)

> 언어/프레임워크 선택 완료 후 표시

| 필드 | 타입 | 기본값 |
|------|------|--------|
| `devStack.frontend` | `string \| null` | `null` |

| Frontend | 표시명 | 버전 | 라이선스 | 기본 포트 | 설명 |
|----------|--------|------|---------|----------|------|
| `react` | React (TypeScript) | 19.x | MIT | 5173 | Vite + React + TypeScript. 빠른 HMR, 모던 빌드 도구 |
| `vue` | Vue.js (Vite) | 3.5.x | MIT | 5173 | Vite + Vue 3. Composition API, 반응형 시스템 |
| `none` | Skip frontend | — | — | — | 프론트엔드 없이 API 서버만 구성 |

```
Select frontend (optional):
  > Skip frontend (API only)
    React (TypeScript)  — React 19 + Vite + TypeScript
    Vue.js (Vite)       — Vue 3 + Vite, Composition API
```

---

## UI 플로우 전체 예시

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3/6: Dev Stack & Runtime                                  │
└─────────────────────────────────────────────────────────────────┘

[1] Select backend languages (multi-select):
    [x] Python
    [x] Node.js
    [ ] Java
    [x] Kotlin
    [ ] PHP
    [ ] .NET
    [ ] Rust
    [ ] Go

    [ Skip — Dev Stack 없이 Step 4로 이동 ]

→ 언어 확인 후 즉시 각 언어별 프레임워크 Sub-Prompt:

[2] Select Python framework:
  > FastAPI  (default, recommended) — 비동기 고성능 API, OpenAPI 자동 생성
    Django   — 풀스택 웹 프레임워크, ORM/Admin 내장
    Flask    — 마이크로 프레임워크, 최소한의 코어

[3] Select Node.js framework:
  > Next.js  (default, recommended) — React 풀스택, SSR/SSG/API Routes
    Express  — 가장 널리 쓰이는 미들웨어 기반 프레임워크
    NestJS   — TypeScript 엔터프라이즈, Angular 스타일

[4] Select Kotlin framework:
  > Ktor              (default, recommended) — JetBrains 공식, 코루틴 네이티브
    Spring Boot (Kotlin) — Spring 생태계 + Kotlin DSL

[5] Select frontend (optional):
  > Skip frontend (API only)
    React (TypeScript)  — React 19 + Vite + TypeScript
    Vue.js (Vite)       — Vue 3 + Vite

→ 모든 선택 완료 후 Step 4로 진행
```

---

## devStack 결과 데이터 구조 예시

```typescript
interface DevStack {
  languages: string[];
  frameworks: Record<string, string>;
  frontend: string | null;
}

// 예시
const devStack: DevStack = {
  languages: ['python', 'nodejs', 'kotlin'],
  frameworks: {
    python: 'fastapi',
    nodejs: 'nextjs',
    kotlin: 'ktor'
  },
  frontend: 'react'
};
```

---

## 버전 업데이트 정책

Brewnet CLI는 각 프레임워크의 **최신 안정 버전(Latest Stable)**을 기본 템플릿으로 사용하며,
`brewnet update-templates` 명령어로 보일러플레이트 버전을 업데이트할 수 있다.

| 주기 | 내용 |
|------|------|
| 메이저 릴리즈 시 | 프레임워크 목록 및 기본값 검토 |
| 분기별 | Docker 베이스 이미지 버전 업데이트 |
| 수시 | 보안 패치 반영 |

---

*Brewnet CLI v1.0.0*
*https://brewnet.dev*
