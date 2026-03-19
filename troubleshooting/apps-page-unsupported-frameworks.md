# New Project UI Lists Unsupported Frameworks

## Symptom
Apps 페이지 > New Project 탭에서 프레임워크를 선택하고 앱을 생성하면,
보일러플레이트가 없는 프레임워크(Chi, Starlette, Fastify 등)는 생성 실패.

## Root Cause
`apps-page.ts`의 `LANG_DATA`와 `FW_CODE_MAP`에 `CONNECT_BOILERPLATE.md`에
정의되지 않은 프레임워크가 포함되어 있었음.

### 제거된 프레임워크 (9개)

| Language | Framework | Reason |
|----------|-----------|--------|
| Go | Chi | No `go-chi` stack |
| Python | Starlette | No `python-starlette` stack |
| Node.js | Fastify | No `nodejs-fastify` stack |
| Node.js | Hono | No `nodejs-hono` stack |
| Rust | Rocket | No `rust-rocket` stack |
| Rust | Warp | No `rust-warp` stack |
| Java | Quarkus | No `java-quarkus` stack |
| React | Vite + React | No standalone Vite+React stack |
| React | Remix | No `nodejs-remix` stack |

### 지원 프레임워크 (15개, 7언어)

Go: Gin, Echo v4, Fiber v3
Python: FastAPI, Django, Flask
Node.js: Express, NestJS
Rust: Actix-web, Axum
Java: Spring Boot, Spring Framework
Kotlin: Ktor, Spring Boot (Kotlin)
React: Next.js

## Fix
`LANG_DATA`와 `FW_CODE_MAP`에서 미지원 항목 제거.

## Verification
```bash
# 소스에서 직접 확인
node -e "
const fs=require('fs'),s=fs.readFileSync('packages/cli/src/services/apps-page.ts','utf-8');
const ld=s.match(/var LANG_DATA = \{[\s\S]*?\};/)[0];
['Chi','Starlette','Fastify','Hono','Rocket','Warp','Quarkus'].forEach(fw=>{
  console.log(fw+':', ld.includes(fw)?'FAIL (still present)':'PASS (removed)');
});
"
```

## Affected File
- `packages/cli/src/services/apps-page.ts`

## Commit
`316290d` (develop)
