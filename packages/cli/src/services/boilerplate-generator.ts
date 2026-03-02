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

function nextjsFullTemplate(): ScaffoldTemplate {
  return {
    appDir: 'nextjs-full-app',
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
              start: 'next start -p 3000',
              test: 'vitest run',
            },
            dependencies: {
              next: '^15.3.0',
              react: '^19.0.0',
              'react-dom': '^19.0.0',
            },
            devDependencies: {
              '@types/node': '^22',
              '@types/react': '^19',
              '@types/react-dom': '^19',
              typescript: '^5',
              vitest: '^3.0.0',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'next.config.ts',
        template: [
          "import type { NextConfig } from 'next';",
          '',
          'const nextConfig: NextConfig = {',
          "  output: 'standalone',",
          '};',
          '',
          'export default nextConfig;',
          '',
        ].join('\n'),
      },
      {
        path: 'tsconfig.json',
        template: JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2017',
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
              plugins: [{ name: 'next' }],
              paths: { '@/*': ['./src/*'] },
            },
            include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
            exclude: ['node_modules'],
          },
          null,
          2,
        ),
      },
      {
        path: 'src/lib/hello.ts',
        template: [
          'export interface HelloData {',
          '  message: string;',
          '  lang: string;',
          '  version: string;',
          '}',
          '',
          'export function getHelloData(): HelloData {',
          '  return {',
          "    message: 'Hello from Next.js!',",
          "    lang: 'nodejs',",
          '    version: process.version,',
          '  };',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app/globals.css',
        template: [
          ':root {',
          '  --foreground: #171717;',
          '  --background: #fafafa;',
          '  --card-bg: #ffffff;',
          '  --border: #e5e7eb;',
          '  --primary: #2563eb;',
          '  --primary-hover: #1d4ed8;',
          '  --muted: #6b7280;',
          '  --radius: 8px;',
          '}',
          '',
          '* { box-sizing: border-box; margin: 0; padding: 0; }',
          '',
          'body {',
          '  color: var(--foreground);',
          '  background: var(--background);',
          '  font-family: system-ui, -apple-system, sans-serif;',
          '  line-height: 1.6;',
          '}',
          '',
          '.container { max-width: 640px; margin: 0 auto; padding: 3rem 1.5rem; }',
          'h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; }',
          '.subtitle { color: var(--muted); margin-bottom: 2rem; }',
          '.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; }',
          '.card-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }',
          '.card-row:last-of-type { border-bottom: none; }',
          '.card-label { color: var(--muted); font-size: 0.875rem; }',
          '.card-value { font-weight: 500; font-family: monospace; }',
          '.card-footer { margin-top: 1rem; display: flex; justify-content: flex-end; }',
          'button { background: var(--primary); color: #fff; border: none; border-radius: var(--radius); padding: 0.5rem 1rem; font-size: 0.875rem; cursor: pointer; }',
          'button:hover { background: var(--primary-hover); }',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app/layout.tsx',
        template: [
          "import type { Metadata } from 'next';",
          "import './globals.css';",
          '',
          'export const metadata: Metadata = {',
          '  title: "${PROJECT_NAME}",',
          '  description: "Powered by Brewnet",',
          '};',
          '',
          'export default function RootLayout({ children }: { children: React.ReactNode }) {',
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
          "import { getHelloData } from '@/lib/hello';",
          "import HelloCard from '@/components/HelloCard';",
          '',
          '// Server Component: data is fetched at render time, no client-side fetch needed',
          'export default function Home() {',
          '  const data = getHelloData();',
          '  return (',
          '    <main className="container">',
          '      <h1>🍺 ${PROJECT_NAME}</h1>',
          '      <p className="subtitle">Next.js Full-Stack — Server Components + API Routes</p>',
          '      <HelloCard data={data} />',
          '    </main>',
          '  );',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/components/HelloCard.tsx',
        template: [
          "'use client';",
          '',
          "import { useState } from 'react';",
          "import type { HelloData } from '@/lib/hello';",
          '',
          'export default function HelloCard({ data }: { data: HelloData }) {',
          '  const [copied, setCopied] = useState(false);',
          '',
          '  const handleCopy = () => {',
          '    navigator.clipboard.writeText(JSON.stringify(data, null, 2));',
          '    setCopied(true);',
          '    setTimeout(() => setCopied(false), 2000);',
          '  };',
          '',
          '  return (',
          '    <div className="card">',
          '      <div className="card-row">',
          '        <span className="card-label">message</span>',
          '        <span className="card-value">{data.message}</span>',
          '      </div>',
          '      <div className="card-row">',
          '        <span className="card-label">lang</span>',
          '        <span className="card-value">{data.lang}</span>',
          '      </div>',
          '      <div className="card-row">',
          '        <span className="card-label">version</span>',
          '        <span className="card-value">{data.version}</span>',
          '      </div>',
          '      <div className="card-footer">',
          "        <button onClick={handleCopy}>{copied ? '✓ Copied!' : 'Copy JSON'}</button>",
          '      </div>',
          '    </div>',
          '  );',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app/route.ts',
        template: [
          "import { NextResponse } from 'next/server';",
          '',
          'export async function GET() {',
          '  return NextResponse.json({',
          "    service: 'nextjs-backend',",
          "    status: 'running',",
          "    message: '🍺 Brewnet says hello!',",
          '  });',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app/api/hello/route.ts',
        template: [
          "import { NextResponse } from 'next/server';",
          "import { getHelloData } from '@/lib/hello';",
          '',
          'export async function GET() {',
          '  return NextResponse.json(getHelloData());',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app/api/echo/route.ts',
        template: [
          "import { NextResponse } from 'next/server';",
          '',
          'export async function POST(request: Request) {',
          '  try {',
          '    const body = await request.json();',
          '    return NextResponse.json(body);',
          '  } catch {',
          '    return NextResponse.json({}, { status: 200 });',
          '  }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/app/health/route.ts',
        template: [
          "import { NextResponse } from 'next/server';",
          '',
          'export async function GET() {',
          '  return NextResponse.json({',
          "    status: 'ok',",
          '    timestamp: new Date().toISOString(),',
          '  });',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM node:22-alpine AS builder',
          'WORKDIR /app',
          'COPY package.json package-lock.json* ./',
          'RUN npm ci',
          'COPY . .',
          'RUN npm run build',
          '',
          'FROM node:22-alpine',
          'RUN adduser -D -h /app appuser',
          'WORKDIR /app',
          'COPY --from=builder /app/.next/standalone ./',
          'COPY --from=builder /app/.next/static ./.next/static',
          'COPY --from=builder /app/public ./public',
          'RUN chown -R appuser:appuser /app',
          'USER appuser',
          'EXPOSE 3000',
          'ENV PORT=3000',
          'ENV HOSTNAME="0.0.0.0"',
          'HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=15s \\',
          '    CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1',
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
        template: ['Django>=6.0,<6.1', 'gunicorn>=23.0', 'psycopg2-binary>=2.9', 'mysqlclient>=2.2', ''].join('\n'),
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
        template: ['Flask>=3.1,<3.2', 'Flask-SQLAlchemy>=3.1,<4.0', 'gunicorn>=23.0', 'psycopg2-binary>=2.9', 'PyMySQL>=1.1', ''].join('\n'),
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
// Go Templates (Gin / Echo / Fiber)
// ---------------------------------------------------------------------------

/** Shared GORM multi-DB database.go for all Go frameworks */
const goDatabase = [
  'package database',
  '',
  'import (',
  '\t"fmt"',
  '\t"os"',
  '',
  '\t"gorm.io/driver/mysql"',
  '\t"gorm.io/driver/postgres"',
  '\t"gorm.io/driver/sqlite"',
  '\t"gorm.io/gorm"',
  ')',
  '',
  'var DB *gorm.DB',
  '',
  'func Connect() error {',
  '\tdriver := os.Getenv("DB_DRIVER")',
  '\tif driver == "" {',
  '\t\tdriver = "postgres"',
  '\t}',
  '',
  '\tvar err error',
  '\tswitch driver {',
  '\tcase "postgres":',
  '\t\tdsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",',
  '\t\t\tgetEnv("DB_HOST", "postgres"), getEnv("DB_PORT", "5432"),',
  '\t\t\tgetEnv("DB_USER", "brewnet"), getEnv("DB_PASSWORD", ""),',
  '\t\t\tgetEnv("DB_NAME", "brewnet_db"))',
  '\t\tDB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})',
  '\tcase "mysql":',
  '\t\tdsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",',
  '\t\t\tgetEnv("MYSQL_USER", "brewnet"), getEnv("MYSQL_PASSWORD", ""),',
  '\t\t\tgetEnv("MYSQL_HOST", "mysql"), getEnv("MYSQL_PORT", "3306"),',
  '\t\t\tgetEnv("MYSQL_DATABASE", "brewnet_db"))',
  '\t\tDB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})',
  '\tcase "sqlite3":',
  '\t\tpath := getEnv("SQLITE_PATH", "./data/brewnet_db.db")',
  '\t\tDB, err = gorm.Open(sqlite.Open(path), &gorm.Config{})',
  '\tdefault:',
  '\t\treturn fmt.Errorf("unsupported DB_DRIVER: %s", driver)',
  '\t}',
  '\treturn err',
  '}',
  '',
  'func CheckConnection() bool {',
  '\tif DB == nil { return false }',
  '\tsqlDB, err := DB.DB()',
  '\tif err != nil { return false }',
  '\treturn sqlDB.Ping() == nil',
  '}',
  '',
  'func getEnv(key, fallback string) string {',
  '\tif v := os.Getenv(key); v != "" { return v }',
  '\treturn fallback',
  '}',
  '',
].join('\n');

/** Shared Dockerfile template for Gin/Echo (golang:1.22-alpine) */
function goDockerfile(goVersion: string, alpineVersion: string): string {
  return [
    `FROM golang:${goVersion}-alpine AS builder`,
    'RUN apk add --no-cache gcc musl-dev',
    'WORKDIR /app',
    'COPY go.mod go.sum* ./',
    'RUN go mod download || true',
    'COPY . .',
    'RUN go mod tidy && CGO_ENABLED=1 go build -o server ./cmd/server',
    '',
    `FROM alpine:${alpineVersion}`,
    'RUN apk --no-cache add ca-certificates && \\',
    '    adduser -D -h /app appuser',
    'WORKDIR /app',
    'COPY --from=builder /app/server .',
    'RUN mkdir -p /app/data && chown -R appuser:appuser /app',
    'USER appuser',
    'EXPOSE 8080',
    'HEALTHCHECK --interval=10s --timeout=5s --retries=3 \\',
    '    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1',
    'ENTRYPOINT ["./server"]',
    '',
  ].join('\n');
}

function ginTemplate(): ScaffoldTemplate {
  return {
    appDir: 'gin-app',
    files: [
      {
        path: 'go.mod',
        template: [
          'module brewnet-go-backend',
          '',
          'go 1.22',
          '',
          'require (',
          '\tgithub.com/gin-contrib/cors v1.7.2',
          '\tgithub.com/gin-gonic/gin v1.10.0',
          '\tgorm.io/driver/mysql v1.5.7',
          '\tgorm.io/driver/postgres v1.5.9',
          '\tgorm.io/driver/sqlite v1.5.6',
          '\tgorm.io/gorm v1.25.12',
          ')',
          '',
        ].join('\n'),
      },
      {
        path: 'cmd/server/main.go',
        template: [
          'package main',
          '',
          'import (',
          '\t"log"',
          '',
          '\t"brewnet-go-backend/internal/database"',
          '\t"brewnet-go-backend/internal/handler"',
          '\t"github.com/gin-contrib/cors"',
          '\t"github.com/gin-gonic/gin"',
          ')',
          '',
          'func main() {',
          '\tif err := database.Connect(); err != nil {',
          '\t\tlog.Printf("Warning: DB connection failed: %v", err)',
          '\t}',
          '',
          '\tr := gin.Default()',
          '\tr.Use(cors.New(cors.Config{',
          '\t\tAllowOrigins: []string{"http://localhost:3000"},',
          '\t\tAllowMethods: []string{"GET", "POST", "OPTIONS"},',
          '\t\tAllowHeaders: []string{"Content-Type"},',
          '\t}))',
          '',
          '\tr.GET("/", handler.Root)',
          '\tr.GET("/health", handler.Health)',
          '\tr.GET("/api/hello", handler.Hello)',
          '\tr.POST("/api/echo", handler.Echo)',
          '',
          '\tif err := r.Run(":8080"); err != nil {',
          '\t\tlog.Fatalf("Failed to start server: %v", err)',
          '\t}',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/root.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"net/http"',
          '\t"github.com/gin-gonic/gin"',
          ')',
          '',
          'func Root(c *gin.Context) {',
          '\tc.JSON(http.StatusOK, gin.H{',
          '\t\t"service": "gin-backend",',
          '\t\t"status":  "running",',
          '\t\t"message": "🍺 Brewnet says hello!",',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/health.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"net/http"',
          '\t"time"',
          '',
          '\t"brewnet-go-backend/internal/database"',
          '\t"github.com/gin-gonic/gin"',
          ')',
          '',
          'func Health(c *gin.Context) {',
          '\tc.JSON(http.StatusOK, gin.H{',
          '\t\t"status":       "ok",',
          '\t\t"timestamp":    time.Now().UTC().Format(time.RFC3339),',
          '\t\t"db_connected": database.CheckConnection(),',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/hello.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"net/http"',
          '\t"runtime"',
          '',
          '\t"github.com/gin-gonic/gin"',
          ')',
          '',
          'func Hello(c *gin.Context) {',
          '\tc.JSON(http.StatusOK, gin.H{',
          '\t\t"message": "Hello from Gin!",',
          '\t\t"lang":    "go",',
          '\t\t"version": runtime.Version(),',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/echo.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"io"',
          '\t"net/http"',
          '',
          '\t"github.com/gin-gonic/gin"',
          ')',
          '',
          'func Echo(c *gin.Context) {',
          '\tbody, err := io.ReadAll(c.Request.Body)',
          '\tif err != nil || len(body) == 0 {',
          '\t\tc.JSON(http.StatusOK, gin.H{})',
          '\t\treturn',
          '\t}',
          '\tc.Data(http.StatusOK, "application/json", body)',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/database/database.go',
        template: goDatabase,
      },
      {
        path: 'Dockerfile',
        template: goDockerfile('1.22', '3.19'),
      },
      {
        path: '.dockerignore',
        template: ['*.exe', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}

function echoTemplate(): ScaffoldTemplate {
  return {
    appDir: 'echo-app',
    files: [
      {
        path: 'go.mod',
        template: [
          'module brewnet-go-backend',
          '',
          'go 1.22',
          '',
          'require (',
          '\tgithub.com/labstack/echo/v4 v4.13.3',
          '\tgorm.io/driver/mysql v1.5.7',
          '\tgorm.io/driver/postgres v1.5.9',
          '\tgorm.io/driver/sqlite v1.5.6',
          '\tgorm.io/gorm v1.25.12',
          ')',
          '',
        ].join('\n'),
      },
      {
        path: 'cmd/server/main.go',
        template: [
          'package main',
          '',
          'import (',
          '\t"log"',
          '',
          '\t"brewnet-go-backend/internal/database"',
          '\t"brewnet-go-backend/internal/handler"',
          '\t"github.com/labstack/echo/v4"',
          '\t"github.com/labstack/echo/v4/middleware"',
          ')',
          '',
          'func main() {',
          '\tif err := database.Connect(); err != nil {',
          '\t\tlog.Printf("Warning: DB connection failed: %v", err)',
          '\t}',
          '',
          '\te := echo.New()',
          '\te.HideBanner = true',
          '\te.Use(middleware.CORSWithConfig(middleware.CORSConfig{',
          '\t\tAllowOrigins: []string{"http://localhost:3000"},',
          '\t\tAllowMethods: []string{"GET", "POST", "OPTIONS"},',
          '\t\tAllowHeaders: []string{"Content-Type"},',
          '\t}))',
          '',
          '\te.GET("/", handler.Root)',
          '\te.GET("/health", handler.Health)',
          '\te.GET("/api/hello", handler.Hello)',
          '\te.POST("/api/echo", handler.Echo)',
          '',
          '\tif err := e.Start(":8080"); err != nil {',
          '\t\tlog.Fatalf("Failed to start server: %v", err)',
          '\t}',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/root.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"net/http"',
          '\t"github.com/labstack/echo/v4"',
          ')',
          '',
          'func Root(c echo.Context) error {',
          '\treturn c.JSON(http.StatusOK, map[string]interface{}{',
          '\t\t"service": "echo-backend",',
          '\t\t"status":  "running",',
          '\t\t"message": "🍺 Brewnet says hello!",',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/health.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"net/http"',
          '\t"time"',
          '',
          '\t"brewnet-go-backend/internal/database"',
          '\t"github.com/labstack/echo/v4"',
          ')',
          '',
          'func Health(c echo.Context) error {',
          '\treturn c.JSON(http.StatusOK, map[string]interface{}{',
          '\t\t"status":       "ok",',
          '\t\t"timestamp":    time.Now().UTC().Format(time.RFC3339),',
          '\t\t"db_connected": database.CheckConnection(),',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/hello.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"net/http"',
          '\t"runtime"',
          '',
          '\t"github.com/labstack/echo/v4"',
          ')',
          '',
          'func Hello(c echo.Context) error {',
          '\treturn c.JSON(http.StatusOK, map[string]interface{}{',
          '\t\t"message": "Hello from Echo!",',
          '\t\t"lang":    "go",',
          '\t\t"version": runtime.Version(),',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/echo.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"io"',
          '\t"net/http"',
          '',
          '\t"github.com/labstack/echo/v4"',
          ')',
          '',
          'func Echo(c echo.Context) error {',
          '\tbody, err := io.ReadAll(c.Request.Body)',
          '\tif err != nil || len(body) == 0 {',
          '\t\treturn c.JSON(http.StatusOK, map[string]interface{}{})',
          '\t}',
          '\treturn c.Blob(http.StatusOK, "application/json", body)',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/database/database.go',
        template: goDatabase,
      },
      {
        path: 'Dockerfile',
        template: goDockerfile('1.22', '3.19'),
      },
      {
        path: '.dockerignore',
        template: ['*.exe', '.git', 'Dockerfile', '.dockerignore', ''].join('\n'),
      },
    ],
  };
}

function fiberTemplate(): ScaffoldTemplate {
  return {
    appDir: 'fiber-app',
    files: [
      {
        path: 'go.mod',
        template: [
          'module brewnet-go-backend',
          '',
          'go 1.25',
          '',
          'require (',
          '\tgithub.com/gofiber/fiber/v3 v3.0.0',
          '\tgorm.io/driver/mysql v1.5.7',
          '\tgorm.io/driver/postgres v1.5.9',
          '\tgorm.io/driver/sqlite v1.5.6',
          '\tgorm.io/gorm v1.25.12',
          ')',
          '',
        ].join('\n'),
      },
      {
        path: 'cmd/server/main.go',
        template: [
          'package main',
          '',
          'import (',
          '\t"log"',
          '',
          '\t"brewnet-go-backend/internal/database"',
          '\t"brewnet-go-backend/internal/handler"',
          '\t"github.com/gofiber/fiber/v3"',
          '\t"github.com/gofiber/fiber/v3/middleware/cors"',
          ')',
          '',
          'func main() {',
          '\tif err := database.Connect(); err != nil {',
          '\t\tlog.Printf("Warning: DB connection failed: %v", err)',
          '\t}',
          '',
          '\tapp := fiber.New()',
          '\tapp.Use(cors.New(cors.Config{',
          '\t\tAllowOrigins: []string{"http://localhost:3000"},',
          '\t\tAllowMethods: []string{"GET", "POST", "OPTIONS"},',
          '\t\tAllowHeaders: []string{"Content-Type"},',
          '\t}))',
          '',
          '\tapp.Get("/", handler.Root)',
          '\tapp.Get("/health", handler.Health)',
          '\tapp.Get("/api/hello", handler.Hello)',
          '\tapp.Post("/api/echo", handler.Echo)',
          '',
          '\tif err := app.Listen(":8080"); err != nil {',
          '\t\tlog.Fatalf("Failed to start server: %v", err)',
          '\t}',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/root.go',
        template: [
          'package handler',
          '',
          'import "github.com/gofiber/fiber/v3"',
          '',
          'func Root(c fiber.Ctx) error {',
          '\treturn c.JSON(fiber.Map{',
          '\t\t"service": "fiber-backend",',
          '\t\t"status":  "running",',
          '\t\t"message": "🍺 Brewnet says hello!",',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/health.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"time"',
          '',
          '\t"brewnet-go-backend/internal/database"',
          '\t"github.com/gofiber/fiber/v3"',
          ')',
          '',
          'func Health(c fiber.Ctx) error {',
          '\treturn c.JSON(fiber.Map{',
          '\t\t"status":       "ok",',
          '\t\t"timestamp":    time.Now().UTC().Format(time.RFC3339),',
          '\t\t"db_connected": database.CheckConnection(),',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/hello.go',
        template: [
          'package handler',
          '',
          'import (',
          '\t"runtime"',
          '\t"github.com/gofiber/fiber/v3"',
          ')',
          '',
          'func Hello(c fiber.Ctx) error {',
          '\treturn c.JSON(fiber.Map{',
          '\t\t"message": "Hello from Fiber!",',
          '\t\t"lang":    "go",',
          '\t\t"version": runtime.Version(),',
          '\t})',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/handler/echo.go',
        template: [
          'package handler',
          '',
          'import "github.com/gofiber/fiber/v3"',
          '',
          'func Echo(c fiber.Ctx) error {',
          '\tbody := c.Body()',
          '\tif len(body) == 0 {',
          '\t\treturn c.JSON(fiber.Map{})',
          '\t}',
          '\tc.Set("Content-Type", "application/json")',
          '\treturn c.Send(body)',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'internal/database/database.go',
        template: goDatabase,
      },
      {
        path: 'Dockerfile',
        template: goDockerfile('1.25', '3.21'),
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

function actixWebTemplate(): ScaffoldTemplate {
  return {
    appDir: 'actix-web-app',
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
          'actix-cors = "0.7"',
          'serde = { version = "1", features = ["derive"] }',
          'serde_json = "1"',
          'sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "any", "postgres", "mysql", "sqlite"] }',
          'tokio = { version = "1", features = ["macros", "rt-multi-thread"] }',
          'chrono = { version = "0.4", features = ["serde"] }',
          '',
        ].join('\n'),
      },
      {
        path: 'src/main.rs',
        template: [
          'mod database;',
          'mod handler;',
          '',
          'use actix_cors::Cors;',
          'use actix_web::{web, App, HttpServer};',
          '',
          '#[tokio::main]',
          'async fn main() -> std::io::Result<()> {',
          '    let pool = match database::connect().await {',
          '        Ok(p) => p,',
          '        Err(e) => {',
          '            eprintln!("Warning: DB connection failed: {}", e);',
          '            return start_server_without_db().await;',
          '        }',
          '    };',
          '',
          '    println!("Actix-web backend listening on port 8080");',
          '',
          '    HttpServer::new(move || {',
          '        let cors = Cors::default()',
          '            .allowed_origin("http://localhost:3000")',
          '            .allowed_methods(vec!["GET", "POST", "OPTIONS"])',
          '            .allowed_header(actix_web::http::header::CONTENT_TYPE);',
          '',
          '        App::new()',
          '            .wrap(cors)',
          '            .app_data(web::Data::new(pool.clone()))',
          '            .route("/", web::get().to(handler::root))',
          '            .route("/health", web::get().to(handler::health))',
          '            .route("/api/hello", web::get().to(handler::hello))',
          '            .route("/api/echo", web::post().to(handler::echo))',
          '    })',
          '    .bind("0.0.0.0:8080")?',
          '    .run()',
          '    .await',
          '}',
          '',
          'async fn start_server_without_db() -> std::io::Result<()> {',
          '    HttpServer::new(|| {',
          '        let cors = Cors::default()',
          '            .allowed_origin("http://localhost:3000")',
          '            .allowed_methods(vec!["GET", "POST", "OPTIONS"])',
          '            .allowed_header(actix_web::http::header::CONTENT_TYPE);',
          '',
          '        App::new()',
          '            .wrap(cors)',
          '            .route("/", web::get().to(handler::root))',
          '            .route("/health", web::get().to(handler::health_no_db))',
          '            .route("/api/hello", web::get().to(handler::hello))',
          '            .route("/api/echo", web::post().to(handler::echo))',
          '    })',
          '    .bind("0.0.0.0:8080")?',
          '    .run()',
          '    .await',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/handler.rs',
        template: [
          'use actix_web::{web, HttpRequest, HttpResponse};',
          'use chrono::Utc;',
          'use serde_json::{json, Value};',
          'use sqlx::AnyPool;',
          '',
          'use crate::database::check_connection;',
          '',
          'pub async fn root() -> HttpResponse {',
          '    HttpResponse::Ok().json(json!({',
          '        "service": "actix-web-backend",',
          '        "status": "running",',
          '        "message": "🍺 Brewnet says hello!"',
          '    }))',
          '}',
          '',
          'pub async fn health(pool: web::Data<AnyPool>) -> HttpResponse {',
          '    let db_connected = check_connection(pool.get_ref()).await;',
          '    HttpResponse::Ok().json(json!({',
          '        "status": "ok",',
          '        "timestamp": Utc::now().to_rfc3339(),',
          '        "db_connected": db_connected',
          '    }))',
          '}',
          '',
          'pub async fn health_no_db() -> HttpResponse {',
          '    HttpResponse::Ok().json(json!({',
          '        "status": "ok",',
          '        "timestamp": Utc::now().to_rfc3339(),',
          '        "db_connected": false',
          '    }))',
          '}',
          '',
          'pub async fn hello() -> HttpResponse {',
          '    HttpResponse::Ok().json(json!({',
          '        "message": "Hello from Actix-web!",',
          '        "lang": "rust",',
          '        "version": env!("CARGO_PKG_VERSION")',
          '    }))',
          '}',
          '',
          'pub async fn echo(_req: HttpRequest, body: web::Bytes) -> HttpResponse {',
          '    if body.is_empty() {',
          '        return HttpResponse::Ok().json(json!({}));',
          '    }',
          '    match serde_json::from_slice::<Value>(&body) {',
          '        Ok(val) => HttpResponse::Ok().json(val),',
          '        Err(_) => HttpResponse::Ok().content_type("application/json").body(body),',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/database.rs',
        template: [
          'use sqlx::{AnyPool, any::install_default_drivers, pool::PoolOptions};',
          'use std::env;',
          '',
          'pub async fn connect() -> Result<AnyPool, sqlx::Error> {',
          '    install_default_drivers();',
          '    let driver = env::var("DB_DRIVER").unwrap_or_else(|_| "postgres".to_string());',
          '    let url = match driver.as_str() {',
          '        "postgres" => format!(',
          '            "postgres://{}:{}@{}:{}/{}",',
          '            env::var("DB_USER").unwrap_or_default(),',
          '            env::var("DB_PASSWORD").unwrap_or_default(),',
          '            env::var("DB_HOST").unwrap_or("postgres".into()),',
          '            env::var("DB_PORT").unwrap_or("5432".into()),',
          '            env::var("DB_NAME").unwrap_or("brewnet_db".into()),',
          '        ),',
          '        "mysql" => format!(',
          '            "mysql://{}:{}@{}:{}/{}",',
          '            env::var("MYSQL_USER").unwrap_or_default(),',
          '            env::var("MYSQL_PASSWORD").unwrap_or_default(),',
          '            env::var("MYSQL_HOST").unwrap_or("mysql".into()),',
          '            env::var("MYSQL_PORT").unwrap_or("3306".into()),',
          '            env::var("MYSQL_DATABASE").unwrap_or("brewnet_db".into()),',
          '        ),',
          '        "sqlite3" => format!(',
          '            "sqlite://{}",',
          '            env::var("SQLITE_PATH").unwrap_or("./data/brewnet_db.db".into()),',
          '        ),',
          '        _ => panic!("Unsupported DB_DRIVER: {}", driver),',
          '    };',
          '    PoolOptions::new().max_connections(5).connect(&url).await',
          '}',
          '',
          'pub async fn check_connection(pool: &AnyPool) -> bool {',
          '    sqlx::query("SELECT 1").execute(pool).await.is_ok()',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM rust:1.88 AS builder',
          'WORKDIR /app',
          'COPY Cargo.toml Cargo.lock* ./',
          'RUN mkdir src && echo "fn main(){}" > src/main.rs && cargo build --release && rm -rf src',
          'COPY . .',
          'RUN touch src/main.rs && cargo build --release',
          '',
          'FROM debian:bookworm-slim',
          'RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget && \\',
          '    rm -rf /var/lib/apt/lists/* && useradd -m appuser',
          'WORKDIR /app',
          'COPY --from=builder /app/target/release/${PROJECT_NAME} .',
          'RUN mkdir -p /app/data && chown -R appuser:appuser /app',
          'USER appuser',
          'EXPOSE 8080',
          'HEALTHCHECK --interval=10s --timeout=5s --retries=3 \\',
          '    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1',
          'ENTRYPOINT ["./${PROJECT_NAME}"]',
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

function axumTemplate(): ScaffoldTemplate {
  return {
    appDir: 'axum-app',
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
          'axum = "0.8"',
          'tower-http = { version = "0.6", features = ["cors"] }',
          'serde = { version = "1", features = ["derive"] }',
          'serde_json = "1"',
          'sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "any", "postgres", "mysql", "sqlite"] }',
          'tokio = { version = "1", features = ["macros", "rt-multi-thread"] }',
          'chrono = { version = "0.4", features = ["serde"] }',
          '',
          '[dev-dependencies]',
          'tower = { version = "0.5", features = ["util"] }',
          'http-body-util = "0.1"',
          '',
        ].join('\n'),
      },
      {
        path: 'src/main.rs',
        template: [
          'mod database;',
          'mod handler;',
          '',
          'use axum::{routing::{get, post}, Router};',
          'use sqlx::AnyPool;',
          'use tower_http::cors::{CorsLayer, AllowOrigin};',
          '',
          '#[tokio::main]',
          'async fn main() {',
          '    let pool: Option<AnyPool> = match database::connect().await {',
          '        Ok(p) => Some(p),',
          '        Err(e) => {',
          '            eprintln!("Warning: DB connection failed: {}", e);',
          '            None',
          '        }',
          '    };',
          '',
          '    let cors = CorsLayer::new()',
          '        .allow_origin(AllowOrigin::exact(',
          '            "http://localhost:3000".parse().unwrap(),',
          '        ))',
          '        .allow_methods([',
          '            axum::http::Method::GET,',
          '            axum::http::Method::POST,',
          '            axum::http::Method::OPTIONS,',
          '        ])',
          '        .allow_headers([axum::http::header::CONTENT_TYPE]);',
          '',
          '    let app = Router::new()',
          '        .route("/", get(handler::root))',
          '        .route("/health", get(handler::health))',
          '        .route("/api/hello", get(handler::hello))',
          '        .route("/api/echo", post(handler::echo))',
          '        .layer(cors)',
          '        .with_state(pool);',
          '',
          '    println!("Axum backend listening on port 8080");',
          '',
          '    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080")',
          '        .await',
          '        .expect("Failed to bind to port 8080");',
          '',
          '    axum::serve(listener, app)',
          '        .await',
          '        .expect("Server error");',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/handler.rs',
        template: [
          'use axum::{extract::State, http::StatusCode, response::Json};',
          'use chrono::Utc;',
          'use serde_json::{json, Value};',
          'use sqlx::AnyPool;',
          '',
          'use crate::database::check_connection;',
          '',
          'pub async fn root() -> Json<Value> {',
          '    Json(json!({',
          '        "service": "axum-backend",',
          '        "status": "running",',
          '        "message": "🍺 Brewnet says hello!"',
          '    }))',
          '}',
          '',
          'pub async fn health(State(pool): State<Option<AnyPool>>) -> Json<Value> {',
          '    let db_connected = match &pool {',
          '        Some(p) => check_connection(p).await,',
          '        None => false,',
          '    };',
          '    Json(json!({',
          '        "status": "ok",',
          '        "timestamp": Utc::now().to_rfc3339(),',
          '        "db_connected": db_connected',
          '    }))',
          '}',
          '',
          'pub async fn hello() -> Json<Value> {',
          '    Json(json!({',
          '        "message": "Hello from Axum!",',
          '        "lang": "rust",',
          '        "version": env!("CARGO_PKG_VERSION")',
          '    }))',
          '}',
          '',
          'pub async fn echo(body: axum::body::Bytes) -> (StatusCode, Json<Value>) {',
          '    if body.is_empty() {',
          '        return (StatusCode::OK, Json(json!({})));',
          '    }',
          '    match serde_json::from_slice::<Value>(&body) {',
          '        Ok(val) => (StatusCode::OK, Json(val)),',
          '        Err(_) => (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid JSON"}))),',
          '    }',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'src/database.rs',
        template: [
          'use sqlx::{AnyPool, any::install_default_drivers, pool::PoolOptions};',
          'use std::env;',
          '',
          'pub async fn connect() -> Result<AnyPool, sqlx::Error> {',
          '    install_default_drivers();',
          '    let driver = env::var("DB_DRIVER").unwrap_or_else(|_| "postgres".to_string());',
          '    let url = match driver.as_str() {',
          '        "postgres" => format!(',
          '            "postgres://{}:{}@{}:{}/{}",',
          '            env::var("DB_USER").unwrap_or_default(),',
          '            env::var("DB_PASSWORD").unwrap_or_default(),',
          '            env::var("DB_HOST").unwrap_or("postgres".into()),',
          '            env::var("DB_PORT").unwrap_or("5432".into()),',
          '            env::var("DB_NAME").unwrap_or("brewnet_db".into()),',
          '        ),',
          '        "mysql" => format!(',
          '            "mysql://{}:{}@{}:{}/{}",',
          '            env::var("MYSQL_USER").unwrap_or_default(),',
          '            env::var("MYSQL_PASSWORD").unwrap_or_default(),',
          '            env::var("MYSQL_HOST").unwrap_or("mysql".into()),',
          '            env::var("MYSQL_PORT").unwrap_or("3306".into()),',
          '            env::var("MYSQL_DATABASE").unwrap_or("brewnet_db".into()),',
          '        ),',
          '        "sqlite3" => format!(',
          '            "sqlite://{}",',
          '            env::var("SQLITE_PATH").unwrap_or("./data/brewnet_db.db".into()),',
          '        ),',
          '        _ => panic!("Unsupported DB_DRIVER: {}", driver),',
          '    };',
          '    PoolOptions::new().max_connections(5).connect(&url).await',
          '}',
          '',
          'pub async fn check_connection(pool: &AnyPool) -> bool {',
          '    sqlx::query("SELECT 1").execute(pool).await.is_ok()',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'Dockerfile',
        template: [
          'FROM rust:1.88 AS builder',
          'WORKDIR /app',
          'COPY Cargo.toml Cargo.lock* ./',
          'RUN mkdir src && echo "fn main(){}" > src/main.rs && cargo build --release && rm -rf src',
          'COPY . .',
          'RUN touch src/main.rs && cargo build --release',
          '',
          'FROM debian:bookworm-slim',
          'RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget && \\',
          '    rm -rf /var/lib/apt/lists/* && useradd -m appuser',
          'WORKDIR /app',
          'COPY --from=builder /app/target/release/${PROJECT_NAME} .',
          'RUN mkdir -p /app/data && chown -R appuser:appuser /app',
          'USER appuser',
          'EXPOSE 8080',
          'HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \\',
          '    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1',
          'ENTRYPOINT ["./${PROJECT_NAME}"]',
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
        case 'nextjs-app':
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
        case 'nextjs-app':
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
      return { srcMount: '.', containerMount: '/app', command: 'go run ./cmd/server' };

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
 * Supported language/framework combinations:
 *   nodejs:  nextjs | nextjs-app | express | nestjs  (default: express)
 *   python:  fastapi | django | flask                (default: fastapi)
 *   java:    java-pure | spring | springboot         (default: java-pure)
 *   go:      gin | echo | fiber                      (default: gin)
 *   rust:    actix-web | axum                        (default: actix-web)
 *   kotlin:  ktor | springboot                       (default: ktor)
 *
 * @param language  - Programming language (e.g., "nodejs", "go", "rust")
 * @param framework - Framework identifier (e.g., "gin", "axum"), or empty string for default
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
          return nextjsFullTemplate();
        case 'nextjs-app':
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
      switch (framework) {
        case 'echo':
          return echoTemplate();
        case 'fiber':
          return fiberTemplate();
        case 'gin':
        default:
          return ginTemplate();
      }

    case 'rust':
      switch (framework) {
        case 'axum':
          return axumTemplate();
        case 'actix-web':
        default:
          return actixWebTemplate();
      }

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
