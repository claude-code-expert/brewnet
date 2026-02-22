# 🚀 Brewnet 보일러플레이트 생성 완전 가이드

> **상태**: 부분적으로 계획됨 (완전 구현 필요)  
> **난이도**: ⭐⭐⭐ (상)  
> **예상 시간**: 1.5주  
> **팀**: Backend 1-2명

---

## 📋 목차
1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [CLI 명령어](#cli-명령어)
4. [각 언어별 구현](#각-언어별-구현)
5. [Dockerfile 자동 생성](#dockerfile-자동-생성)
6. [GitHub 템플릿](#github-템플릿)
7. [테스트 일정](#테스트-일정)

---

## 개요

### 현재 계획의 문제점
```
❌ 각 프레임워크별 Dockerfile 없음
❌ 초기 설정 파일 템플릿 없음
❌ 모바일 앱 (React Native/Flutter) 미정
❌ 데스크톱 앱 (Electron/Tauri) 미정
❌ GitHub 템플릿 저장소 없음
```

### 목표: 원커맨드 앱 생성

```bash
brewnet create-app myapp --type backend --lang python
  └─ FastAPI 프로젝트 자동 생성
  ├─ Dockerfile 자동 생성
  ├─ docker-compose.yml 자동 생성
  ├─ 환경 변수 파일 자동 생성
  ├─ 샘플 코드 포함
  └─ 바로 배포 가능

brewnet create-app myreactapp --type frontend --framework react
  └─ React + TypeScript 프로젝트 자동 생성
  ├─ Next.js 권장
  ├─ Tailwind CSS 포함
  ├─ Dockerfile 포함
  └─ 빌드 최적화 설정

brewnet create-app mymobileapp --type mobile --framework react-native
  └─ React Native 초기 프로젝트
  ├─ EAS Build 설정
  ├─ Firebase 통합 옵션
  └─ 배포 가이드
```

---

## 아키텍처

### 보일러플레이트 저장소 구조

```
brewnet-boilerplate/
├─ backend/
│  ├─ python/
│  │  ├─ fastapi/
│  │  │  ├─ main.py
│  │  │  ├─ requirements.txt
│  │  │  ├─ Dockerfile
│  │  │  ├─ docker-compose.yml
│  │  │  └─ .env.example
│  │  ├─ django/
│  │  └─ flask/
│  │
│  ├─ nodejs/
│  │  ├─ express/
│  │  ├─ nest/
│  │  └─ fastify/
│  │
│  ├─ java/
│  │  ├─ spring-boot/
│  │  └─ quarkus/
│  │
│  ├─ go/
│  │  ├─ gin/
│  │  └─ echo/
│  │
│  └─ rust/
│     ├─ actix/
│     └─ axum/
│
├─ frontend/
│  ├─ react/
│  │  ├─ next-js/        # 권장
│  │  ├─ cra/            # Create React App
│  │  └─ vite/           # Vite + React
│  │
│  └─ vue/
│     ├─ nuxt/
│     └─ vite-vue/
│
├─ mobile/
│  ├─ react-native/
│  ├─ flutter/
│  └─ expo/
│
└─ desktop/
   ├─ electron/
   └─ tauri/
```

### CLI 플로우

```
brewnet create-app
  │
  ├─ 1. 앱 이름 입력
  │  └─ my-awesome-app
  │
  ├─ 2. 앱 타입 선택
  │  └─ backend | frontend | mobile | desktop
  │
  ├─ 3. 언어/프레임워크 선택
  │  ├─ Backend: Python/Node/Java/Go/Rust
  │  ├─ Frontend: React/Vue/Svelte
  │  ├─ Mobile: React Native/Flutter
  │  └─ Desktop: Electron/Tauri
  │
  ├─ 4. 기본 기능 선택 (선택사항)
  │  ├─ 데이터베이스: PostgreSQL/MySQL/MongoDB
  │  ├─ 인증: JWT/OAuth
  │  ├─ API: GraphQL/REST
  │  └─ 테스트: Jest/Pytest
  │
  ├─ 5. Dockerfile 옵션
  │  ├─ 멀티스테이지 빌드
  │  ├─ 최적화 수준
  │  └─ 베이스 이미지
  │
  ├─ 6. 프로젝트 생성
  │  ├─ 파일 복사
  │  ├─ 변수 치환
  │  ├─ package.json 수정
  │  └─ Git 초기화
  │
  └─ 7. 완료
     ├─ 다음 단계 안내
     └─ 로컬 실행 명령어
```

---

## CLI 명령어

```bash
# 기본 명령어
brewnet create-app my-app --type backend --lang python
brewnet create-app my-app --type backend --lang nodejs --framework nest
brewnet create-app my-app --type frontend --framework next

# 대화형 모드 (권장)
brewnet create-app
  ? App name: my-awesome-project
  ? App type: (backend|frontend|mobile|desktop)
  ? Language: (python|nodejs|java|go|rust)
  ? Framework: (fastapi|express|django|...)
  ? Database: (yes/no)
  ? Add tests: (yes/no)
  ✅ Created: my-awesome-project/

# 고급 옵션
brewnet create-app myapp --type backend --lang python \
  --framework fastapi \
  --database postgresql \
  --auth jwt \
  --tests pytest \
  --docker-optimization aggressive \
  --git-init

# 템플릿 목록
brewnet create-app --list-templates
brewnet create-app --list-templates --type backend --lang python

# 기존 프로젝트에 Dockerfile 추가
cd my-existing-project
brewnet add-dockerfile
  ? Detected: Node.js Express
  ? Confirm: (yes) [Node.js Express 기반 Dockerfile 생성]
  ✅ Created: ./Dockerfile
```

---

## 각 언어별 구현

### Backend 보일러플레이트

#### 1️⃣ Python - FastAPI (권장)

```bash
# templates/backend/python/fastapi/main.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="{{PROJECT_NAME}}",
    description="자동 생성된 FastAPI 애플리케이션",
    version="0.1.0"
)

# CORS 설정
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터 모델
class Item(BaseModel):
    name: str
    description: Optional[str] = None
    price: float

# 라우트
@app.get("/")
async def root():
    return {
        "message": "안녕하세요!",
        "app": "{{PROJECT_NAME}}",
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/items")
async def get_items():
    return [
        {"id": 1, "name": "샘플 아이템 1"},
        {"id": 2, "name": "샘플 아이템 2"}
    ]

@app.post("/api/items")
async def create_item(item: Item):
    return {"id": 3, **item.dict()}

# 개발 실행
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
```

```bash
# templates/backend/python/fastapi/requirements.txt
fastapi==0.104.0
uvicorn[standard]==0.24.0
pydantic==2.4.0
pydantic-settings==2.1.0
python-dotenv==1.0.0
{{#database}}sqlalchemy==2.0.0{{/database}}
{{#auth}}python-jose==3.3.0{{/auth}}
{{#tests}}pytest==7.4.0
pytest-asyncio==0.21.0{{/tests}}
```

```bash
# templates/backend/python/fastapi/.env.example
APP_NAME={{PROJECT_NAME}}
APP_ENV=development
DEBUG=true
HOST=0.0.0.0
PORT=8000

# 데이터베이스
{{#database}}
DATABASE_URL=postgresql://user:password@localhost:5432/{{PROJECT_NAME}}
{{/database}}

# 인증
{{#auth}}
SECRET_KEY=your-secret-key-here-min-32-chars
ALGORITHM=HS256
{{/auth}}

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
```

```dockerfile
# templates/backend/python/fastapi/Dockerfile
# 멀티스테이지 빌드

FROM python:3.11-slim as builder

WORKDIR /app

# 의존성 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# 최종 이미지
FROM python:3.11-slim

WORKDIR /app

# 보안: 비루트 사용자 생성
RUN groupadd -r appuser && useradd -r -g appuser appuser

# builder에서 의존성 복사
COPY --from=builder /root/.local /home/appuser/.local

COPY . .

# 권한 설정
RUN chown -R appuser:appuser /app

USER appuser
ENV PATH=/home/appuser/.local/bin:$PATH

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### 2️⃣ Node.js - NestJS

```bash
# templates/backend/nodejs/nest/src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // CORS 설정
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
  });
  
  // 글로벌 프리픽스
  app.setGlobalPrefix('api');
  
  // 로거
  const logger = new Logger('NestApplication');
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
}

bootstrap();
```

```bash
# templates/backend/nodejs/nest/package.json
{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "description": "NestJS 백엔드 애플리케이션",
  "author": "",
  "private": true,
  "license": "MIT",
  "scripts": {
    "prebuild": "rimraf dist",
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\"",
    "lint:fix": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "docker:build": "docker build -t {{PROJECT_NAME}}:latest .",
    "docker:run": "docker run -p 3000:3000 {{PROJECT_NAME}}:latest"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.0",
    "dotenv": "^16.3.1",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.1",
    "@nestjs/schematics": "^10.0.1",
    "@types/express": "^4.17.17",
    "@types/node": "^20.3.1",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.42.0",
    "prettier": "^3.0.0",
    "ts-loader": "^9.4.3",
    "ts-node": "^10.9.1",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.1.3"
  }
}
```

#### 3️⃣ Java - Spring Boot

```java
// templates/backend/java/spring-boot/src/main/java/com/example/{{PROJECT_NAME}}/Application.java

package com.example.{{PROJECT_NAME}};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@SpringBootApplication
public class Application {
    
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
    
    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        config.addAllowedOrigin("http://localhost:3000");
        config.addAllowedHeader("*");
        config.addAllowedMethod("*");
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}
```

```xml
<!-- templates/backend/java/spring-boot/pom.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>{{PROJECT_NAME}}</artifactId>
    <version>0.1.0</version>
    <packaging>jar</packaging>

    <name>{{PROJECT_NAME}}</name>
    <description>Spring Boot 백엔드 애플리케이션</description>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.1.0</version>
        <relativePath/>
    </parent>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        {{#database}}
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        {{/database}}

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

---

## Frontend 보일러플레이트

### Next.js (권장)

```bash
# templates/frontend/react/next-js/package.json

{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "docker:build": "docker build -t {{PROJECT_NAME}}:latest .",
    "docker:run": "docker run -p 3000:3000 {{PROJECT_NAME}}:latest"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.1.0",
    "tailwindcss": "^3.3.0",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.24"
  }
}
```

```dockerfile
# templates/frontend/react/next-js/Dockerfile

FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
```

---

## Dockerfile 자동 생성

### Dockerfile 제너레이터

```typescript
// src/boilerplate/dockerfile-generator.ts

interface DockerfileOptions {
  framework: string;
  language: string;
  baseImage?: string;
  optimization?: 'none' | 'aggressive' | 'maximum';
  includeHealthCheck?: boolean;
  includeSecurityUser?: boolean;
}

class DockerfileGenerator {
  generate(options: DockerfileOptions): string {
    const baseImage = this.getBaseImage(options);
    const builder = this.getBuilderStage(options);
    const runtime = this.getRuntimeStage(options);
    const entrypoint = this.getEntrypoint(options);
    
    const dockerfile = `
# Brewnet Auto-Generated Dockerfile
# Framework: ${options.framework}
# Language: ${options.language}
# Generated: ${new Date().toISOString()}

${builder}

${runtime}

EXPOSE ${this.getPort(options.framework)}

${options.includeHealthCheck ? this.getHealthCheck(options) : '# Health check disabled'}

CMD ${entrypoint}
`;

    return dockerfile;
  }

  private getBaseImage(options: DockerfileOptions): string {
    if (options.baseImage) return options.baseImage;

    const images: Record<string, string> = {
      'python-fastapi': 'python:3.11-slim',
      'python-django': 'python:3.11-slim',
      'nodejs-express': 'node:18-alpine',
      'nodejs-nest': 'node:18-alpine',
      'java-spring': 'eclipse-temurin:17-jre-alpine',
      'go-gin': 'golang:1.21-alpine',
      'rust-actix': 'rust:latest'
    };

    return images[`${options.language}-${options.framework}`] || 'alpine:latest';
  }

  private getBuilderStage(options: DockerfileOptions): string {
    if (options.language === 'python') {
      return `
FROM ${this.getBaseImage(options)} as builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt
`;
    } else if (options.language === 'nodejs') {
      return `
FROM ${this.getBaseImage(options)} as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
`;
    } else if (options.language === 'java') {
      return `
FROM maven:3.9-eclipse-temurin-17 as builder

WORKDIR /app
COPY . .
RUN mvn clean package -q -DskipTests
`;
    }

    return '';
  }

  private getRuntimeStage(options: DockerfileOptions): string {
    const includeSecurityUser = options.includeSecurityUser !== false;
    const securityUser = includeSecurityUser ? 
      `RUN groupadd -r appuser && useradd -r -g appuser appuser\nUSER appuser` 
      : '';

    if (options.language === 'python') {
      return `
FROM ${this.getBaseImage(options)}

WORKDIR /app

${securityUser}

COPY --from=builder /root/.local /home/appuser/.local
COPY . .

ENV PATH=/home/appuser/.local/bin:$PATH
`;
    } else if (options.language === 'nodejs') {
      return `
FROM ${this.getBaseImage(options)}

WORKDIR /app

${securityUser}

COPY --from=builder /app/node_modules ./node_modules
COPY . .
`;
    }

    return `
FROM ${this.getBaseImage(options)}

WORKDIR /app

${securityUser}

COPY --from=builder /app . .
`;
  }

  private getHealthCheck(options: DockerfileOptions): string {
    const healthchecks: Record<string, string> = {
      'python-fastapi': 
        'HEALTHCHECK --interval=30s --timeout=10s --retries=3 \\\n    CMD python -c "import urllib.request; urllib.request.urlopen(\'http://localhost:8000/health\')" || exit 1',
      'nodejs-express': 
        'HEALTHCHECK --interval=30s --timeout=10s --retries=3 \\\n    CMD node -e "require(\'http\').get(\'http://localhost:3000/health\', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"',
      'java-spring': 
        'HEALTHCHECK --interval=30s --timeout=10s --retries=3 \\\n    CMD curl -f http://localhost:8080/actuator/health || exit 1'
    };

    return healthchecks[`${options.language}-${options.framework}`] || '';
  }

  private getEntrypoint(options: DockerfileOptions): string {
    const entrypoints: Record<string, string> = {
      'python-fastapi': '["uvicorn", "main:app", "--host", "0.0.0.0"]',
      'nodejs-nest': '["npm", "run", "start:prod"]',
      'nodejs-express': '["node", "dist/index.js"]',
      'java-spring': '["java", "-jar", "target/app.jar"]',
    };

    return entrypoints[`${options.language}-${options.framework}`] || '["npm", "start"]';
  }

  private getPort(framework: string): number {
    const ports: Record<string, number> = {
      'fastapi': 8000,
      'django': 8000,
      'express': 3000,
      'nest': 3000,
      'spring': 8080,
      'gin': 8080
    };

    return ports[framework] || 3000;
  }
}
```

---

## GitHub 템플릿

### 템플릿 저장소 구조

```
https://github.com/brewnet/template-backend-python-fastapi
  ├─ .github/
  │  └─ TEMPLATE.yml  # GitHub template 메타데이터
  ├─ main.py
  ├─ requirements.txt
  ├─ Dockerfile
  ├─ docker-compose.yml
  ├─ .env.example
  ├─ README.md
  ├─ tests/
  └─ .gitignore
```

### GitHub 템플릿 사용

```bash
# CLI에서 템플릿 저장소 목록
brewnet create-app --list-templates

# 출력:
# Backend 템플릿:
# ✓ python-fastapi (★★★ 추천)
# ✓ python-django
# ✓ nodejs-nest (★★★ 추천)
# ✓ nodejs-express
# ✓ java-spring
# ✓ go-gin
#
# Frontend 템플릿:
# ✓ react-nextjs (★★★ 추천)
# ✓ react-vite
# ✓ vue-nuxt

# 템플릿으로 생성 (GitHub에서 자동 clone)
brewnet create-app myapp --template python-fastapi
  └─ brewnet/template-backend-python-fastapi에서 복제
  └─ 프로젝트 생성
```

---

## 테스트 일정

### Day 1-2: Backend 템플릿 구현
```
□ Python FastAPI 템플릿
□ Node.js NestJS 템플릿
□ Java Spring Boot 템플릿
□ 테스트 및 검증
```

### Day 3-4: Frontend & 기타
```
□ React Next.js 템플릿
□ Vue Nuxt 템플릿
□ Dockerfile 자동 생성
```

### Day 5: 통합 & 문서
```
□ CLI 명령어 통합 테스트
□ 문서 작성
□ GitHub 템플릿 저장소 생성
```

---

## 요약

### 구현으로 얻는 것
✅ 원커맨드 앱 생성  
✅ 자동 Dockerfile 생성  
✅ 자동 docker-compose.yml 생성  
✅ 프레임워크별 최적화  
✅ 보안 기본값  
✅ 테스트 코드 포함  

### 지원 프레임워크
**Backend**: Python (FastAPI/Django), Node.js (NestJS/Express), Java (Spring), Go (Gin), Rust (Actix)  
**Frontend**: React (Next.js/Vite), Vue (Nuxt/Vite)  
**Mobile**: React Native, Expo  
**Desktop**: Electron, Tauri  

---

**다음 단계**: Day 1부터 Backend 템플릿부터 구현
