# 🍺 Brewnet - Open Source Home Server CLI

> **Your Home Server, Brewed Fresh**

터미널 기반 인터랙티브 홈서버 설치 프로그램. 사용자가 서버 프로그램을 종류별, 단계별로 선택하면 Docker Compose 기반 보일러플레이트를 자동 생성합니다.

---

## 📋 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | Brewnet |
| **슬로건** | Your Home Server, Brewed Fresh |
| **라이선스** | MIT |
| **도메인 후보** | `brewnet.io`, `brewnet.dev` |
| **GitHub** | `github.com/brewnet/brewnet-cli` |

### 핵심 기능

1. **인터랙티브 CLI 설치 마법사** - 단계별 서비스 선택
2. **Docker Compose 자동 생성** - 선택한 스택에 맞는 설정 파일 생성
3. **API 서버 보일러플레이트** - Hello World 수준의 즉시 실행 가능한 앱 생성
4. **100% 오픈소스** - OSI 승인 라이선스만 사용

---

## 🛠️ 기술 스택 (CLI 구현)

```
<!-- TODO: 추후 변경 가능 -->
```

| 구분 | 기술 | 비고 |
|------|------|------|
| 언어 | TypeScript / Node.js | CLI 구현 |
| CLI Framework | Inquirer.js / Clack | 인터랙티브 프롬프트 |
| 템플릿 엔진 | Handlebars / EJS | 보일러플레이트 생성 |
| 패키지 배포 | npm | `npx brewnet init` |
| 대안 | Rust (clap) | 성능 우선시 고려 |

---

## 📦 설치 플로우

### Step 0: 설치 및 시스템 체크

```bash
# 설치 방법 1: curl
curl -fsSL https://brewnet.io/install | bash

# 설치 방법 2: npm
npx brewnet init

# 설치 방법 3: homebrew (macOS)
brew install brewnet
```

**시스템 요구사항 체크:**
- OS 확인 (macOS, Linux)
- Docker / Docker Compose 설치 여부
- 메모리 / 스토리지 확인

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║    🍺 Brewnet v1.0.0 - Open Source Edition                       ║
║       Your Home Server, Brewed Fresh                             ║
║                                                                  ║
║    License: MIT                                                  ║
║    GitHub:  https://github.com/brewnet/brewnet-cli               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

Checking system requirements...

  ✓ OS: macOS 15.1 (Apple Silicon M4 Pro)
  ✓ Memory: 24GB RAM
  ✓ Docker: v24.0.7 installed
  ✓ Docker Compose: v2.23.0 installed

Press Enter to continue...
```

---

### Step 1: 프로젝트 기본 설정

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1/6: Project Setup                                        │
└─────────────────────────────────────────────────────────────────┘

? Project name: › my-homeserver
? Location: › ~/brewnet/my-homeserver

? What type of setup do you need?
  ◉ Full Stack (Infrastructure + Development)
  ○ Infrastructure Only (Media, Storage, Monitoring)
  ○ Development Only (API Servers, Databases)
```

**수집 데이터:**
- `projectName`: string
- `projectPath`: string
- `setupType`: 'full' | 'infrastructure' | 'development'

---

### Step 2: 인프라 서비스 선택

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2/6: Infrastructure Services (100% Open Source)           │
└─────────────────────────────────────────────────────────────────┘
```

#### 서비스 카테고리 및 옵션

```
<!-- TODO: 추후 변경 - 서비스 종류 및 순서 조정 가능 -->
```

##### 🎬 Media & Entertainment

| 서비스 | 라이선스 | 설명 | 기본값 |
|--------|----------|------|:------:|
| Jellyfin | GPL-2.0 | Media streaming server | ○ |
| Navidrome | GPL-3.0 | Music streaming | ○ |
| Immich | MIT | Photo/Video backup | ○ |
| PhotoPrism | AGPL-3.0 | AI-powered photos | ○ |

##### 📥 Download & Torrents

| 서비스 | 라이선스 | 설명 | 기본값 |
|--------|----------|------|:------:|
| qBittorrent | GPL-2.0 | Torrent client | ○ |
| Transmission | GPL-3.0 | Lightweight torrent | ○ |
| Prowlarr | GPL-3.0 | Indexer manager | ○ |
| Radarr | GPL-3.0 | Movie collection | ○ |
| Sonarr | GPL-3.0 | TV series manager | ○ |

##### 💾 Storage & Sync

| 서비스 | 라이선스 | 설명 | 기본값 |
|--------|----------|------|:------:|
| Syncthing | MPL-2.0 | P2P file sync | ○ |
| Nextcloud | AGPL-3.0 | Full cloud suite | ○ |
| Seafile | GPL-2.0 | File sync & share | ○ |
| MinIO | AGPL-3.0 | S3-compatible storage | ○ |

##### 🔧 Reverse Proxy & Networking

| 서비스 | 라이선스 | 설명 | 기본값 |
|--------|----------|------|:------:|
| Traefik | MIT | Cloud-native reverse proxy | ○ |
| Caddy | Apache-2.0 | Automatic HTTPS | ○ |
| Nginx | BSD-2 | High performance proxy | ○ |
| WireGuard | GPL-2.0 | VPN server | ○ |

##### 📊 Monitoring & Observability

| 서비스 | 라이선스 | 설명 | 기본값 |
|--------|----------|------|:------:|
| Grafana OSS | AGPL-3.0 | Dashboards | ○ |
| Prometheus | Apache-2.0 | Metrics collection | ○ |
| Uptime Kuma | MIT | Status monitoring | ○ |
| Loki | AGPL-3.0 | Log aggregation | ○ |

##### 🛠️ DevOps Tools

| 서비스 | 라이선스 | 설명 | 기본값 |
|--------|----------|------|:------:|
| Gitea | MIT | Git hosting | ○ |
| Forgejo | MIT | Gitea fork | ○ |
| Drone | Apache-2.0 | CI/CD | ○ |
| Woodpecker CI | Apache-2.0 | CI/CD | ○ |
| Portainer CE | Zlib | Container management | ○ |

##### 🏠 Home Automation

| 서비스 | 라이선스 | 설명 | 기본값 |
|--------|----------|------|:------:|
| Home Assistant | Apache-2.0 | Smart home | ○ |
| Node-RED | Apache-2.0 | Flow automation | ○ |
| Mosquitto | EPL-2.0 | MQTT broker | ○ |

##### 🔒 Security & Privacy

| 서비스 | 라이선스 | 설명 | 기본값 |
|--------|----------|------|:------:|
| AdGuard Home | GPL-3.0 | DNS ad blocking | ○ |
| Pi-hole | EUPL | Network ad blocking | ○ |
| Vaultwarden | AGPL-3.0 | Password manager | ○ |
| Authelia | Apache-2.0 | SSO/2FA | ○ |

---

### Step 3: 개발 환경 & API 서버 선택

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3/6: Development Stack                                    │
└─────────────────────────────────────────────────────────────────┘
```

```
<!-- TODO: 추후 변경 - 프레임워크 종류 및 순서 조정 가능 -->
```

#### 🐍 Python Stack

| 프레임워크 | 라이선스 | 설명 |
|-----------|----------|------|
| FastAPI | MIT | Modern async API framework |
| Django | BSD-3 | Full-featured web framework |
| Flask | BSD-3 | Lightweight micro framework |

- **Runtime**: Python 3.12 (official Docker image)
- **Package Manager**: pip + requirements.txt / poetry

#### 🟢 Node.js Stack

| 프레임워크 | 라이선스 | 설명 |
|-----------|----------|------|
| Next.js | MIT | React full-stack framework |
| Express | MIT | Minimal web framework |
| NestJS | MIT | Enterprise Node.js framework |
| Fastify | MIT | Fast web framework |

- **Runtime**: Node.js 20 LTS (official Docker image)
- **Package Manager**: pnpm / npm / yarn

#### ☕ Java Stack

| 프레임워크 | 라이선스 | 설명 |
|-----------|----------|------|
| Spring Boot | Apache-2.0 | Enterprise Java framework |
| Quarkus | Apache-2.0 | Cloud-native Java |
| Micronaut | Apache-2.0 | Lightweight framework |

- **Runtime**: Eclipse Temurin 21 LTS
- **Build Tool**: Gradle / Maven

#### 🦀 Rust Stack

| 프레임워크 | 라이선스 | 설명 |
|-----------|----------|------|
| Actix Web | MIT | High performance |
| Axum | MIT | Ergonomic framework |

#### 🐹 Go Stack

| 프레임워크 | 라이선스 | 설명 |
|-----------|----------|------|
| Gin | MIT | HTTP web framework |
| Echo | MIT | High performance framework |
| Fiber | MIT | Express-inspired |

---

### Step 4: 데이터베이스 선택

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4/6: Database & Cache Layer                               │
└─────────────────────────────────────────────────────────────────┘
```

```
<!-- TODO: 추후 변경 - 데이터베이스 종류 조정 가능 -->
```

#### 🗄️ Relational Database

| 데이터베이스 | 라이선스 | 설명 |
|-------------|----------|------|
| PostgreSQL | PostgreSQL License | 추천 |
| MySQL | GPL-2.0 | |
| MariaDB | GPL-2.0 | |
| SQLite | Public Domain | File-based |

**추가 설정:**
- Version 선택
- Database name
- Username / Password (auto-generate 옵션)
- Admin UI 선택 (pgAdmin, Adminer)

#### 📦 NoSQL Database

| 데이터베이스 | 라이선스 | 주의사항 |
|-------------|----------|----------|
| Redis | BSD-3 | 추천 |
| KeyDB | BSD-3 | Redis fork, multi-threaded |
| Valkey | BSD-3 | Redis fork by Linux Foundation |
| MongoDB | SSPL | ⚠️ 상용 사용시 라이선스 주의 |

#### 🔍 Search Engine (Optional)

| 서비스 | 라이선스 | 설명 |
|--------|----------|------|
| Meilisearch | MIT | Fast search engine |
| OpenSearch | Apache-2.0 | Elasticsearch fork |
| Typesense | GPL-3.0 | Typo-tolerant search |

#### 📨 Message Queue (Optional)

| 서비스 | 라이선스 | 설명 |
|--------|----------|------|
| RabbitMQ | MPL-2.0 | Message broker |
| Apache Kafka | Apache-2.0 | Event streaming |
| NATS | Apache-2.0 | Cloud-native messaging |

---

### Step 5: 스택 연결 설정

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5/6: Stack Integration                                    │
└─────────────────────────────────────────────────────────────────┘
```

**설정 항목:**

1. **샘플 데이터 생성 여부**
   - Yes: User/Post 등 샘플 엔티티 생성
   - No: 빈 보일러플레이트만

2. **개발 모드 설정**
   - Hot-reload 활성화 (소스코드 볼륨 마운트)
   - Production 스타일 배포

3. **서비스간 통신 방식**
   - HTTP (Docker internal network)
   - gRPC
   - Message Queue

---

### Step 6: 최종 확인 & 생성

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6/6: Review & Generate                                    │
└─────────────────────────────────────────────────────────────────┘
```

**표시 내용:**
- 선택된 모든 서비스 요약
- 리소스 예상치 (RAM, Storage, Container 수)
- 라이선스 확인 (모두 OSI 승인 여부)

**액션:**
- Generate: 파일 생성 시작
- Modify: 이전 단계로 돌아가기
- Export: `brewnet.config.json`으로 설정 내보내기

---

## 📁 생성되는 프로젝트 구조

```
my-homeserver/
├── docker-compose.yml          # 메인 Compose 파일
├── docker-compose.dev.yml      # 개발용 오버라이드
├── .env                        # 환경 변수 (자동 생성된 시크릿 포함)
├── .env.example                # 환경 변수 템플릿
├── Makefile                    # 공통 커맨드
├── README.md                   # 프로젝트 문서
│
├── infrastructure/             # 인프라 서비스 설정
│   ├── traefik/
│   │   ├── traefik.yml
│   │   └── dynamic/
│   ├── prometheus/
│   │   └── prometheus.yml
│   ├── grafana/
│   │   ├── provisioning/
│   │   └── dashboards/
│   └── ...
│
├── databases/                  # 데이터베이스 설정
│   ├── postgres/
│   │   ├── init/
│   │   │   └── 01-init.sql
│   │   └── backups/
│   └── redis/
│       └── redis.conf
│
├── apps/                       # 애플리케이션 보일러플레이트
│   ├── fastapi-app/
│   ├── nextjs-app/
│   └── spring-app/
│
├── scripts/                    # 유틸리티 스크립트
│   ├── backup.sh
│   ├── restore.sh
│   ├── update.sh
│   └── health-check.sh
│
└── docs/                       # 문서
    ├── SETUP.md
    ├── SERVICES.md
    └── TROUBLESHOOTING.md
```

---

## 🐍 보일러플레이트: FastAPI

### 디렉토리 구조

```
apps/fastapi-app/
├── Dockerfile
├── pyproject.toml
├── requirements.txt
└── src/
    ├── main.py
    ├── config.py
    ├── database.py
    ├── models/
    │   └── user.py
    ├── routers/
    │   ├── health.py
    │   └── users.py
    └── schemas/
        └── user.py
```

### main.py

```python
"""
Brewnet FastAPI Application
Generated by Brewnet CLI
License: MIT
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.database import engine, Base
from src.routers import health, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="Brewnet FastAPI",
    description="🍺 Home-brewed API Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])


@app.get("/")
async def root():
    return {
        "service": "fastapi-app",
        "status": "running",
        "message": "🍺 Welcome to Brewnet!"
    }
```

### routers/users.py

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.schemas.user import UserCreate, UserResponse, UserList
from src.models.user import User

router = APIRouter()


@router.get("/", response_model=UserList)
async def get_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get all users"""
    result = await db.execute(
        select(User).offset(skip).limit(limit)
    )
    users = result.scalars().all()
    return {"users": users, "total": len(users)}


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    user: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new user"""
    db_user = User(**user.model_dump())
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get user by ID"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

### Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ ./src/

# Run
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 🟢 보일러플레이트: Next.js

### 디렉토리 구조

```
apps/nextjs-app/
├── Dockerfile
├── package.json
├── next.config.js
├── tsconfig.json
└── src/
    ├── app/
    │   ├── page.tsx
    │   ├── layout.tsx
    │   └── api/
    │       ├── health/route.ts
    │       └── users/route.ts
    └── lib/
        ├── db.ts
        └── redis.ts
```

### src/app/api/users/route.ts

```typescript
/**
 * Brewnet Next.js API Routes
 * Generated by Brewnet CLI
 * License: MIT
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const skip = parseInt(searchParams.get('skip') || '0');
  const limit = parseInt(searchParams.get('limit') || '100');

  // Try cache first
  const cacheKey = `users:list:${skip}:${limit}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

  const users = await prisma.user.findMany({
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  const total = await prisma.user.count();
  const response = { users, total };

  // Cache for 60 seconds
  await redis.setex(cacheKey, 60, JSON.stringify(response));

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
      },
    });

    // Invalidate cache
    const keys = await redis.keys('users:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 400 }
    );
  }
}
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

---

## ☕ 보일러플레이트: Spring Boot

### 디렉토리 구조

```
apps/spring-app/
├── Dockerfile
├── build.gradle.kts
├── settings.gradle.kts
└── src/
    └── main/
        ├── java/com/brewnet/app/
        │   ├── Application.java
        │   ├── config/
        │   │   └── RedisConfig.java
        │   ├── controller/
        │   │   ├── HealthController.java
        │   │   └── UserController.java
        │   ├── entity/
        │   │   └── User.java
        │   ├── repository/
        │   │   └── UserRepository.java
        │   └── service/
        │       └── UserService.java
        └── resources/
            └── application.yml
```

### UserController.java

```java
/**
 * Brewnet Spring Boot Controller
 * Generated by Brewnet CLI
 * License: MIT
 */

package com.brewnet.app.controller;

import com.brewnet.app.entity.User;
import com.brewnet.app.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "User management API")
public class UserController {

    private final UserService userService;

    @GetMapping
    @Operation(summary = "Get all users")
    public ResponseEntity<Page<User>> getUsers(Pageable pageable) {
        return ResponseEntity.ok(userService.findAll(pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get user by ID")
    public ResponseEntity<User> getUser(@PathVariable Long id) {
        return userService.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @Operation(summary = "Create a new user")
    public ResponseEntity<User> createUser(@RequestBody @Valid UserRequest request) {
        User user = userService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete user")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

### application.yml

```yaml
# Brewnet Spring Boot Configuration
# Generated by Brewnet CLI

spring:
  application:
    name: brewnet-spring-app
  
  datasource:
    url: jdbc:postgresql://${DB_HOST:postgres}:${DB_PORT:5432}/${DB_NAME:brewnet_db}
    username: ${DB_USER:brewnet}
    password: ${DB_PASSWORD}
    driver-class-name: org.postgresql.Driver
  
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: false
    properties:
      hibernate:
        format_sql: true
        dialect: org.hibernate.dialect.PostgreSQLDialect
  
  data:
    redis:
      host: ${REDIS_HOST:redis}
      port: ${REDIS_PORT:6379}

server:
  port: 8080

management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,metrics
  endpoint:
    health:
      show-details: always

springdoc:
  api-docs:
    path: /api-docs
  swagger-ui:
    path: /swagger-ui.html
```

### Dockerfile

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /app
COPY gradle/ gradle/
COPY gradlew build.gradle.kts settings.gradle.kts ./
COPY src/ src/

RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

---

## 🐳 Docker Compose 템플릿

### docker-compose.yml (메인)

```yaml
# Generated by Brewnet CLI
# https://brewnet.io

version: "3.9"

networks:
  brewnet:
    driver: bridge
  brewnet-internal:
    driver: bridge
    internal: true

volumes:
  postgres_data:
  redis_data:
  traefik_acme:

services:
  # ═══════════════════════════════════════════════════════════
  # 🔀 REVERSE PROXY
  # ═══════════════════════════════════════════════════════════
  traefik:
    image: traefik:v3.0
    container_name: brewnet-traefik
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    networks:
      - brewnet
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./infrastructure/traefik:/etc/traefik
      - traefik_acme:/acme
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik.rule=Host(`traefik.${DOMAIN}`)"

  # ═══════════════════════════════════════════════════════════
  # 🗄️ DATABASES
  # ═══════════════════════════════════════════════════════════
  postgres:
    image: postgres:16-alpine
    container_name: brewnet-postgres
    restart: unless-stopped
    networks:
      - brewnet-internal
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./databases/postgres/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: brewnet-redis
    restart: unless-stopped
    networks:
      - brewnet-internal
    volumes:
      - redis_data:/data
      - ./databases/redis/redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ═══════════════════════════════════════════════════════════
  # 🚀 APPLICATION SERVERS
  # ═══════════════════════════════════════════════════════════
  fastapi-app:
    build:
      context: ./apps/fastapi-app
      dockerfile: Dockerfile
    container_name: brewnet-fastapi
    restart: unless-stopped
    networks:
      - brewnet
      - brewnet-internal
    environment:
      DATABASE_URL: postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.fastapi.rule=Host(`fastapi.${DOMAIN}`)"
      - "traefik.http.services.fastapi.loadbalancer.server.port=8000"

  nextjs-app:
    build:
      context: ./apps/nextjs-app
      dockerfile: Dockerfile
    container_name: brewnet-nextjs
    restart: unless-stopped
    networks:
      - brewnet
      - brewnet-internal
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.nextjs.rule=Host(`nextjs.${DOMAIN}`)"
      - "traefik.http.services.nextjs.loadbalancer.server.port=3000"

  spring-app:
    build:
      context: ./apps/spring-app
      dockerfile: Dockerfile
    container_name: brewnet-spring
    restart: unless-stopped
    networks:
      - brewnet
      - brewnet-internal
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.spring.rule=Host(`spring.${DOMAIN}`)"
      - "traefik.http.services.spring.loadbalancer.server.port=8080"

  # ═══════════════════════════════════════════════════════════
  # 📊 MONITORING
  # ═══════════════════════════════════════════════════════════
  grafana:
    image: grafana/grafana-oss:latest
    container_name: brewnet-grafana
    restart: unless-stopped
    networks:
      - brewnet
      - brewnet-internal
    volumes:
      - ./infrastructure/grafana/provisioning:/etc/grafana/provisioning
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.grafana.rule=Host(`grafana.${DOMAIN}`)"

  prometheus:
    image: prom/prometheus:latest
    container_name: brewnet-prometheus
    restart: unless-stopped
    networks:
      - brewnet
      - brewnet-internal
    volumes:
      - ./infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.prometheus.rule=Host(`prometheus.${DOMAIN}`)"

  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: brewnet-uptime
    restart: unless-stopped
    networks:
      - brewnet
    volumes:
      - ./data/uptime-kuma:/app/data
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.uptime.rule=Host(`uptime.${DOMAIN}`)"
```

### .env.example

```bash
# Brewnet Environment Variables
# Generated by Brewnet CLI

# Domain Configuration
DOMAIN=brewnet.local

# Database
DB_NAME=brewnet_db
DB_USER=brewnet
DB_PASSWORD=CHANGE_ME_SECURE_PASSWORD

# Redis
REDIS_PASSWORD=

# Grafana
GRAFANA_PASSWORD=CHANGE_ME_ADMIN_PASSWORD

# Application Secrets
JWT_SECRET=CHANGE_ME_JWT_SECRET
```

---

## 🌐 접근 가능한 엔드포인트

### 애플리케이션

| 서비스 | URL | 설명 |
|--------|-----|------|
| FastAPI | `http://fastapi.brewnet.local` | Python API |
| FastAPI Docs | `http://fastapi.brewnet.local/docs` | Swagger UI |
| Next.js | `http://nextjs.brewnet.local` | React App |
| Spring Boot | `http://spring.brewnet.local` | Java API |
| Spring Swagger | `http://spring.brewnet.local/swagger-ui.html` | API 문서 |

### 인프라

| 서비스 | URL | 설명 |
|--------|-----|------|
| Traefik | `http://traefik.brewnet.local` | Dashboard |
| Grafana | `http://grafana.brewnet.local` | Monitoring |
| Prometheus | `http://prometheus.brewnet.local` | Metrics |
| Uptime Kuma | `http://uptime.brewnet.local` | Status |

### 데이터베이스

| 서비스 | 접근 방법 |
|--------|----------|
| PostgreSQL | `postgres.brewnet.local:5432` |
| Redis | `redis.brewnet.local:6379` |
| pgAdmin | `http://pgadmin.brewnet.local` |

---

## 🚫 제외된 서비스 (비오픈소스)

| 서비스 | 제외 사유 | 대체 서비스 |
|--------|----------|-------------|
| Plex | Proprietary | Jellyfin |
| Emby | Proprietary | Jellyfin |
| GitLab CE | BUSL 라이선스 (2023~) | Gitea, Forgejo |
| Portainer BE | 상용 | Portainer CE |
| Nginx Plus | 상용 | Nginx OSS, Caddy |
| Elasticsearch | SSPL | OpenSearch |

---

## 📜 라이선스 요약

| 카테고리 | 라이선스 | 서비스 |
|---------|----------|--------|
| **MIT** | 가장 자유로움 | FastAPI, Next.js, Traefik, Gitea, Uptime Kuma |
| **Apache-2.0** | 특허 보호 | Spring Boot, Prometheus, Home Assistant |
| **BSD** | MIT와 유사 | Django, Flask, Redis, PostgreSQL |
| **GPL** | Copyleft | Jellyfin, qBittorrent, MySQL |
| **AGPL** | 강한 Copyleft | Grafana OSS, Nextcloud, MinIO |
| **MPL-2.0** | 파일 단위 Copyleft | Syncthing, RabbitMQ |

✅ **모든 서비스가 OSI 승인 오픈소스 라이선스**

---

## 🔧 CLI 커맨드

```bash
# 초기화
brewnet init

# 서비스 추가
brewnet add <service>

# 서비스 제거
brewnet remove <service>

# 스택 시작
brewnet up

# 스택 중지
brewnet down

# 상태 확인
brewnet status

# 로그 보기
brewnet logs [service]

# 업데이트
brewnet update

# 백업
brewnet backup

# 복원
brewnet restore <backup-file>

# 설정 내보내기
brewnet export

# 도움말
brewnet help
```

---

## 📅 구현 로드맵

```
<!-- TODO: 추후 변경 - 우선순위 조정 가능 -->
```

### Phase 1: MVP
- [ ] CLI 기본 구조 (Inquirer.js)
- [ ] Step 1-2: 프로젝트 설정 & 인프라 선택
- [ ] Docker Compose 생성
- [ ] 기본 템플릿 (Traefik, PostgreSQL, Redis)

### Phase 2: 개발 스택
- [ ] Step 3-4: 개발 환경 & DB 선택
- [ ] FastAPI 보일러플레이트
- [ ] Next.js 보일러플레이트
- [ ] Spring Boot 보일러플레이트

### Phase 3: 완성
- [ ] Step 5-6: 스택 연결 & 생성
- [ ] 추가 프레임워크 (Django, Express, NestJS 등)
- [ ] Monitoring 스택 연동
- [ ] 문서화

### Phase 4: 확장
- [ ] `brewnet add/remove` 커맨드
- [ ] 플러그인 시스템
- [ ] 웹 UI (선택적)
- [ ] 커뮤니티 템플릿

---

## 📚 참고 자료

- [Docker Compose Specification](https://docs.docker.com/compose/compose-file/)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js)
- [Clack](https://github.com/natemoo-re/clack) - Beautiful CLI prompts

---

*Generated by Brewnet CLI v1.0.0*
*License: MIT*
*https://brewnet.io*
