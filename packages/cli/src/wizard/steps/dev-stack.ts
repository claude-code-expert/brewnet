/**
 * T078-T080 — Step 3: Dev Stack & Runtime
 *
 * Pure functions and interactive wizard step for configuring the development
 * stack: backend languages, per-language frameworks, frontend technologies,
 * FileBrowser mode, and boilerplate generation settings.
 *
 * Pure functions:
 *   - buildDevStackState    — Build a DevStackConfig, stripping stale frameworks
 *   - applySkipDevStack     — Clear devStack and disable appServer / fileBrowser
 *   - getFilteredFrameworks — Return framework options for selected languages only
 *   - isDevStackEmpty       — Check whether devStack has any selections
 *
 * Interactive:
 *   - runDevStackStep       — Step 3 wizard UI
 *
 * @module wizard/steps/dev-stack
 */

import { select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type {
  WizardState,
  DevStackConfig,
  Language,
  FrontendTech,
  FileBrowserMode,
  DevMode,
} from '@brewnet/shared';
import {
  LANGUAGE_REGISTRY,
  FRONTEND_REGISTRY,
  getFrameworksForLanguage,
  type FrameworkOption,
} from '../../config/frameworks.js';
import { applyDevStackAutoEnables } from './server-components.js';
import { BOILERPLATE_REPO_URL } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Build a DevStackConfig from raw selections, stripping any framework entries
 * for languages that are no longer in the `languages` array.
 *
 * Returns a new object with no shared references to the input.
 *
 * @param selections - Raw user selections
 * @returns A clean DevStackConfig
 */
export function buildDevStackState(selections: {
  languages: Language[];
  frameworks: Record<string, string>;
  frontend: FrontendTech | null;
}): DevStackConfig {
  const languages = [...selections.languages];
  const frontend = selections.frontend;

  // Only keep framework entries whose key is in the selected languages
  const frameworks: Record<string, string> = {};
  for (const lang of languages) {
    if (lang in selections.frameworks) {
      frameworks[lang] = selections.frameworks[lang];
    }
  }

  return { languages, frameworks, frontend };
}

/**
 * Apply the "Skip Dev Stack" action to a wizard state.
 * Clears all devStack selections and disables appServer and fileBrowser.
 *
 * Does NOT mutate the input state.
 *
 * @param state - Current wizard state
 * @returns New WizardState with devStack cleared and related servers disabled
 */
export function applySkipDevStack(state: WizardState): WizardState {
  const next = structuredClone(state);

  next.devStack.languages = [];
  next.devStack.frameworks = {};
  next.devStack.frontend = null;

  next.servers.appServer.enabled = false;
  next.servers.fileBrowser.enabled = false;

  return next;
}

/**
 * Return a record mapping each selected language to its available frameworks
 * from LANGUAGE_REGISTRY. Languages not in selectedLanguages are excluded.
 *
 * @param selectedLanguages - Languages the user has selected
 * @returns Record of language key to FrameworkOption[]
 */
export function getFilteredFrameworks(
  selectedLanguages: Language[],
): Record<string, FrameworkOption[]> {
  const result: Record<string, FrameworkOption[]> = {};

  for (const lang of selectedLanguages) {
    result[lang] = getFrameworksForLanguage(lang);
  }

  return result;
}

/**
 * Check whether the devStack has any meaningful selections.
 * Returns true when no languages AND no frontend technology is selected.
 * Ignores stale framework entries — only languages and frontend matter.
 *
 * @param state - Current wizard state
 * @returns true if devStack is empty
 */
export function isDevStackEmpty(state: WizardState): boolean {
  return state.devStack.languages.length === 0 && state.devStack.frontend === null;
}

// ---------------------------------------------------------------------------
// Interactive Step Function (T078-T080)
// ---------------------------------------------------------------------------

/**
 * Run Step 3: Dev Stack & Runtime.
 *
 * Interactively collects language, framework, frontend, FileBrowser, and
 * boilerplate preferences. Applies devStack auto-enables at the end.
 *
 * Flow:
 *   1. Display header "Step 4/8 — Dev Stack & Runtime"
 *   2. Skip prompt (if yes, call applySkipDevStack and return early)
 *   3. Language single-select (all 8 from LANGUAGE_REGISTRY + Skip option)
 *   4. Per-language framework selection (─── Framework Selection ─── separator)
 *   5. Frontend tech single-select (from FRONTEND_REGISTRY)
 *   6. Apply devStack auto-enables (appServer / fileBrowser)
 *   7. FileBrowser mode selection (if appServer auto-enabled)
 *   8. Boilerplate config (generate, sampleData, devMode)
 *   9. Show summary
 *  10. Return updated state
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with devStack selections
 */
export async function runDevStackStep(
  state: WizardState,
): Promise<WizardState> {
  let next = structuredClone(state);

  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 4/8') + chalk.bold(' — Developer Configuration & Runtime Setup'),
  );
  console.log(
    chalk.dim(
      '  Select backend languages, frameworks, and frontend technologies.',
    ),
  );
  console.log(
    chalk.dim(
      '  Skip any section by pressing Enter without selecting, or choose Skip at the end.',
    ),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 3. Language single-select
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Backend Language'));
  console.log(chalk.dim('  ↑↓: 이동   Enter: 확정   (추후 추가설정 가능합니다)'));
  console.log();

  const languageChoices: Array<{ name: string; value: Language | 'skip' }> = [
    ...(Object.keys(LANGUAGE_REGISTRY) as Language[]).map((key) => ({
      name: LANGUAGE_REGISTRY[key].name,
      value: key as Language | 'skip',
    })),
    { name: 'Skip — 언어 선택 건너뛰기', value: 'skip' as const },
  ];

  const selectedLang = await select<Language | 'skip'>({
    message: 'Backend Language',
    choices: languageChoices,
    default: next.devStack.languages[0] ?? 'skip',
  });

  const selectedLanguages: Language[] =
    selectedLang === 'skip' ? [] : [selectedLang];

  if (selectedLanguages.length === 0) {
    console.log(chalk.dim('  (선택 없음 — 프레임워크 선택을 건너뜁니다)'));
  }
  console.log();

  // -------------------------------------------------------------------------
  // 4. Per-language framework selection (T019-T022 bug fix)
  // -------------------------------------------------------------------------
  const filteredFrameworks = getFilteredFrameworks(selectedLanguages);
  const frameworkSelections: Record<string, string> = {};

  if (selectedLanguages.length > 0) {
    console.log(chalk.bold('  ─── Framework Selection ───'));
    console.log(chalk.dim('  Choose a framework for each selected language'));
    console.log();
  }

  for (const lang of selectedLanguages) {
    const frameworks = filteredFrameworks[lang];

    // T019 guard: skip select() if frameworks array is empty
    if (frameworks.length === 0) {
      continue;
    }

    // T021: per-language version header
    const versionInfo: Record<Language, string> = {
      python: 'Python 3.13',
      nodejs: 'Node.js 22 LTS',
      java: 'Java 21 LTS',
      rust: 'Rust 1.85',
      go: 'Go 1.24',
      kotlin: 'Kotlin 2.3',
    };
    console.log(chalk.bold(`  ${versionInfo[lang] ?? LANGUAGE_REGISTRY[lang].name}`));

    const frameworkChoice = await select<string>({
      message: `${LANGUAGE_REGISTRY[lang].name} framework`,
      choices: frameworks.map((fw) => ({
        name: `${fw.name} — ${fw.description}`,
        value: fw.id,
      })),
      // T020 fix: defensive access to frameworks[0]?.id
      default: next.devStack.frameworks[lang] ?? frameworks[0]?.id ?? '',
    });
    frameworkSelections[lang] = frameworkChoice;
    console.log();
  }

  // -------------------------------------------------------------------------
  // 5. Frontend tech single-select (T023-T024)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Frontend Technology'));
  console.log(chalk.dim('  Select a frontend framework (optional)'));
  console.log();

  const frontendChoices = (Object.keys(FRONTEND_REGISTRY) as FrontendTech[]).map(
    (key) => ({
      name: `${FRONTEND_REGISTRY[key].name} — ${FRONTEND_REGISTRY[key].description}`,
      value: key,
    }),
  );

  const selectedFrontendRaw = await select<FrontendTech>({
    message: 'Frontend',
    choices: frontendChoices,
    default: next.devStack.frontend ?? 'none',
  });

  // T024: 'none' maps to null
  const selectedFrontend: FrontendTech | null =
    selectedFrontendRaw === 'none' ? null : selectedFrontendRaw;

  console.log();

  // -------------------------------------------------------------------------
  // Build devStack state (strips stale frameworks)
  // -------------------------------------------------------------------------
  next.devStack = buildDevStackState({
    languages: selectedLanguages,
    frameworks: frameworkSelections,
    frontend: selectedFrontend,
  });

  // -------------------------------------------------------------------------
  // 6. Apply devStack auto-enables (appServer / fileBrowser)
  // -------------------------------------------------------------------------
  next = applyDevStackAutoEnables(next);

  // -------------------------------------------------------------------------
  // 7. FileBrowser mode (if appServer auto-enabled)
  // -------------------------------------------------------------------------
  if (next.servers.appServer.enabled && next.servers.fileBrowser.enabled) {
    console.log(chalk.bold('  FileBrowser'));
    console.log(chalk.dim('  App Server detected — configure file browser mode'));
    console.log();

    const fileBrowserMode = await select<FileBrowserMode>({
      message: 'FileBrowser mode',
      choices: [
        {
          name: 'Directory — serve web server static files',
          value: 'directory' as FileBrowserMode,
        },
        {
          name: 'Standalone — dedicated FileBrowser container',
          value: 'standalone' as FileBrowserMode,
        },
      ],
      default: next.servers.fileBrowser.mode || 'directory',
    });
    next.servers.fileBrowser.mode = fileBrowserMode;
    console.log();
  }

  // -------------------------------------------------------------------------
  // 8. Boilerplate configuration
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Boilerplate'));
  console.log(chalk.dim('  Project scaffolding and template settings'));
  console.log(chalk.dim(`  Templates: ${BOILERPLATE_REPO_URL}`));
  console.log();

  const generateBoilerplate = await confirm({
    message: 'Generate boilerplate project files?',
    default: next.boilerplate.generate,
  });
  next.boilerplate.generate = generateBoilerplate;

  if (generateBoilerplate) {
    const sampleData = await confirm({
      message: 'Include sample data / seed files?',
      default: next.boilerplate.sampleData,
    });
    next.boilerplate.sampleData = sampleData;

    const devMode = await select<DevMode>({
      message: 'Development mode',
      choices: [
        {
          name: 'Hot-reload — auto-restart on file changes',
          value: 'hot-reload' as DevMode,
        },
        {
          name: 'Production — optimized build',
          value: 'production' as DevMode,
        },
      ],
      default: next.boilerplate.devMode || 'hot-reload',
    });
    next.boilerplate.devMode = devMode;
  } else {
    next.boilerplate.sampleData = false;
    next.boilerplate.devMode = 'hot-reload';
  }

  console.log();

  // -------------------------------------------------------------------------
  // 9. Summary (T028)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Dev Stack Summary'));

  if (next.devStack.languages.length > 0) {
    const langNames = next.devStack.languages
      .map((l) => LANGUAGE_REGISTRY[l].name)
      .join(', ');
    console.log(chalk.dim(`    Languages:  ${langNames}`));

    // Show selected frameworks
    for (const lang of next.devStack.languages) {
      if (next.devStack.frameworks[lang]) {
        const fw = getFrameworksForLanguage(lang as Language).find(
          (f) => f.id === next.devStack.frameworks[lang],
        );
        if (fw) {
          console.log(chalk.dim(`    ${LANGUAGE_REGISTRY[lang as Language].name} framework: ${fw.name}`));
        }
      }
    }
  } else {
    console.log(chalk.dim('    Languages:  (none)'));
  }

  // T028: show single frontend name or "(none)"
  if (next.devStack.frontend !== null) {
    console.log(chalk.dim(`    Frontend:   ${FRONTEND_REGISTRY[next.devStack.frontend].name}`));
  } else {
    console.log(chalk.dim('    Frontend:   (none)'));
  }

  console.log(chalk.dim(`    App Server: ${next.servers.appServer.enabled ? 'enabled' : 'disabled'}`));

  if (next.servers.fileBrowser.enabled) {
    console.log(chalk.dim(`    FileBrowser: ${next.servers.fileBrowser.mode || 'directory'}`));
  }

  if (next.boilerplate.generate) {
    console.log(chalk.dim(`    Boilerplate: yes (sample data: ${next.boilerplate.sampleData ? 'yes' : 'no'}, mode: ${next.boilerplate.devMode})`));
  } else {
    console.log(chalk.dim('    Boilerplate: no'));
  }

  // -------------------------------------------------------------------------
  // 10. Apply or Skip — final action prompt
  // -------------------------------------------------------------------------
  console.log();

  const action = await select<'apply' | 'skip'>({
    message: 'Developer Configuration',
    choices: [
      {
        name: 'Apply — save configuration and continue to next step',
        value: 'apply',
      },
      {
        name: 'Skip — continue without Dev Stack (no App Server will be deployed)',
        value: 'skip',
      },
    ],
    default: 'apply',
  });

  console.log();

  if (action === 'skip') {
    const skipped = applySkipDevStack(next);
    console.log(chalk.yellow('  Dev Stack skipped. App Server and FileBrowser disabled.'));
    console.log();
    return skipped;
  }

  console.log(chalk.green('  Dev Stack configured.'));
  console.log();

  return next;
}
