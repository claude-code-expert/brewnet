/**
 * brewnet create-app — Stack Catalog
 *
 * Authoritative list of all 16 boilerplate stacks available via
 * `brewnet create-app`. Each entry maps to an orphan branch
 * `stack/<id>` in the brewnet-boilerplate GitHub repository.
 *
 * Source of truth: docs/CONNECT_BOILERPLATE.md
 *
 * @module config/stacks
 */

import type { StackEntry, DbDriver } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------

export type { StackEntry, DbDriver };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid database driver values accepted by the --database flag. */
export const VALID_DB_DRIVERS = ['sqlite3', 'postgres', 'mysql'] as const;

// ---------------------------------------------------------------------------
// Stack Catalog — 16 entries
// ---------------------------------------------------------------------------

export const STACK_CATALOG: StackEntry[] = [
  // ── Go ──────────────────────────────────────────────────────────────────
  {
    id: 'go-gin',
    language: 'Go',
    framework: 'Gin',
    version: '1.22',
    orm: 'GORM',
    isUnified: false,
    buildSlow: false,
  },
  {
    id: 'go-echo',
    language: 'Go',
    framework: 'Echo v4',
    version: '1.24',
    orm: 'GORM',
    isUnified: false,
    buildSlow: false,
  },
  {
    id: 'go-fiber',
    language: 'Go',
    framework: 'Fiber v3',
    version: '1.25',
    orm: 'GORM',
    isUnified: false,
    buildSlow: false,
  },
  // ── Rust ────────────────────────────────────────────────────────────────
  {
    id: 'rust-actix-web',
    language: 'Rust',
    framework: 'Actix-web 4',
    version: '1.88',
    orm: 'SQLx',
    isUnified: false,
    buildSlow: true,
  },
  {
    id: 'rust-axum',
    language: 'Rust',
    framework: 'Axum 0.8',
    version: '1.88',
    orm: 'SQLx',
    isUnified: false,
    buildSlow: true,
  },
  // ── Java ────────────────────────────────────────────────────────────────
  {
    id: 'java-springboot',
    language: 'Java',
    framework: 'Spring Boot 3.3',
    version: '21',
    orm: 'JPA / JDBC',
    isUnified: false,
    buildSlow: false,
  },
  {
    id: 'java-spring',
    language: 'Java',
    framework: 'Spring Framework 6.2',
    version: '21',
    orm: 'JDBC / HikariCP',
    isUnified: false,
    buildSlow: false,
  },
  // ── Kotlin ──────────────────────────────────────────────────────────────
  {
    id: 'kotlin-ktor',
    language: 'Kotlin',
    framework: 'Ktor 3.1',
    version: '2.1',
    orm: 'Exposed ORM',
    isUnified: false,
    buildSlow: false,
  },
  {
    id: 'kotlin-springboot',
    language: 'Kotlin',
    framework: 'Spring Boot 3.4',
    version: '2.1',
    orm: 'JDBC / HikariCP',
    isUnified: false,
    buildSlow: false,
  },
  // ── Node.js ─────────────────────────────────────────────────────────────
  {
    id: 'nodejs-express',
    language: 'Node.js',
    framework: 'Express 5',
    version: '22',
    orm: 'Prisma 6',
    isUnified: false,
    buildSlow: false,
  },
  {
    id: 'nodejs-nestjs',
    language: 'Node.js',
    framework: 'NestJS 11',
    version: '22',
    orm: 'Prisma 6',
    isUnified: false,
    buildSlow: false,
  },
  {
    id: 'nodejs-nextjs',
    language: 'Node.js',
    framework: 'Next.js 15 (API Routes)',
    version: '22',
    orm: 'Prisma 6',
    isUnified: true,
    buildSlow: false,
  },
  {
    id: 'nodejs-nextjs-full',
    language: 'Node.js',
    framework: 'Next.js 15 (Full-Stack)',
    version: '22',
    orm: 'Prisma 6',
    isUnified: true,
    buildSlow: false,
  },
  // ── Python ──────────────────────────────────────────────────────────────
  {
    id: 'python-fastapi',
    language: 'Python',
    framework: 'FastAPI',
    version: '3.12',
    orm: 'SQLAlchemy 2.0',
    isUnified: false,
    buildSlow: false,
  },
  {
    id: 'python-django',
    language: 'Python',
    framework: 'Django 6',
    version: '3.13',
    orm: 'Django ORM',
    isUnified: false,
    buildSlow: false,
  },
  {
    id: 'python-flask',
    language: 'Python',
    framework: 'Flask 3.1',
    version: '3.13',
    orm: 'Flask-SQLAlchemy',
    isUnified: false,
    buildSlow: false,
  },
];

/** Set of all valid stack IDs (derived from catalog for fast lookup). */
export const VALID_STACK_IDS: ReadonlySet<string> = new Set(
  STACK_CATALOG.map((s) => s.id),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a stack entry by its ID.
 * Returns `undefined` if the ID is not in the catalog.
 */
export function getStackById(id: string): StackEntry | undefined {
  return STACK_CATALOG.find((s) => s.id === id);
}

/**
 * Group stacks by language for the two-step interactive selection prompt.
 *
 * @example
 * { 'Go': [go-gin, go-echo, go-fiber], 'Rust': [...], ... }
 */
export function getStacksByLanguage(): Record<string, StackEntry[]> {
  const result: Record<string, StackEntry[]> = {};
  for (const stack of STACK_CATALOG) {
    if (!result[stack.language]) {
      result[stack.language] = [];
    }
    result[stack.language]!.push(stack);
  }
  return result;
}
