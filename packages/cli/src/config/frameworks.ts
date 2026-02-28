/**
 * @module frameworks
 * @description Language, framework, and frontend technology registries
 * used by the Brewnet wizard (Step 3: Dev Stack & Runtime).
 *
 * Task: T020 — Phase 2 Config Registries
 */

export type Language = 'python' | 'nodejs' | 'java' | 'rust' | 'go' | 'kotlin';

export type FrontendTech = 'react' | 'vue' | 'svelte' | 'none';

export interface FrameworkOption {
  id: string;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Language → Frameworks registry
// ---------------------------------------------------------------------------

export const LANGUAGE_REGISTRY: Record<Language, { name: string; frameworks: FrameworkOption[] }> = {
  python: {
    name: 'Python',
    frameworks: [
      { id: 'fastapi', name: 'FastAPI', description: 'Modern async web framework' },
      { id: 'django', name: 'Django', description: 'Full-featured web framework' },
      { id: 'flask', name: 'Flask', description: 'Lightweight micro-framework' },
    ],
  },
  nodejs: {
    name: 'Node.js',
    frameworks: [
      { id: 'nextjs', name: 'Next.js', description: 'Full-stack React framework' },
      { id: 'nextjs-app', name: 'Next.js 15.x (App Router)', description: 'Next.js 15 App Router with Server Components' },
      { id: 'express', name: 'Express', description: 'Minimal web framework' },
      { id: 'nestjs', name: 'NestJS', description: 'Progressive Node.js framework' },
    ],
  },
  java: {
    name: 'Java',
    frameworks: [
      { id: 'spring', name: 'Spring Framework', description: 'Enterprise Java framework' },
      { id: 'springboot', name: 'Spring Boot', description: 'Opinionated Spring, production-ready (recommended)' },
    ],
  },
  rust: {
    name: 'Rust',
    frameworks: [
      { id: 'axum', name: 'Axum', description: 'Ergonomic and modular framework (MIT)' },
      { id: 'actix-web', name: 'Actix Web', description: 'High performance web framework (MIT)' },
    ],
  },
  go: {
    name: 'Go',
    frameworks: [
      { id: 'gin', name: 'Gin', description: 'HTTP web framework (MIT)' },
      { id: 'echo', name: 'Echo', description: 'High performance framework (MIT)' },
      { id: 'fiber', name: 'Fiber', description: 'Express-inspired framework (MIT)' },
    ],
  },
  kotlin: {
    name: 'Kotlin',
    frameworks: [
      { id: 'ktor', name: 'Ktor', description: 'Asynchronous Kotlin web framework (default)' },
      { id: 'springboot-kt', name: 'Spring Boot (Kotlin)', description: 'Spring Boot with Kotlin DSL' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Frontend technologies registry
// ---------------------------------------------------------------------------

export const FRONTEND_REGISTRY: Record<FrontendTech, { name: string; description: string }> = {
  react: { name: 'React (Vite)', description: 'React SPA with Vite build tool' },
  vue: { name: 'Vue.js (Vite)', description: 'Vue 3 SPA with Vite build tool' },
  svelte: { name: 'SvelteKit', description: 'Full-stack Svelte framework' },
  none: { name: 'Skip frontend', description: 'No frontend framework' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the list of available frameworks for a given language.
 */
export function getFrameworksForLanguage(language: Language): FrameworkOption[] {
  return LANGUAGE_REGISTRY[language].frameworks;
}

/**
 * Return all registered language keys.
 */
export function getAllLanguages(): Language[] {
  return Object.keys(LANGUAGE_REGISTRY) as Language[];
}

/**
 * Return all registered frontend technology keys.
 */
export function getAllFrontendTechs(): FrontendTech[] {
  return Object.keys(FRONTEND_REGISTRY) as FrontendTech[];
}
