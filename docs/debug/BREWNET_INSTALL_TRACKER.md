# Brewnet Install Tracker — 설치 다운로드 집계 시스템

> **문서 목적**: `curl install.sh` + `npm install -g @brewnet/cli` 두 가지 설치 방식의 다운로드 횟수 통합 집계  
> **범위**: Cloudflare Worker 개발 → KV 설정 → 배포 → 통계 API → Dashboard 연동 전 구간  
> **작성일**: 2026-03-23  
> **사이트**: brewnet.dev | **라이선스**: Business Source License 1.1

---

## 목차

1. [전체 아키텍처 개요](#1-전체-아키텍처-개요)
2. [npm 통계 — 무설정 자동 집계](#2-npm-통계--무설정-자동-집계)
3. [curl install.sh 집계 — Cloudflare Worker 구성](#3-curl-installsh-집계--cloudflare-worker-구성)
4. [프로젝트 파일 구조](#4-프로젝트-파일-구조)
5. [전체 개발 코드](#5-전체-개발-코드)
6. [Cloudflare 설정 (KV + Worker)](#6-cloudflare-설정-kv--worker)
7. [로컬 개발 및 테스트](#7-로컬-개발-및-테스트)
8. [배포 절차](#8-배포-절차)
9. [통계 API 명세](#9-통계-api-명세)
10. [Pro Dashboard 연동](#10-pro-dashboard-연동)
11. [운영 체크리스트](#11-운영-체크리스트)

---

## 1. 전체 아키텍처 개요

```
설치 방법 1 (curl)                    설치 방법 2 (npm)
─────────────────────                ─────────────────────
curl -fsSL                           npm install -g
  https://get.brewnet.dev/install.sh   @brewnet/cli
        │                                    │
        ▼                                    ▼
┌───────────────────────┐           ┌───────────────────┐
│  Cloudflare Worker    │           │    npm Registry   │
│  get.brewnet.dev      │           │  registry.npmjs   │
│                       │           │  .org             │
│  1. KV 카운터 +1      │           │                   │
│  2. GitHub raw fetch  │           │  공식 API로        │
│  3. 스크립트 반환      │           │  자동 집계         │
└────────────┬──────────┘           └────────┬──────────┘
             │                               │
             └──────────────┬────────────────┘
                            ▼
               ┌─────────────────────────┐
               │   /stats API 엔드포인트  │
               │   get.brewnet.dev/stats  │
               │                         │
               │  {                      │
               │    curl: 1284,          │
               │    npm: 932,            │
               │    total: 2216          │
               │  }                      │
               └────────────┬────────────┘
                            │
                            ▼
               ┌─────────────────────────┐
               │   Pro Dashboard         │
               │   Downloads Widget      │
               └─────────────────────────┘
```

### 핵심 설계 원칙

| 항목 | 내용 |
|------|------|
| curl 집계 | `get.brewnet.dev` Worker가 카운트 → Cloudflare KV 저장 |
| npm 집계 | npm 공식 API 자동 집계 (별도 작업 없음) |
| 통합 조회 | `GET /stats` 하나로 두 수치 통합 반환 |
| 비용 | **$0** — Cloudflare Workers 무료 티어 + KV 무료 티어 충분 |
| URL 변경 | 기존 GitHub raw URL → `get.brewnet.dev/install.sh` 로만 변경 |

---

## 2. npm 통계 — 무설정 자동 집계

npm에 패키지를 배포하면 **별도 작업 없이** 공식 API로 통계 조회 가능.

### 2.1 npm Downloads API

```
https://api.npmjs.org/downloads/point/{period}/{package}

period 옵션:
  last-day      → 최근 1일
  last-week     → 최근 7일
  last-month    → 최근 30일
  2026-01-01:2026-03-23  → 날짜 범위 지정
```

#### 예시 요청

```bash
# 최근 1주일 다운로드
curl https://api.npmjs.org/downloads/point/last-week/@brewnet/cli

# 응답
{
  "downloads": 1284,
  "start": "2026-03-16",
  "end": "2026-03-22",
  "package": "@brewnet/cli"
}

# 최근 1달 다운로드
curl https://api.npmjs.org/downloads/point/last-month/@brewnet/cli

# 날짜 범위 (누적 전체)
curl https://api.npmjs.org/downloads/point/2024-01-01:2026-03-23/@brewnet/cli
```

### 2.2 npm Badge (README용)

```markdown
![npm downloads](https://img.shields.io/npm/dm/@brewnet/cli)
![npm total](https://img.shields.io/npm/dt/@brewnet/cli)
```

### 2.3 npm 웹 대시보드

```
https://www.npmjs.com/package/@brewnet/cli
→ "Weekly Downloads" 그래프 자동 제공
```

---

## 3. curl install.sh 집계 — Cloudflare Worker 구성

GitHub raw URL은 다운로드 통계를 **전혀 제공하지 않음**.  
Cloudflare Worker를 중간에 두어 프록시 + 카운팅.

### 3.1 URL 변경 계획

#### README / 문서에서 기존 URL 교체

```bash
# ❌ 변경 전 (집계 불가)
curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash

# ✅ 변경 후 (집계 가능)
curl -fsSL https://get.brewnet.dev/install.sh | bash
```

> **중요**: `get.brewnet.dev`는 내부적으로 GitHub raw를 fetch하므로  
> 실제 스크립트 내용은 동일하게 전달됨. 사용자 경험 변화 없음.

### 3.2 Cloudflare KV 동작 방식

```
요청 → Worker → KV.get('curl_installs')
                     ↓
               현재값 + 1 후 저장
                     ↓
               GitHub raw fetch → 응답 반환
```

- KV는 Key-Value 스토리지 (Redis와 유사)
- `curl_installs` 키에 숫자 누적
- 응답 블로킹 없이 `waitUntil()`로 비동기 저장
- **무료 티어**: 읽기 100,000회/일, 쓰기 1,000회/일 → 충분

---

## 4. 프로젝트 파일 구조

```
brewnet-install-tracker/          ← 신규 Worker 프로젝트
├── src/
│   ├── index.ts                  ← Worker 메인 진입점
│   ├── handlers/
│   │   ├── install.ts            ← install.sh 프록시 + 카운팅
│   │   ├── stats.ts              ← 통합 통계 API
│   │   └── badge.ts              ← SVG 뱃지 (선택)
│   ├── lib/
│   │   ├── counter.ts            ← KV 카운터 유틸
│   │   └── npm-stats.ts          ← npm API 래퍼
│   └── types.ts                  ← TypeScript 타입 정의
├── test/
│   └── index.test.ts
├── wrangler.toml                 ← Cloudflare 배포 설정
├── package.json
└── tsconfig.json
```

---

## 5. 전체 개발 코드

### 5.1 `package.json`

```json
{
  "name": "brewnet-install-tracker",
  "version": "1.0.0",
  "description": "Brewnet install download tracker via Cloudflare Worker",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240208.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "wrangler": "^3.28.0"
  }
}
```

### 5.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

### 5.3 `wrangler.toml`

```toml
name = "brewnet-install-tracker"
main = "src/index.ts"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]

# KV 네임스페이스 바인딩
[[kv_namespaces]]
binding = "INSTALL_KV"
id = "YOUR_KV_NAMESPACE_ID"          # 실제 KV ID로 교체 (6단계 참고)
preview_id = "YOUR_KV_PREVIEW_ID"    # 로컬 dev용 preview KV ID

# 환경변수 (민감하지 않은 값)
[vars]
GITHUB_RAW_BASE = "https://raw.githubusercontent.com/claude-code-expert/brewnet/main"
NPM_PACKAGE_NAME = "@brewnet/cli"
ALLOWED_ORIGIN = "https://brewnet.dev"

# 라우팅 설정
[[routes]]
pattern = "get.brewnet.dev/*"
zone_name = "brewnet.dev"

# 프로덕션 환경
[env.production]
name = "brewnet-install-tracker-prod"
route = { pattern = "get.brewnet.dev/*", zone_name = "brewnet.dev" }
```

### 5.4 `src/types.ts`

```typescript
export interface Env {
  INSTALL_KV: KVNamespace;
  GITHUB_RAW_BASE: string;
  NPM_PACKAGE_NAME: string;
  ALLOWED_ORIGIN: string;
}

export interface StatsResponse {
  curl: {
    total: number;
    today: number;
    this_week: number;
    this_month: number;
  };
  npm: {
    last_day: number;
    last_week: number;
    last_month: number;
  };
  combined: {
    total_all_time: number;
    this_month: number;
  };
  updated_at: string;
}

export interface NpmDownloadResponse {
  downloads: number;
  start: string;
  end: string;
  package: string;
}
```

### 5.5 `src/lib/counter.ts`

```typescript
import type { Env } from '../types';

// KV 키 네이밍 규칙
// curl:total          → 누적 전체
// curl:2026-03        → 월별 (YYYY-MM)
// curl:2026-03-23     → 일별 (YYYY-MM-DD)

export async function incrementCurlCount(env: Env): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];          // "2026-03-23"
  const monthStr = dateStr.substring(0, 7);                 // "2026-03"

  const keys = [
    'curl:total',
    `curl:${monthStr}`,
    `curl:${dateStr}`,
  ];

  // 병렬로 모든 카운터 증가
  await Promise.all(
    keys.map(async (key) => {
      const current = parseInt((await env.INSTALL_KV.get(key)) ?? '0', 10);
      await env.INSTALL_KV.put(key, String(current + 1));
    })
  );
}

export async function getCurlStats(env: Env): Promise<{
  total: number;
  today: number;
  this_week: number;
  this_month: number;
}> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const monthStr = todayStr.substring(0, 7);

  // 주간 합계: 최근 7일 KV 조회 합산
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  });

  const [totalRaw, monthRaw, ...weekRaws] = await Promise.all([
    env.INSTALL_KV.get('curl:total'),
    env.INSTALL_KV.get(`curl:${monthStr}`),
    ...weekDates.map((d) => env.INSTALL_KV.get(`curl:${d}`)),
  ]);

  const todayRaw = weekRaws[0]; // 첫 번째가 오늘

  return {
    total: parseInt(totalRaw ?? '0', 10),
    today: parseInt(todayRaw ?? '0', 10),
    this_week: weekRaws.reduce((sum, v) => sum + parseInt(v ?? '0', 10), 0),
    this_month: parseInt(monthRaw ?? '0', 10),
  };
}
```

### 5.6 `src/lib/npm-stats.ts`

```typescript
import type { NpmDownloadResponse } from '../types';

const NPM_API_BASE = 'https://api.npmjs.org/downloads/point';

export async function getNpmDownloads(
  packageName: string,
  period: 'last-day' | 'last-week' | 'last-month'
): Promise<number> {
  try {
    const url = `${NPM_API_BASE}/${period}/${encodeURIComponent(packageName)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'brewnet-install-tracker/1.0' },
      // Cloudflare Workers에서 외부 fetch 캐시 설정
      cf: {
        cacheTtl: 300, // 5분 캐시 (npm API 부하 방지)
        cacheEverything: true,
      } as RequestInitCfProperties,
    });

    if (!res.ok) {
      console.error(`npm API error: ${res.status} for ${packageName}`);
      return 0;
    }

    const data: NpmDownloadResponse = await res.json();
    return data.downloads ?? 0;
  } catch (err) {
    console.error('npm stats fetch failed:', err);
    return 0;
  }
}

export async function getAllNpmStats(packageName: string): Promise<{
  last_day: number;
  last_week: number;
  last_month: number;
}> {
  const [last_day, last_week, last_month] = await Promise.all([
    getNpmDownloads(packageName, 'last-day'),
    getNpmDownloads(packageName, 'last-week'),
    getNpmDownloads(packageName, 'last-month'),
  ]);

  return { last_day, last_week, last_month };
}
```

### 5.7 `src/handlers/install.ts`

```typescript
import { incrementCurlCount } from '../lib/counter';
import type { Env } from '../types';

export async function handleInstall(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const filename = url.pathname.replace('/install', '').replace(/^\//, '') || 'install.sh';

  // ① 카운터 증가 (비동기 — 응답 지연 없음)
  ctx.waitUntil(incrementCurlCount(env));

  // ② GitHub raw에서 실제 스크립트 fetch
  const githubUrl = `${env.GITHUB_RAW_BASE}/${filename}`;

  const upstream = await fetch(githubUrl, {
    headers: {
      'User-Agent': 'brewnet-install-tracker/1.0',
    },
    // GitHub raw는 캐시 가능
    cf: {
      cacheTtl: 60,          // 1분 캐시 (스크립트 업데이트 반영 빠르게)
      cacheEverything: true,
    } as RequestInitCfProperties,
  });

  if (!upstream.ok) {
    return new Response(
      `# Brewnet install script temporarily unavailable\n# Please try: https://raw.githubusercontent.com/claude-code-expert/brewnet/main/${filename}\n`,
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }
    );
  }

  // ③ 응답 헤더 정리 후 그대로 전달
  const headers = new Headers();
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-store');  // 브라우저 캐시 방지 (항상 최신 스크립트)
  headers.set('X-Brewnet-Tracker', 'counted');          // 디버깅용 헤더

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
```

### 5.8 `src/handlers/stats.ts`

```typescript
import { getCurlStats } from '../lib/counter';
import { getAllNpmStats } from '../lib/npm-stats';
import type { Env, StatsResponse } from '../types';

export async function handleStats(
  request: Request,
  env: Env
): Promise<Response> {
  // CORS 처리 (Dashboard에서 fetch 가능하도록)
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigins = [
    env.ALLOWED_ORIGIN,
    'https://dashboard.brewnet.dev',
    'http://localhost:3000', // 로컬 개발용
  ];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : env.ALLOWED_ORIGIN;

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(corsOrigin),
    });
  }

  // 병렬로 curl KV + npm API 동시 조회
  const [curlStats, npmStats] = await Promise.all([
    getCurlStats(env),
    getAllNpmStats(env.NPM_PACKAGE_NAME),
  ]);

  const response: StatsResponse = {
    curl: curlStats,
    npm: npmStats,
    combined: {
      total_all_time: curlStats.total,  // npm 누적은 API 미제공
      this_month: curlStats.this_month + npmStats.last_month,
    },
    updated_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(corsOrigin),
      // 통계는 5분 캐시 (과도한 API 호출 방지)
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
```

### 5.9 `src/handlers/badge.ts`

```typescript
import { getCurlStats } from '../lib/counter';
import { getNpmDownloads } from '../lib/npm-stats';
import type { Env } from '../types';

// shields.io 스타일 SVG 뱃지 생성
export async function handleBadge(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'total'; // total | curl | npm

  let count = 0;
  let label = 'installs';

  if (type === 'curl') {
    const stats = await getCurlStats(env);
    count = stats.total;
    label = 'curl installs';
  } else if (type === 'npm') {
    count = await getNpmDownloads(env.NPM_PACKAGE_NAME, 'last-month');
    label = 'npm/month';
  } else {
    // total: curl + npm last-month 합산
    const [curlStats, npmMonth] = await Promise.all([
      getCurlStats(env),
      getNpmDownloads(env.NPM_PACKAGE_NAME, 'last-month'),
    ]);
    count = curlStats.total + npmMonth;
    label = 'total installs';
  }

  const countStr = count >= 1000
    ? `${(count / 1000).toFixed(1)}k`
    : String(count);

  const svg = generateBadgeSvg(label, countStr, '#3dd6c8'); // Brewnet teal

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600', // 1시간 캐시
    },
  });
}

function generateBadgeSvg(label: string, value: string, color: string): string {
  const labelWidth = label.length * 6 + 16;
  const valueWidth = value.length * 8 + 16;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect rx="3" width="${totalWidth}" height="20" fill="#555"/>
  <rect rx="3" x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
  <rect x="${labelWidth}" width="4" height="20" fill="${color}"/>
  <rect rx="3" width="${totalWidth}" height="20" fill="url(#s)"/>
  <g fill="#fff" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" text-anchor="middle" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14" text-anchor="middle">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" text-anchor="middle" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" text-anchor="middle">${value}</text>
  </g>
</svg>`;
}
```

### 5.10 `src/index.ts` (메인 라우터)

```typescript
import { handleInstall } from './handlers/install';
import { handleStats } from './handlers/stats';
import { handleBadge } from './handlers/badge';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ─────────────────────────────────────────
    // 라우팅 테이블
    // ─────────────────────────────────────────

    // GET /install.sh  → curl 설치 스크립트 프록시 + 카운팅
    if (path === '/install.sh' || path === '/install') {
      return handleInstall(request, env, ctx);
    }

    // GET /stats       → 통합 통계 JSON API
    if (path === '/stats' || path === '/api/stats') {
      return handleStats(request, env);
    }

    // GET /badge.svg   → SVG 뱃지 (README 삽입용)
    if (path === '/badge.svg' || path === '/badge') {
      return handleBadge(request, env);
    }

    // GET /health      → Worker 헬스체크
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'brewnet-install-tracker' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 404
    return new Response(
      JSON.stringify({ error: 'Not found', path }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  },
} satisfies ExportedHandler<Env>;
```

### 5.11 `test/index.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

// KV Mock
const kvStore = new Map<string, string>();
const mockKV = {
  get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
  put: vi.fn(async (key: string, value: string) => { kvStore.set(key, value); }),
};

const mockEnv = {
  INSTALL_KV: mockKV as any,
  GITHUB_RAW_BASE: 'https://raw.githubusercontent.com/claude-code-expert/brewnet/main',
  NPM_PACKAGE_NAME: '@brewnet/cli',
  ALLOWED_ORIGIN: 'https://brewnet.dev',
};

// Worker import
import worker from '../src/index';

describe('Brewnet Install Tracker', () => {
  it('GET /health → 200 ok', async () => {
    const req = new Request('https://get.brewnet.dev/health');
    const ctx = { waitUntil: vi.fn() } as any;
    const res = await worker.fetch(req, mockEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /install.sh → 카운터 증가 + 스크립트 반환', async () => {
    // GitHub raw fetch mock
    global.fetch = vi.fn().mockResolvedValue(
      new Response('#!/bin/bash\necho "Brewnet installer"', { status: 200 })
    );

    const req = new Request('https://get.brewnet.dev/install.sh');
    const ctx = { waitUntil: vi.fn((p: Promise<any>) => p) } as any;

    kvStore.clear(); // 초기화
    const res = await worker.fetch(req, mockEnv, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Brewnet-Tracker')).toBe('counted');
    const text = await res.text();
    expect(text).toContain('Brewnet installer');
  });

  it('GET /stats → JSON 통계 반환', async () => {
    // npm API mock
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ downloads: 500 }), { status: 200 })
    );

    kvStore.set('curl:total', '1284');
    const today = new Date().toISOString().split('T')[0];
    kvStore.set(`curl:${today}`, '42');

    const req = new Request('https://get.brewnet.dev/stats', {
      headers: { Origin: 'https://brewnet.dev' },
    });
    const ctx = { waitUntil: vi.fn() } as any;

    const res = await worker.fetch(req, mockEnv, ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.curl.total).toBe(1284);
    expect(data.curl.today).toBe(42);
    expect(data.npm.last_day).toBe(500);
    expect(data.updated_at).toBeDefined();
  });

  it('GET /unknown → 404', async () => {
    const req = new Request('https://get.brewnet.dev/unknown');
    const ctx = { waitUntil: vi.fn() } as any;
    const res = await worker.fetch(req, mockEnv, ctx);
    expect(res.status).toBe(404);
  });
});
```

---

## 6. Cloudflare 설정 (KV + Worker)

### 6.1 사전 요구사항

```
✅ Cloudflare 계정 (무료 가능)
✅ brewnet.dev 도메인이 Cloudflare에 등록되어 있을 것
✅ Node.js 18+ 설치
✅ wrangler CLI 설치: npm install -g wrangler
```

### 6.2 Cloudflare 로그인

```bash
npx wrangler login
# 브라우저 열림 → Cloudflare 계정으로 인증
```

### 6.3 KV 네임스페이스 생성

```bash
# 프로덕션용 KV 생성
npx wrangler kv:namespace create "INSTALL_KV"

# 출력 예시:
# ✅ Successfully created namespace
# Add the following to your wrangler.toml:
# [[kv_namespaces]]
# binding = "INSTALL_KV"
# id = "a1b2c3d4e5f6..."   ← 이 ID를 wrangler.toml에 붙여넣기

# 로컬 dev용 preview KV 생성
npx wrangler kv:namespace create "INSTALL_KV" --preview

# 출력:
# id = "preview-id-here..."  ← wrangler.toml의 preview_id에 붙여넣기
```

### 6.4 wrangler.toml ID 업데이트

```toml
[[kv_namespaces]]
binding = "INSTALL_KV"
id = "a1b2c3d4e5f6..."          # ← 6.3에서 나온 실제 ID
preview_id = "preview-id-here"  # ← 6.3 preview에서 나온 ID
```

### 6.5 DNS 레코드 확인

`get.brewnet.dev` Worker 라우팅을 위해 Cloudflare DNS에 다음 레코드 필요:

```
Type : A
Name : get
Content : 192.0.2.1    ← Cloudflare Workers 더미 IP (실제로는 Worker가 처리)
Proxy  : ✅ Proxied (주황 구름 아이콘)
TTL    : Auto
```

Cloudflare 대시보드 → DNS → Records → Add record

또는 wrangler CLI로 자동 처리 (routes 설정 시 자동):
```bash
npx wrangler deploy
# Cloudflare가 자동으로 라우팅 설정
```

### 6.6 KV 초기값 설정 (선택 — 기존 집계가 있는 경우)

```bash
# 기존 curl 다운로드 수가 있다면 초기값 설정
npx wrangler kv:key put --namespace-id="YOUR_KV_ID" "curl:total" "0"

# 특정 월 초기값
npx wrangler kv:key put --namespace-id="YOUR_KV_ID" "curl:2026-03" "0"
```

---

## 7. 로컬 개발 및 테스트

### 7.1 프로젝트 초기화

```bash
# 프로젝트 클론 또는 새 생성
git clone https://github.com/claude-code-expert/brewnet-install-tracker
cd brewnet-install-tracker

# 또는 새로 만들기
mkdir brewnet-install-tracker && cd brewnet-install-tracker
npm init -y
```

### 7.2 의존성 설치

```bash
npm install -D \
  @cloudflare/workers-types \
  typescript \
  vitest \
  wrangler
```

### 7.3 로컬 개발 서버 실행

```bash
npm run dev
# 또는
npx wrangler dev

# 출력:
# ⛅️ wrangler 3.x.x
# ------------------
# ✅ Created Worker 'brewnet-install-tracker'
# 👂 Listening on http://127.0.0.1:8787
```

### 7.4 로컬 테스트

```bash
# install.sh 엔드포인트
curl -fsSL http://localhost:8787/install.sh | head -5

# 통계 API
curl http://localhost:8787/stats | jq .

# 헬스체크
curl http://localhost:8787/health

# 뱃지 (curl 타입)
curl "http://localhost:8787/badge.svg?type=curl" > badge-test.svg

# 존재하지 않는 경로 → 404
curl http://localhost:8787/notfound
```

### 7.5 단위 테스트 실행

```bash
npm test
# 또는
npx vitest run

# 출력 예시:
# ✓ GET /health → 200 ok
# ✓ GET /install.sh → 카운터 증가 + 스크립트 반환
# ✓ GET /stats → JSON 통계 반환
# ✓ GET /unknown → 404
# Tests: 4 passed
```

### 7.6 KV 로컬 조회

```bash
# 로컬 dev KV의 값 확인
npx wrangler kv:key list --namespace-id="YOUR_PREVIEW_KV_ID"

# 특정 키 조회
npx wrangler kv:key get --namespace-id="YOUR_PREVIEW_KV_ID" "curl:total"
```

---

## 8. 배포 절차

### 8.1 최초 배포

```bash
# 1. 코드 빌드 + 배포 (TypeScript 자동 컴파일)
npx wrangler deploy

# 출력:
# ⛅️ wrangler 3.x.x
# ✅ Uploading brewnet-install-tracker...
# ✅ Deployed brewnet-install-tracker
# 🌍 https://brewnet-install-tracker.YOUR_SUBDOMAIN.workers.dev

# 2. 라우팅 확인
npx wrangler deployments list
```

### 8.2 프로덕션 배포

```bash
# 환경 지정 배포
npx wrangler deploy --env production

# 배포 후 검증
curl https://get.brewnet.dev/health
# → {"status":"ok","service":"brewnet-install-tracker"}

curl https://get.brewnet.dev/stats
# → {curl: {...}, npm: {...}, combined: {...}}
```

### 8.3 GitHub Actions CI/CD (선택)

```yaml
# .github/workflows/deploy-worker.yml
name: Deploy Install Tracker

on:
  push:
    branches: [main]
    paths:
      - 'workers/install-tracker/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: workers/install-tracker
        run: npm ci

      - name: Run tests
        working-directory: workers/install-tracker
        run: npm test

      - name: Deploy to Cloudflare
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          workingDirectory: workers/install-tracker
          command: deploy --env production
```

### 8.4 롤백

```bash
# 이전 배포 목록 확인
npx wrangler deployments list

# 특정 버전으로 롤백
npx wrangler rollback [DEPLOYMENT_ID]
```

---

## 9. 통계 API 명세

### `GET https://get.brewnet.dev/stats`

#### 응답 예시

```json
{
  "curl": {
    "total": 1284,
    "today": 42,
    "this_week": 213,
    "this_month": 847
  },
  "npm": {
    "last_day": 38,
    "last_week": 204,
    "last_month": 932
  },
  "combined": {
    "total_all_time": 1284,
    "this_month": 1779
  },
  "updated_at": "2026-03-23T09:15:32.000Z"
}
```

#### 응답 필드 설명

| 필드 | 설명 |
|------|------|
| `curl.total` | curl 설치 누적 전체 횟수 (KV 저장) |
| `curl.today` | 오늘 curl 설치 횟수 |
| `curl.this_week` | 최근 7일 curl 설치 횟수 |
| `curl.this_month` | 이번 달 curl 설치 횟수 |
| `npm.last_day` | npm 어제 다운로드 (npm 공식 API) |
| `npm.last_week` | npm 최근 7일 다운로드 |
| `npm.last_month` | npm 최근 30일 다운로드 |
| `combined.this_month` | curl + npm 이번달 합산 |
| `updated_at` | 응답 생성 시각 (ISO 8601) |

### `GET https://get.brewnet.dev/badge.svg`

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| `type` | `total` (기본) | curl 누적 + npm 월간 합산 뱃지 |
| `type` | `curl` | curl 누적 설치 뱃지 |
| `type` | `npm` | npm 월간 다운로드 뱃지 |

```markdown
<!-- README.md 뱃지 삽입 예시 -->
![Total Installs](https://get.brewnet.dev/badge.svg?type=total)
![curl Installs](https://get.brewnet.dev/badge.svg?type=curl)
![npm Downloads](https://get.brewnet.dev/badge.svg?type=npm)
```

---

## 10. Pro Dashboard 연동

### 10.1 Dashboard Stats 컴포넌트 (TypeScript)

```typescript
// dashboard/src/components/InstallStats.tsx

interface StatsData {
  curl: { total: number; today: number; this_week: number; this_month: number };
  npm: { last_day: number; last_week: number; last_month: number };
  combined: { total_all_time: number; this_month: number };
  updated_at: string;
}

async function fetchInstallStats(): Promise<StatsData> {
  const res = await fetch('https://get.brewnet.dev/stats');
  if (!res.ok) throw new Error('Stats fetch failed');
  return res.json();
}

// React 컴포넌트 예시
export function InstallStatsWidget() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetchInstallStats().then(setStats).catch(console.error);
  }, []);

  if (!stats) return <div>Loading...</div>;

  return (
    <div className="stats-widget">
      <h3>📦 Downloads</h3>
      <div className="stats-grid">
        <StatCard
          label="curl installer"
          value={stats.curl.total}
          sub={`+${stats.curl.today} today`}
        />
        <StatCard
          label="npm package"
          value={stats.npm.last_month}
          sub="last 30 days"
        />
        <StatCard
          label="This month total"
          value={stats.combined.this_month}
          highlight
        />
      </div>
      <p className="updated">Updated: {new Date(stats.updated_at).toLocaleString()}</p>
    </div>
  );
}
```

### 10.2 Dashboard UI 목업

```
┌─────────────────────────────────────────────────────────────┐
│  📦  Downloads                              [This Month ▼]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   curl installer            npm package                     │
│  ┌─────────────────┐       ┌─────────────────┐            │
│  │      1,284      │       │       932       │            │
│  │  total installs │       │   last 30 days  │            │
│  │  +42 today  📈  │       │   +38 today     │            │
│  └─────────────────┘       └─────────────────┘            │
│                                                             │
│  ─────────────────────────────────────────────────────     │
│  Combined this month:                      2,216  🎉       │
│                                                             │
│  Last updated: 2026-03-23 09:15 UTC                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. 운영 체크리스트

### 최초 세팅 체크리스트

```
□ wrangler 로그인 완료
□ KV 네임스페이스 생성 (production + preview)
□ wrangler.toml에 KV ID 입력
□ Cloudflare DNS에 get.brewnet.dev A 레코드 추가 (Proxied)
□ npx wrangler deploy 실행
□ https://get.brewnet.dev/health 응답 확인
□ https://get.brewnet.dev/install.sh 스크립트 내용 확인
□ https://get.brewnet.dev/stats 통계 응답 확인
□ README / 문서의 curl URL → get.brewnet.dev 로 교체
□ GitHub Actions CI/CD 설정 (선택)
```

### README URL 교체 위치

```
□ GitHub README.md
□ brewnet.dev 공식 사이트 설치 가이드
□ npm 패키지 README
□ 문서 사이트 (docs.brewnet.dev 등)
□ 마켓플레이스 / 소셜 포스팅 내용
```

### 주간 운영 모니터링

```bash
# curl 누적 설치 수 확인
curl https://get.brewnet.dev/stats | jq '.curl.total'

# npm 이번 달 다운로드 확인
curl https://api.npmjs.org/downloads/point/last-month/@brewnet/cli | jq '.downloads'

# Worker 오류 로그 확인
npx wrangler tail --env production
```

### 무료 티어 한도 확인 (초과 가능성 매우 낮음)

| 리소스 | 무료 한도 | 예상 사용량 |
|--------|---------|-----------|
| Worker 요청 | 100,000회/일 | ~수백회/일 |
| KV 읽기 | 100,000회/일 | ~수백회/일 |
| KV 쓰기 | 1,000회/일 | = curl 설치 횟수 |
| KV 저장 | 1GB | 수 KB 미만 |

> KV 쓰기가 일 1,000회 초과 시 (= curl 설치 1,000회/일 이상) Cloudflare Workers Paid ($5/월)로 업그레이드 필요. 그 시점이면 충분히 성장한 것.

---

## 참고 링크

- Cloudflare Workers 문서: https://developers.cloudflare.com/workers/
- Cloudflare KV 문서: https://developers.cloudflare.com/kv/
- npm Downloads API: https://github.com/npm/registry/blob/master/docs/download-counts.md
- Wrangler CLI 문서: https://developers.cloudflare.com/workers/wrangler/
