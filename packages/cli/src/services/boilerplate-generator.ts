/**
 * T081 — Boilerplate Scaffold Generator
 *
 * Generates project scaffold files (source code, Dockerfiles, configs) for each
 * language+framework combination in the wizard devStack. Supports template variable
 * substitution, sample data generation, storage directory scaffolding, and
 * hot-reload docker-compose.dev.yml generation.
 *
 * @module services/boilerplate-generator
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import type { WizardState, GeneratedFile, Language } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScaffoldTemplate {
  /** Directory name for the scaffolded app (e.g., "nextjs-app") */
  appDir: string;
  /** Template files with posix paths relative to appDir and template content */
  files: { path: string; template: string }[];
}

// Re-export GeneratedFile from shared so consumers can import from here
export type { GeneratedFile };

// ---------------------------------------------------------------------------
// Template Variable Substitution
// ---------------------------------------------------------------------------

/**
 * Replace `${PROJECT_NAME}`, `${DOMAIN}`, and `${ADMIN_USER}` placeholders
 * in template content with actual values from WizardState.
 */
function substituteVars(
  template: string,
  state: WizardState,
): string {
  return template
    .replace(/\$\{PROJECT_NAME\}/g, state.projectName)
    .replace(/\$\{DOMAIN\}/g, state.domain.name)
    .replace(/\$\{ADMIN_USER\}/g, state.admin.username);
}

// ---------------------------------------------------------------------------
// Node.js Templates
// ---------------------------------------------------------------------------

function nextjsTemplate(): ScaffoldTemplate {
  return {
    appDir: 'nextjs-app',
    files: [
      {
        path: 'package.json',
        template: JSON.stringify(
          {
            name: '${PROJECT_NAME}',
            version: '0.1.0',
            private: true,
            scripts: {
              dev: 'next dev',
              build: 'next build',
              start: 'next start',
              lint: 'next lint',
            },
            dependencies: {
              next: '14.2.15',
              react: '^18.3.1',
              'react-dom': '^18.3.1',
            },
            devDependencies: {
              '@types/node': '^20',
              '@types/react': '^18',
              '@types/react-dom': '^18',
              typescript: '^5',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'next.config.js',
        template: [
          '/** @type {import("next").NextConfig} */',
          'const nextConfig = {',
          '  output: "standalone",',
          '};',
          '',
          'module.exports = nextConfig;',
          '',
        ].join('\n'),
      },
      {
        path: 'tsconfig.json',
        template: JSON.stringify(
          {
            compilerOptions: {
              target: 'es5',
              lib: ['dom', 'dom.iterable', 'esnext'],
              allowJs: true,
              skipLibCheck: true,
              strict: true,
              noEmit: true,
              esModuleInterop: true,
              module: 'esnext',
              moduleResolution: 'bundler',
              resolveJsonModule: true,
              isolatedModules: true,
              jsx: 'preserve',
              incremental: true,
              paths: { '@/*': ['./src/*'] },
            },
            include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
            exclude: ['node_modules'],
          },
          null,
          2,
        ),
      },
      {
        path: 'src/app/layout.tsx',
        template: [
          'import type { Metadata } from "next";',
          '',
          'export const metadata: Metadata = {',
          '  title: "${PROJECT_NAME}",',
          '  description: "Powered by Brewnet",',
          '};',
          '',
          'export default function RootLayout({',
          '  children,',
          '}: {',
          '  children: React.ReactNode;',
          '}) {',
          '  return (',
          '    <html lang="en">',
          '      <body>{children}</body>',
          '    </html>',
          '  );',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app/page.tsx',
        template: [
          'export default function Home() {',
          '  return (',
          '    <main>',
          '      <h1>${PROJECT_NAME}</h1>',
          '      <p>Your home server, brewed fresh.</p>',
          '    </main>',
          '  );',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM node:20-alpine AS base',
          '',
          'FROM base AS deps',
          'WORKDIR /app',
          'COPY package.json package-lock.json* ./',
          'RUN npm ci',
          '',
          'FROM base AS builder',
          'WORKDIR /app',
          'COPY --from=deps /app/node_modules ./node_modules',
          'COPY . .',
          'RUN npm run build',
          '',
          'FROM base AS runner',
          'WORKDIR /app',
          'ENV NODE_ENV=production',
          'RUN addgroup --system --gid 1001 nodejs',
          'RUN adduser --system --uid 1001 nextjs',
          'COPY --from=builder /app/public ./public',
          'COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./',
          'COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static',
          'USER nextjs',
          'EXPOSE 3000',
          'ENV PORT=3000',
          'CMD ["node", "server.js"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: [
          'node_modules',
          '.next',
          '.git',
          'Dockerfile',
          '.dockerignore',
          '',
        ].join('\n'),
      },
    ],
  };
}

function expressTemplate(): ScaffoldTemplate {
  return {
    appDir: 'express-app',
    files: [
      {
        path: 'package.json',
        template: JSON.stringify(
          {
            name: '${PROJECT_NAME}',
            version: '0.1.0',
            private: true,
            scripts: {
              dev: 'tsx watch src/index.ts',
              build: 'tsc',
              start: 'node dist/index.js',
            },
            dependencies: {
              express: '^4.21.0',
            },
            devDependencies: {
              '@types/express': '^4.17.21',
              '@types/node': '^20',
              tsx: '^4.19.0',
              typescript: '^5',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'tsconfig.json',
        template: JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'commonjs',
              lib: ['ES2022'],
              outDir: './dist',
              rootDir: './src',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              resolveJsonModule: true,
              declaration: true,
            },
            include: ['src'],
            exclude: ['node_modules', 'dist'],
          },
          null,
          2,
        ),
      },
      {
        path: 'src/index.ts',
        template: [
          'import express from "express";',
          '',
          'const app = express();',
          'const port = process.env.PORT || 3000;',
          '',
          'app.use(express.json());',
          '',
          'app.get("/", (_req, res) => {',
          '  res.json({',
          '    name: "${PROJECT_NAME}",',
          '    status: "ok",',
          '    domain: "${DOMAIN}",',
          '  });',
          '});',
          '',
          'app.get("/health", (_req, res) => {',
          '  res.json({ status: "healthy" });',
          '});',
          '',
          'app.listen(port, () => {',
          '  console.log(`${PROJECT_NAME} listening on port ${port}`);',
          '});',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM node:20-alpine AS builder',
          'WORKDIR /app',
          'COPY package.json package-lock.json* ./',
          'RUN npm ci',
          'COPY . .',
          'RUN npm run build',
          '',
          'FROM node:20-alpine AS runner',
          'WORKDIR /app',
          'ENV NODE_ENV=production',
          'COPY --from=builder /app/dist ./dist',
          'COPY --from=builder /app/package.json ./package.json',
          'COPY --from=builder /app/node_modules ./node_modules',
          'RUN addgroup --system --gid 1001 appgroup',
          'RUN adduser --system --uid 1001 appuser',
          'USER appuser',
          'EXPOSE 3000',
          'CMD ["node", "dist/index.js"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['node_modules', 'dist', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}

function nestjsTemplate(): ScaffoldTemplate {
  return {
    appDir: 'nestjs-app',
    files: [
      {
        path: 'package.json',
        template: JSON.stringify(
          {
            name: '${PROJECT_NAME}',
            version: '0.1.0',
            private: true,
            scripts: {
              dev: 'nest start --watch',
              build: 'nest build',
              start: 'node dist/main.js',
              'start:prod': 'node dist/main.js',
            },
            dependencies: {
              '@nestjs/common': '^10.4.1',
              '@nestjs/core': '^10.4.1',
              '@nestjs/platform-express': '^10.4.1',
              'reflect-metadata': '^0.2.2',
              rxjs: '^7.8.1',
            },
            devDependencies: {
              '@nestjs/cli': '^10.4.4',
              '@types/node': '^20',
              typescript: '^5',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'tsconfig.json',
        template: JSON.stringify(
          {
            compilerOptions: {
              module: 'commonjs',
              declaration: true,
              removeComments: true,
              emitDecoratorMetadata: true,
              experimentalDecorators: true,
              allowSyntheticDefaultImports: true,
              target: 'ES2022',
              sourceMap: true,
              outDir: './dist',
              rootDir: './src',
              strict: true,
              skipLibCheck: true,
            },
            include: ['src'],
          },
          null,
          2,
        ),
      },
      {
        path: 'src/main.ts',
        template: [
          'import { NestFactory } from "@nestjs/core";',
          'import { Module, Controller, Get } from "@nestjs/common";',
          '',
          '@Controller()',
          'class AppController {',
          '  @Get()',
          '  getRoot() {',
          '    return {',
          '      name: "${PROJECT_NAME}",',
          '      status: "ok",',
          '      domain: "${DOMAIN}",',
          '    };',
          '  }',
          '',
          '  @Get("health")',
          '  getHealth() {',
          '    return { status: "healthy" };',
          '  }',
          '}',
          '',
          '@Module({',
          '  controllers: [AppController],',
          '})',
          'class AppModule {}',
          '',
          'async function bootstrap() {',
          '  const app = await NestFactory.create(AppModule);',
          '  await app.listen(process.env.PORT || 3000);',
          '}',
          '',
          'bootstrap();',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM node:20-alpine AS builder',
          'WORKDIR /app',
          'COPY package.json package-lock.json* ./',
          'RUN npm ci',
          'COPY . .',
          'RUN npm run build',
          '',
          'FROM node:20-alpine AS runner',
          'WORKDIR /app',
          'ENV NODE_ENV=production',
          'COPY --from=builder /app/dist ./dist',
          'COPY --from=builder /app/package.json ./package.json',
          'COPY --from=builder /app/node_modules ./node_modules',
          'RUN addgroup --system --gid 1001 appgroup',
          'RUN adduser --system --uid 1001 appuser',
          'USER appuser',
          'EXPOSE 3000',
          'CMD ["node", "dist/main.js"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['node_modules', 'dist', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Python Templates
// ---------------------------------------------------------------------------

function fastapiTemplate(): ScaffoldTemplate {
  return {
    appDir: 'fastapi-app',
    files: [
      {
        path: 'requirements.txt',
        template: ['fastapi==0.115.0', 'uvicorn[standard]==0.31.0', 'pydantic==2.9.2', ''].join(
          '\n',
        ),
      },
      {
        path: 'main.py',
        template: [
          'from fastapi import FastAPI',
          '',
          'app = FastAPI(title="${PROJECT_NAME}", version="0.1.0")',
          '',
          '',
          '@app.get("/")',
          'async def root():',
          '    return {',
          '        "name": "${PROJECT_NAME}",',
          '        "status": "ok",',
          '        "domain": "${DOMAIN}",',
          '    }',
          '',
          '',
          '@app.get("/health")',
          'async def health():',
          '    return {"status": "healthy"}',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM python:3.12-slim AS builder',
          'WORKDIR /app',
          'COPY requirements.txt .',
          'RUN pip install --no-cache-dir --prefix=/install -r requirements.txt',
          '',
          'FROM python:3.12-slim',
          'WORKDIR /app',
          'COPY --from=builder /install /usr/local',
          'COPY . .',
          'RUN addgroup --system --gid 1001 appgroup && \\',
          '    adduser --system --uid 1001 --gid 1001 appuser',
          'USER appuser',
          'EXPOSE 8000',
          'CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['__pycache__', '*.pyc', '.venv', '.git', 'Dockerfile', '.dockerignore', ''].join(
          '\n',
        ),
      },
    ],
  };
}

function djangoTemplate(): ScaffoldTemplate {
  return {
    appDir: 'django-app',
    files: [
      {
        path: 'requirements.txt',
        template: ['django==5.1.1', 'gunicorn==23.0.0', 'psycopg2-binary==2.9.9', ''].join('\n'),
      },
      {
        path: 'manage.py',
        template: [
          '#!/usr/bin/env python',
          '"""Django management script for ${PROJECT_NAME}."""',
          'import os',
          'import sys',
          '',
          '',
          'def main():',
          '    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")',
          '    try:',
          '        from django.core.management import execute_from_command_line',
          '    except ImportError as exc:',
          '        raise ImportError(',
          '            "Couldn\'t import Django. Are you sure it\'s installed?"',
          '        ) from exc',
          '    execute_from_command_line(sys.argv)',
          '',
          '',
          'if __name__ == "__main__":',
          '    main()',
          '',
        ].join('\n'),
      },
      {
        path: 'config/__init__.py',
        template: '',
      },
      {
        path: 'config/settings.py',
        template: [
          'import os',
          'from pathlib import Path',
          '',
          'BASE_DIR = Path(__file__).resolve().parent.parent',
          'SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "change-me-in-production")',
          'DEBUG = os.environ.get("DJANGO_DEBUG", "False").lower() == "true"',
          'ALLOWED_HOSTS = ["${DOMAIN}", "localhost", "127.0.0.1"]',
          '',
          'INSTALLED_APPS = [',
          '    "django.contrib.admin",',
          '    "django.contrib.auth",',
          '    "django.contrib.contenttypes",',
          '    "django.contrib.sessions",',
          '    "django.contrib.messages",',
          '    "django.contrib.staticfiles",',
          ']',
          '',
          'MIDDLEWARE = [',
          '    "django.middleware.security.SecurityMiddleware",',
          '    "django.contrib.sessions.middleware.SessionMiddleware",',
          '    "django.middleware.common.CommonMiddleware",',
          '    "django.middleware.csrf.CsrfViewMiddleware",',
          '    "django.contrib.auth.middleware.AuthenticationMiddleware",',
          '    "django.contrib.messages.middleware.MessageMiddleware",',
          ']',
          '',
          'ROOT_URLCONF = "config.urls"',
          '',
          'DATABASES = {',
          '    "default": {',
          '        "ENGINE": "django.db.backends.sqlite3",',
          '        "NAME": BASE_DIR / "db.sqlite3",',
          '    }',
          '}',
          '',
          'STATIC_URL = "/static/"',
          'STATIC_ROOT = BASE_DIR / "staticfiles"',
          'DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"',
          '',
        ].join('\n'),
      },
      {
        path: 'config/urls.py',
        template: [
          'from django.contrib import admin',
          'from django.urls import path',
          'from django.http import JsonResponse',
          '',
          '',
          'def health(request):',
          '    return JsonResponse({"status": "healthy"})',
          '',
          '',
          'urlpatterns = [',
          '    path("admin/", admin.site.urls),',
          '    path("health/", health),',
          ']',
          '',
        ].join('\n'),
      },
      {
        path: 'config/wsgi.py',
        template: [
          'import os',
          'from django.core.wsgi import get_wsgi_application',
          '',
          'os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")',
          'application = get_wsgi_application()',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM python:3.12-slim AS builder',
          'WORKDIR /app',
          'COPY requirements.txt .',
          'RUN pip install --no-cache-dir --prefix=/install -r requirements.txt',
          '',
          'FROM python:3.12-slim',
          'WORKDIR /app',
          'COPY --from=builder /install /usr/local',
          'COPY . .',
          'RUN python manage.py collectstatic --noinput 2>/dev/null || true',
          'RUN addgroup --system --gid 1001 appgroup && \\',
          '    adduser --system --uid 1001 --gid 1001 appuser',
          'USER appuser',
          'EXPOSE 8000',
          'CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: [
          '__pycache__',
          '*.pyc',
          '.venv',
          'db.sqlite3',
          '.git',
          'Dockerfile',
          '.dockerignore',
          '',
        ].join('\n'),
      },
    ],
  };
}

function flaskTemplate(): ScaffoldTemplate {
  return {
    appDir: 'flask-app',
    files: [
      {
        path: 'requirements.txt',
        template: ['flask==3.0.3', 'gunicorn==23.0.0', ''].join('\n'),
      },
      {
        path: 'app.py',
        template: [
          'from flask import Flask, jsonify',
          '',
          'app = Flask(__name__)',
          '',
          '',
          '@app.route("/")',
          'def root():',
          '    return jsonify({',
          '        "name": "${PROJECT_NAME}",',
          '        "status": "ok",',
          '        "domain": "${DOMAIN}",',
          '    })',
          '',
          '',
          '@app.route("/health")',
          'def health():',
          '    return jsonify({"status": "healthy"})',
          '',
          '',
          'if __name__ == "__main__":',
          '    app.run(host="0.0.0.0", port=8000, debug=False)',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM python:3.12-slim AS builder',
          'WORKDIR /app',
          'COPY requirements.txt .',
          'RUN pip install --no-cache-dir --prefix=/install -r requirements.txt',
          '',
          'FROM python:3.12-slim',
          'WORKDIR /app',
          'COPY --from=builder /install /usr/local',
          'COPY . .',
          'RUN addgroup --system --gid 1001 appgroup && \\',
          '    adduser --system --uid 1001 --gid 1001 appuser',
          'USER appuser',
          'EXPOSE 8000',
          'CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8000"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['__pycache__', '*.pyc', '.venv', '.git', 'Dockerfile', '.dockerignore', ''].join(
          '\n',
        ),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Java Templates
// ---------------------------------------------------------------------------

function javaPureTemplate(): ScaffoldTemplate {
  return {
    appDir: 'java-app',
    files: [
      {
        path: 'src/main/java/Main.java',
        template: [
          'import com.sun.net.httpserver.HttpServer;',
          'import java.io.IOException;',
          'import java.io.OutputStream;',
          'import java.net.InetSocketAddress;',
          '',
          'public class Main {',
          '    public static void main(String[] args) throws IOException {',
          '        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));',
          '        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);',
          '',
          '        server.createContext("/", exchange -> {',
          '            String response = "{\\"name\\":\\"${PROJECT_NAME}\\",\\"status\\":\\"ok\\",\\"domain\\":\\"${DOMAIN}\\"}";',
          '            exchange.getResponseHeaders().set("Content-Type", "application/json");',
          '            exchange.sendResponseHeaders(200, response.getBytes().length);',
          '            try (OutputStream os = exchange.getResponseBody()) {',
          '                os.write(response.getBytes());',
          '            }',
          '        });',
          '',
          '        server.createContext("/health", exchange -> {',
          '            String response = "{\\"status\\":\\"healthy\\"}";',
          '            exchange.getResponseHeaders().set("Content-Type", "application/json");',
          '            exchange.sendResponseHeaders(200, response.getBytes().length);',
          '            try (OutputStream os = exchange.getResponseBody()) {',
          '                os.write(response.getBytes());',
          '            }',
          '        });',
          '',
          '        server.setExecutor(null);',
          '        server.start();',
          '        System.out.println("${PROJECT_NAME} listening on port " + port);',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM eclipse-temurin:21-jdk-alpine AS builder',
          'WORKDIR /app',
          'COPY src ./src',
          'RUN mkdir -p build && javac -d build src/main/java/Main.java',
          '',
          'FROM eclipse-temurin:21-jre-alpine',
          'WORKDIR /app',
          'COPY --from=builder /app/build .',
          'RUN addgroup --system --gid 1001 appgroup && \\',
          '    adduser --system --uid 1001 -G appgroup appuser',
          'USER appuser',
          'EXPOSE 8080',
          'CMD ["java", "Main"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['build', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}

function springTemplate(): ScaffoldTemplate {
  return {
    appDir: 'spring-app',
    files: [
      {
        path: 'pom.xml',
        template: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<project xmlns="http://maven.apache.org/POM/4.0.0"',
          '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
          '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">',
          '  <modelVersion>4.0.0</modelVersion>',
          '  <parent>',
          '    <groupId>org.springframework.boot</groupId>',
          '    <artifactId>spring-boot-starter-parent</artifactId>',
          '    <version>3.3.4</version>',
          '  </parent>',
          '  <groupId>com.brewnet</groupId>',
          '  <artifactId>${PROJECT_NAME}</artifactId>',
          '  <version>0.1.0</version>',
          '  <dependencies>',
          '    <dependency>',
          '      <groupId>org.springframework.boot</groupId>',
          '      <artifactId>spring-boot-starter-web</artifactId>',
          '    </dependency>',
          '    <dependency>',
          '      <groupId>org.springframework.boot</groupId>',
          '      <artifactId>spring-boot-starter-actuator</artifactId>',
          '    </dependency>',
          '  </dependencies>',
          '  <build>',
          '    <plugins>',
          '      <plugin>',
          '        <groupId>org.springframework.boot</groupId>',
          '        <artifactId>spring-boot-maven-plugin</artifactId>',
          '      </plugin>',
          '    </plugins>',
          '  </build>',
          '</project>',
          '',
        ].join('\n'),
      },
      {
        path: 'src/main/java/com/brewnet/Application.java',
        template: [
          'package com.brewnet;',
          '',
          'import org.springframework.boot.SpringApplication;',
          'import org.springframework.boot.autoconfigure.SpringBootApplication;',
          'import org.springframework.web.bind.annotation.GetMapping;',
          'import org.springframework.web.bind.annotation.RestController;',
          '',
          'import java.util.Map;',
          '',
          '@SpringBootApplication',
          '@RestController',
          'public class Application {',
          '',
          '    public static void main(String[] args) {',
          '        SpringApplication.run(Application.class, args);',
          '    }',
          '',
          '    @GetMapping("/")',
          '    public Map<String, String> root() {',
          '        return Map.of(',
          '            "name", "${PROJECT_NAME}",',
          '            "status", "ok",',
          '            "domain", "${DOMAIN}"',
          '        );',
          '    }',
          '',
          '    @GetMapping("/health")',
          '    public Map<String, String> health() {',
          '        return Map.of("status", "healthy");',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/main/resources/application.properties',
        template: [
          'spring.application.name=${PROJECT_NAME}',
          'server.port=8080',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM eclipse-temurin:21-jdk-alpine AS builder',
          'WORKDIR /app',
          'COPY pom.xml .',
          'COPY src ./src',
          'RUN apk add --no-cache maven && mvn package -DskipTests',
          '',
          'FROM eclipse-temurin:21-jre-alpine',
          'WORKDIR /app',
          'COPY --from=builder /app/target/*.jar app.jar',
          'RUN addgroup --system --gid 1001 appgroup && \\',
          '    adduser --system --uid 1001 -G appgroup appuser',
          'USER appuser',
          'EXPOSE 8080',
          'CMD ["java", "-jar", "app.jar"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['target', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}

function springbootTemplate(): ScaffoldTemplate {
  // Spring Boot is very similar to Spring but uses spring-boot-starter-webflux
  // and includes additional configuration for production readiness
  return {
    appDir: 'springboot-app',
    files: [
      {
        path: 'pom.xml',
        template: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<project xmlns="http://maven.apache.org/POM/4.0.0"',
          '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
          '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">',
          '  <modelVersion>4.0.0</modelVersion>',
          '  <parent>',
          '    <groupId>org.springframework.boot</groupId>',
          '    <artifactId>spring-boot-starter-parent</artifactId>',
          '    <version>3.3.4</version>',
          '  </parent>',
          '  <groupId>com.brewnet</groupId>',
          '  <artifactId>${PROJECT_NAME}</artifactId>',
          '  <version>0.1.0</version>',
          '  <dependencies>',
          '    <dependency>',
          '      <groupId>org.springframework.boot</groupId>',
          '      <artifactId>spring-boot-starter-web</artifactId>',
          '    </dependency>',
          '    <dependency>',
          '      <groupId>org.springframework.boot</groupId>',
          '      <artifactId>spring-boot-starter-actuator</artifactId>',
          '    </dependency>',
          '    <dependency>',
          '      <groupId>org.springframework.boot</groupId>',
          '      <artifactId>spring-boot-devtools</artifactId>',
          '      <scope>runtime</scope>',
          '      <optional>true</optional>',
          '    </dependency>',
          '  </dependencies>',
          '  <build>',
          '    <plugins>',
          '      <plugin>',
          '        <groupId>org.springframework.boot</groupId>',
          '        <artifactId>spring-boot-maven-plugin</artifactId>',
          '        <configuration>',
          '          <layers>',
          '            <enabled>true</enabled>',
          '          </layers>',
          '        </configuration>',
          '      </plugin>',
          '    </plugins>',
          '  </build>',
          '</project>',
          '',
        ].join('\n'),
      },
      {
        path: 'src/main/java/com/brewnet/Application.java',
        template: [
          'package com.brewnet;',
          '',
          'import org.springframework.boot.SpringApplication;',
          'import org.springframework.boot.autoconfigure.SpringBootApplication;',
          'import org.springframework.web.bind.annotation.GetMapping;',
          'import org.springframework.web.bind.annotation.RestController;',
          '',
          'import java.util.Map;',
          '',
          '@SpringBootApplication',
          '@RestController',
          'public class Application {',
          '',
          '    public static void main(String[] args) {',
          '        SpringApplication.run(Application.class, args);',
          '    }',
          '',
          '    @GetMapping("/")',
          '    public Map<String, String> root() {',
          '        return Map.of(',
          '            "name", "${PROJECT_NAME}",',
          '            "status", "ok",',
          '            "domain", "${DOMAIN}"',
          '        );',
          '    }',
          '',
          '    @GetMapping("/health")',
          '    public Map<String, String> health() {',
          '        return Map.of("status", "healthy");',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/main/resources/application.yml',
        template: [
          'spring:',
          '  application:',
          '    name: ${PROJECT_NAME}',
          '',
          'server:',
          '  port: 8080',
          '',
          'management:',
          '  endpoints:',
          '    web:',
          '      exposure:',
          '        include: health,info',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM eclipse-temurin:21-jdk-alpine AS builder',
          'WORKDIR /app',
          'COPY pom.xml .',
          'COPY src ./src',
          'RUN apk add --no-cache maven && mvn package -DskipTests',
          '',
          'FROM eclipse-temurin:21-jre-alpine',
          'WORKDIR /app',
          'COPY --from=builder /app/target/*.jar app.jar',
          'RUN addgroup --system --gid 1001 appgroup && \\',
          '    adduser --system --uid 1001 -G appgroup appuser',
          'USER appuser',
          'EXPOSE 8080',
          'CMD ["java", "-jar", "app.jar"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['target', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}


// ---------------------------------------------------------------------------
// Go Template
// ---------------------------------------------------------------------------

function goTemplate(): ScaffoldTemplate {
  return {
    appDir: 'go-app',
    files: [
      {
        path: 'go.mod',
        template: [
          'module ${PROJECT_NAME}',
          '',
          'go 1.22',
          '',
        ].join('\n'),
      },
      {
        path: 'main.go',
        template: [
          'package main',
          '',
          'import (',
          '\t"encoding/json"',
          '\t"log"',
          '\t"net/http"',
          '\t"os"',
          ')',
          '',
          'type StatusResponse struct {',
          '\tName   string `json:"name"`',
          '\tStatus string `json:"status"`',
          '\tDomain string `json:"domain"`',
          '}',
          '',
          'type HealthResponse struct {',
          '\tStatus string `json:"status"`',
          '}',
          '',
          'func main() {',
          '\tport := os.Getenv("PORT")',
          '\tif port == "" {',
          '\t\tport = "8080"',
          '\t}',
          '',
          '\thttp.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {',
          '\t\tw.Header().Set("Content-Type", "application/json")',
          '\t\tjson.NewEncoder(w).Encode(StatusResponse{',
          '\t\t\tName:   "${PROJECT_NAME}",',
          '\t\t\tStatus: "ok",',
          '\t\t\tDomain: "${DOMAIN}",',
          '\t\t})',
          '\t})',
          '',
          '\thttp.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {',
          '\t\tw.Header().Set("Content-Type", "application/json")',
          '\t\tjson.NewEncoder(w).Encode(HealthResponse{Status: "healthy"})',
          '\t})',
          '',
          '\tlog.Printf("${PROJECT_NAME} listening on port %s", port)',
          '\tlog.Fatal(http.ListenAndServe(":"+port, nil))',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM golang:1.22-alpine AS builder',
          'WORKDIR /app',
          'COPY go.mod go.sum* ./',
          'RUN go mod download 2>/dev/null || true',
          'COPY . .',
          'RUN CGO_ENABLED=0 GOOS=linux go build -o server .',
          '',
          'FROM alpine:3.20',
          'WORKDIR /app',
          'COPY --from=builder /app/server .',
          'RUN addgroup --system --gid 1001 appgroup && \\',
          '    adduser --system --uid 1001 -G appgroup appuser',
          'USER appuser',
          'EXPOSE 8080',
          'CMD ["./server"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['*.exe', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rust Template
// ---------------------------------------------------------------------------

function rustTemplate(): ScaffoldTemplate {
  return {
    appDir: 'rust-app',
    files: [
      {
        path: 'Cargo.toml',
        template: [
          '[package]',
          'name = "${PROJECT_NAME}"',
          'version = "0.1.0"',
          'edition = "2021"',
          '',
          '[dependencies]',
          'actix-web = "4"',
          'serde = { version = "1", features = ["derive"] }',
          'serde_json = "1"',
          'tokio = { version = "1", features = ["macros", "rt-multi-thread"] }',
          '',
        ].join('\n'),
      },
      {
        path: 'src/main.rs',
        template: [
          'use actix_web::{get, web, App, HttpResponse, HttpServer, Responder};',
          'use serde::Serialize;',
          '',
          '#[derive(Serialize)]',
          'struct StatusResponse {',
          '    name: String,',
          '    status: String,',
          '    domain: String,',
          '}',
          '',
          '#[derive(Serialize)]',
          'struct HealthResponse {',
          '    status: String,',
          '}',
          '',
          '#[get("/")]',
          'async fn root() -> impl Responder {',
          '    HttpResponse::Ok().json(StatusResponse {',
          '        name: "${PROJECT_NAME}".to_string(),',
          '        status: "ok".to_string(),',
          '        domain: "${DOMAIN}".to_string(),',
          '    })',
          '}',
          '',
          '#[get("/health")]',
          'async fn health() -> impl Responder {',
          '    HttpResponse::Ok().json(HealthResponse {',
          '        status: "healthy".to_string(),',
          '    })',
          '}',
          '',
          '#[actix_web::main]',
          'async fn main() -> std::io::Result<()> {',
          '    let port: u16 = std::env::var("PORT")',
          '        .unwrap_or_else(|_| "8080".to_string())',
          '        .parse()',
          '        .expect("PORT must be a number");',
          '',
          '    println!("${PROJECT_NAME} listening on port {}", port);',
          '',
          '    HttpServer::new(|| {',
          '        App::new()',
          '            .service(root)',
          '            .service(health)',
          '    })',
          '    .bind(("0.0.0.0", port))?',
          '    .run()',
          '    .await',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM rust:1.80-alpine AS builder',
          'RUN apk add --no-cache musl-dev',
          'WORKDIR /app',
          'COPY Cargo.toml Cargo.lock* ./',
          'RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release 2>/dev/null || true',
          'COPY . .',
          'RUN cargo build --release',
          '',
          'FROM alpine:3.20',
          'WORKDIR /app',
          'COPY --from=builder /app/target/release/${PROJECT_NAME} .',
          'RUN addgroup --system --gid 1001 appgroup && \\',
          '    adduser --system --uid 1001 -G appgroup appuser',
          'USER appuser',
          'EXPOSE 8080',
          'CMD ["./${PROJECT_NAME}"]',
          '',
        ].join('\n'),
      },
      {
        path: '.dockerignore',
        template: ['target', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Sample Data Templates
// ---------------------------------------------------------------------------

/**
 * Return sample/seed/demo files for a given framework.
 * Only returned when `state.boilerplate.sampleData === true`.
 */
function getSampleDataFiles(
  language: Language,
  framework: string,
): { path: string; template: string }[] {
  switch (language) {
    case 'nodejs':
      switch (framework) {
        case 'nextjs':
          return [
            {
              path: 'src/app/globals.css',
              template: [
                ':root {',
                '  --foreground: #171717;',
                '  --background: #ffffff;',
                '}',
                '',
                'body {',
                '  color: var(--foreground);',
                '  background: var(--background);',
                '  font-family: system-ui, -apple-system, sans-serif;',
                '  margin: 0;',
                '  padding: 2rem;',
                '}',
                '',
              ].join('\n'),
            },
            {
              path: 'src/lib/sample-data.ts',
              template: [
                '// Sample data for ${PROJECT_NAME}',
                'export const SAMPLE_ITEMS = [',
                '  { id: 1, title: "Welcome", body: "Welcome to ${PROJECT_NAME}" },',
                '  { id: 2, title: "Getting Started", body: "Check the docs at ${DOMAIN}" },',
                '];',
                '',
                'export const SAMPLE_USERS = [',
                '  { id: 1, name: "${ADMIN_USER}", role: "admin" },',
                '  { id: 2, name: "demo", role: "viewer" },',
                '];',
                '',
              ].join('\n'),
            },
          ];
        case 'express':
          return [
            {
              path: 'src/seed.ts',
              template: [
                '// Sample seed data for ${PROJECT_NAME}',
                'export const SAMPLE_ITEMS = [',
                '  { id: 1, name: "Item 1", description: "First sample item" },',
                '  { id: 2, name: "Item 2", description: "Second sample item" },',
                '  { id: 3, name: "Item 3", description: "Third sample item" },',
                '];',
                '',
                'export const SAMPLE_USERS = [',
                '  { id: 1, name: "${ADMIN_USER}", role: "admin" },',
                '  { id: 2, name: "demo", role: "viewer" },',
                '];',
                '',
              ].join('\n'),
            },
          ];
        case 'nestjs':
          return [
            {
              path: 'src/seed.ts',
              template: [
                '// Sample seed data for ${PROJECT_NAME}',
                'export const SAMPLE_ITEMS = [',
                '  { id: 1, name: "Item 1", description: "First sample item" },',
                '  { id: 2, name: "Item 2", description: "Second sample item" },',
                '];',
                '',
              ].join('\n'),
            },
          ];
        default:
          return [];
      }

    case 'python':
      switch (framework) {
        case 'fastapi':
          return [
            {
              path: 'seed_data.py',
              template: [
                '"""Sample seed data for ${PROJECT_NAME}."""',
                '',
                'SAMPLE_ITEMS = [',
                '    {"id": 1, "name": "Item 1", "description": "First sample item"},',
                '    {"id": 2, "name": "Item 2", "description": "Second sample item"},',
                ']',
                '',
                'SAMPLE_USERS = [',
                '    {"id": 1, "name": "${ADMIN_USER}", "role": "admin"},',
                '    {"id": 2, "name": "demo", "role": "viewer"},',
                ']',
                '',
              ].join('\n'),
            },
          ];
        case 'django':
          return [
            {
              path: 'fixtures/seed.json',
              template: JSON.stringify(
                [
                  {
                    model: 'auth.user',
                    pk: 1,
                    fields: {
                      username: '${ADMIN_USER}',
                      is_staff: true,
                      is_superuser: true,
                    },
                  },
                ],
                null,
                2,
              ),
            },
          ];
        case 'flask':
          return [
            {
              path: 'seed_data.py',
              template: [
                '"""Sample seed data for ${PROJECT_NAME}."""',
                '',
                'SAMPLE_ITEMS = [',
                '    {"id": 1, "name": "Item 1"},',
                '    {"id": 2, "name": "Item 2"},',
                ']',
                '',
              ].join('\n'),
            },
          ];
        default:
          return [];
      }

    case 'java':
      return [
        {
          path: 'src/main/resources/data.json',
          template: JSON.stringify(
            {
              items: [
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' },
              ],
            },
            null,
            2,
          ),
        },
      ];

    case 'go':
      return [
        {
          path: 'seed.go',
          template: [
            'package main',
            '',
            '// SeedItem represents a sample data item.',
            'type SeedItem struct {',
            '\tID   int    `json:"id"`',
            '\tName string `json:"name"`',
            '}',
            '',
            '// SampleItems provides demo seed data.',
            'var SampleItems = []SeedItem{',
            '\t{ID: 1, Name: "Item 1"},',
            '\t{ID: 2, Name: "Item 2"},',
            '}',
            '',
          ].join('\n'),
        },
      ];

    case 'rust':
      return [
        {
          path: 'src/seed.rs',
          template: [
            'use serde::Serialize;',
            '',
            '#[derive(Serialize)]',
            'pub struct SeedItem {',
            '    pub id: u32,',
            '    pub name: String,',
            '}',
            '',
            'pub fn sample_items() -> Vec<SeedItem> {',
            '    vec![',
            '        SeedItem { id: 1, name: "Item 1".to_string() },',
            '        SeedItem { id: 2, name: "Item 2".to_string() },',
            '    ]',
            '}',
            '',
          ].join('\n'),
        },
      ];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Dev Command Mapping (for hot-reload docker-compose.dev.yml)
// ---------------------------------------------------------------------------

interface DevConfig {
  /** Source path to mount (relative from appDir) */
  srcMount: string;
  /** Container path where source is mounted */
  containerMount: string;
  /** Dev command to run with hot-reload */
  command: string;
}

function getDevConfig(language: Language, framework: string): DevConfig {
  switch (language) {
    case 'nodejs':
      switch (framework) {
        case 'nextjs':
          return { srcMount: 'src', containerMount: '/app/src', command: 'npm run dev' };
        case 'express':
          return { srcMount: 'src', containerMount: '/app/src', command: 'npx tsx watch src/index.ts' };
        case 'nestjs':
          return { srcMount: 'src', containerMount: '/app/src', command: 'npx nest start --watch' };
        default:
          return { srcMount: 'src', containerMount: '/app/src', command: 'npm run dev' };
      }

    case 'python':
      switch (framework) {
        case 'fastapi':
          return { srcMount: '.', containerMount: '/app', command: 'uvicorn main:app --host 0.0.0.0 --port 8000 --reload' };
        case 'django':
          return { srcMount: '.', containerMount: '/app', command: 'python manage.py runserver 0.0.0.0:8000' };
        case 'flask':
          return { srcMount: '.', containerMount: '/app', command: 'flask run --host=0.0.0.0 --port=8000 --reload' };
        default:
          return { srcMount: '.', containerMount: '/app', command: 'python -u main.py' };
      }

    case 'java':
      switch (framework) {
        case 'spring':
        case 'springboot':
          return { srcMount: 'src', containerMount: '/app/src', command: 'mvn spring-boot:run' };
        default:
          return { srcMount: 'src', containerMount: '/app/src', command: 'java Main' };
      }

    case 'go':
      return { srcMount: '.', containerMount: '/app', command: 'go run .' };

    case 'rust':
      return { srcMount: 'src', containerMount: '/app/src', command: 'cargo watch -x run' };

    default:
      return { srcMount: '.', containerMount: '/app', command: 'echo "No dev command configured"' };
  }
}

// ---------------------------------------------------------------------------
// Template Registry
// ---------------------------------------------------------------------------

/**
 * Return the scaffold template for a given language + framework combination.
 *
 * For languages without framework options (go, rust), the framework parameter
 * is ignored and may be an empty string.
 *
 * @param language  - Programming language (e.g., "nodejs", "python")
 * @param framework - Framework identifier (e.g., "nextjs", "fastapi"), or empty string
 * @returns ScaffoldTemplate with appDir name and file templates
 */
export function getScaffoldTemplate(
  language: Language,
  framework: string,
): ScaffoldTemplate {
  switch (language) {
    case 'nodejs':
      switch (framework) {
        case 'nextjs':
          return nextjsTemplate();
        case 'express':
          return expressTemplate();
        case 'nestjs':
          return nestjsTemplate();
        default:
          return expressTemplate();
      }

    case 'python':
      switch (framework) {
        case 'fastapi':
          return fastapiTemplate();
        case 'django':
          return djangoTemplate();
        case 'flask':
          return flaskTemplate();
        default:
          return fastapiTemplate();
      }

    case 'java':
      switch (framework) {
        case 'java-pure':
          return javaPureTemplate();
        case 'spring':
          return springTemplate();
        case 'springboot':
          return springbootTemplate();
        default:
          return javaPureTemplate();
      }

    case 'go':
      return goTemplate();

    case 'rust':
      return rustTemplate();

    default:
      // Fallback: return a minimal Node.js/Express template
      return expressTemplate();
  }
}

// ---------------------------------------------------------------------------
// docker-compose.dev.yml Generator
// ---------------------------------------------------------------------------

/**
 * Generate a docker-compose.dev.yml for hot-reload development mode.
 *
 * Each app service gets a volume mount mapping the local source directory
 * into the container, and overrides the CMD with the dev/watch command.
 */
function generateDevCompose(
  appEntries: { appDir: string; language: Language; framework: string }[],
): string {
  const lines: string[] = [
    '# Brewnet Development Compose (hot-reload)',
    '# Generated by brewnet boilerplate-generator',
    '# Usage: docker compose -f docker-compose.yml -f docker-compose.dev.yml up',
    '',
    'services:',
  ];

  for (const entry of appEntries) {
    const devCfg = getDevConfig(entry.language, entry.framework);
    const serviceName = entry.appDir;

    lines.push(`  ${serviceName}:`);
    lines.push('    volumes:');
    lines.push(`      - ./apps/${entry.appDir}/${devCfg.srcMount}:${devCfg.containerMount}`);
    lines.push(`    command: ${devCfg.command}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Storage Directory Generator
// ---------------------------------------------------------------------------

/**
 * Generate .gitkeep files for storage directories.
 * Only created when `state.servers.fileBrowser.enabled === true`.
 */
function getStorageGitkeepFiles(): GeneratedFile[] {
  const dirs = [
    'apps/storage/uploads/.gitkeep',
    'apps/storage/temp/.gitkeep',
    'apps/storage/backups/.gitkeep',
  ];

  return dirs.map((path) => ({ path, content: '' }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate boilerplate scaffold files for all configured languages/frameworks.
 *
 * Orchestrates template lookup, variable substitution, sample data inclusion,
 * storage directory creation, and hot-reload compose generation. Writes all
 * files to disk under `outputDir` and returns the full list of generated files.
 *
 * @param state     - Current wizard state with devStack, boilerplate, and server configs
 * @param outputDir - Absolute filesystem path where files will be written
 * @returns Array of GeneratedFile objects with relative paths and content
 */
export async function generateBoilerplate(
  state: WizardState,
  outputDir: string,
): Promise<GeneratedFile[]> {
  // Early return: boilerplate generation disabled
  if (!state.boilerplate.generate) {
    return [];
  }

  // Early return: no languages selected
  if (state.devStack.languages.length === 0) {
    return [];
  }

  const generatedFiles: GeneratedFile[] = [];
  const appEntries: { appDir: string; language: Language; framework: string }[] = [];

  // --- Generate scaffold for each language ---
  for (const language of state.devStack.languages) {
    const framework = state.devStack.frameworks[language] || '';
    const template = getScaffoldTemplate(language, framework);

    appEntries.push({ appDir: template.appDir, language, framework });

    // Process template files
    for (const file of template.files) {
      const substitutedContent = substituteVars(file.template, state);
      const substitutedPath = substituteVars(file.path, state);
      const relativePath = posix.join('apps', template.appDir, substitutedPath);

      generatedFiles.push({
        path: relativePath,
        content: substitutedContent,
      });
    }

    // Include sample data files if requested
    if (state.boilerplate.sampleData) {
      const sampleFiles = getSampleDataFiles(language, framework);
      for (const file of sampleFiles) {
        const substitutedContent = substituteVars(file.template, state);
        const relativePath = posix.join('apps', template.appDir, file.path);

        generatedFiles.push({
          path: relativePath,
          content: substitutedContent,
        });
      }
    }
  }

  // --- Storage directories (when FileBrowser is enabled) ---
  if (state.servers.fileBrowser.enabled) {
    generatedFiles.push(...getStorageGitkeepFiles());
  }

  // --- docker-compose.dev.yml (when devMode is hot-reload) ---
  if (state.boilerplate.devMode === 'hot-reload') {
    generatedFiles.push({
      path: 'docker-compose.dev.yml',
      content: generateDevCompose(appEntries),
    });
  }

  // --- Write files to disk ---
  for (const file of generatedFiles) {
    const absolutePath = join(outputDir, ...file.path.split('/'));
    const dir = dirname(absolutePath);

    mkdirSync(dir, { recursive: true });
    writeFileSync(absolutePath, file.content, 'utf-8');
  }

  return generatedFiles;
}
