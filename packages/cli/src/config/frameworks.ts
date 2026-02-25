/**
 * @module frameworks
 * @description Language, framework, and frontend technology registries
 * used by the Brewnet wizard (Step 3: Dev Stack & Runtime).
 *
 * Task: T020 — Phase 2 Config Registries
 */

export type Language = 'python' | 'nodejs' | 'java' | 'php' | 'dotnet' | 'rust' | 'go';

export type FrontendTech = 'vuejs' | 'reactjs' | 'typescript' | 'javascript';

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
      { id: 'nextjs-api', name: 'Next.js (API only)', description: 'API routes only' },
      { id: 'express', name: 'Express', description: 'Minimal web framework' },
      { id: 'nestjs', name: 'NestJS', description: 'Progressive Node.js framework' },
      { id: 'fastify', name: 'Fastify', description: 'Fast and low overhead' },
    ],
  },
  java: {
    name: 'Java',
    frameworks: [
      { id: 'springboot', name: 'Spring Boot', description: 'Opinionated Spring, production-ready' },
      { id: 'spring', name: 'Spring Framework', description: 'Enterprise Java framework' },
      { id: 'java-pure', name: 'Pure Java', description: 'No framework' },
    ],
  },
  php: {
    name: 'PHP',
    frameworks: [
      { id: 'laravel', name: 'Laravel', description: 'PHP web framework' },
      { id: 'symfony', name: 'Symfony', description: 'Enterprise PHP framework' },
    ],
  },
  dotnet: {
    name: '.NET',
    frameworks: [
      { id: 'aspnet', name: 'ASP.NET Core', description: 'Web framework for .NET' },
      { id: 'blazor', name: 'Blazor', description: 'Interactive web UI with .NET' },
    ],
  },
  rust: {
    name: 'Rust',
    frameworks: [
      { id: 'axum', name: 'Axum', description: 'Async web framework by Tokio' },
      { id: 'actix-web', name: 'Actix Web', description: 'High-performance actor-based framework' },
      { id: 'rocket', name: 'Rocket', description: 'Ergonomic web framework' },
    ],
  },
  go: {
    name: 'Go',
    frameworks: [
      { id: 'gin', name: 'Gin', description: 'Fast HTTP web framework' },
      { id: 'echo', name: 'Echo', description: 'High performance, minimalist framework' },
      { id: 'fiber', name: 'Fiber', description: 'Express-inspired, built on Fasthttp' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Frontend technologies registry
// ---------------------------------------------------------------------------

export const FRONTEND_REGISTRY: Record<FrontendTech, { name: string; description: string }> = {
  vuejs: { name: 'Vue.js', description: 'Progressive JavaScript framework' },
  reactjs: { name: 'React', description: 'UI component library' },
  typescript: { name: 'TypeScript', description: 'Typed JavaScript' },
  javascript: { name: 'JavaScript', description: 'Plain JavaScript' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the list of available frameworks for a given language.
 * Returns an empty array for languages that have no framework options.
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
