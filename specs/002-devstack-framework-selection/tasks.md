# Tasks — Dev Stack Step 3: Framework Sub-Selection Fix

**Feature**: Step 3 언어 선택 후 프레임워크 서브 프롬프트 미표시 버그 수정 + 스펙 정합성 업데이트
**Branch**: `002-devstack-framework-selection`
**Spec Reference**: `docs/STEP3_LANGUAGE_FRAMEWORK_SPEC.md`

---

## Problem Statement

`brewnet init` Step 3 (Dev Stack)에서 언어를 선택한 뒤 각 언어별 프레임워크 서브 프롬프트가 표시되지 않음.

**Root cause 후보**:
1. `frameworks[0].id` — 빈 배열일 때 `TypeError: Cannot read properties of undefined` → `ExitPromptError` 로 catch되어 wizard 중단
2. `checkbox` 반환값이 빈 배열인 경우 for-loop 미실행
3. `LANGUAGE_REGISTRY[lang]` undefined 접근 시 silent crash

**추가 스펙 갭** (분석 결과):
- Kotlin 언어 미등록
- Node.js: nextjs-api/fastify 제거, 3개로 축소
- Java: java-pure 제거, 2개로 축소
- .NET: aspnet/blazor → aspnet-minimal/aspnet-mvc 교체
- Rust: axum 기본값으로 순서 변경
- Frontend: 다중선택(checkbox) → 단일선택(select), React/Vue/Svelte/None으로 교체
- schemaVersion: 6 → 7

---

## Phase 1: Foundation — Shared Types & Schema

- [X] T001 Update `Language` union type to add `'kotlin'` in `packages/shared/src/types/wizard-state.ts`
- [X] T002 Update `FrontendTech` union type: replace `'vuejs' | 'reactjs' | 'typescript' | 'javascript'` with `'react' | 'vue' | 'svelte' | 'none'` in `packages/shared/src/types/wizard-state.ts`
- [X] T003 Change `DevStackConfig.frontend` field type from `FrontendTech[]` to `FrontendTech | null` in `packages/shared/src/types/wizard-state.ts`
- [X] T004 Bump `schemaVersion: 6` → `7` in `packages/shared/src/types/wizard-state.ts` (WizardState interface) and add migration comment
- [X] T005 [P] Update `languageSchema` to add `'kotlin'` in `packages/shared/src/schemas/wizard-state.schema.ts`
- [X] T006 [P] Update `frontendTechSchema` enum to `['react', 'vue', 'svelte', 'none']` in `packages/shared/src/schemas/wizard-state.schema.ts`
- [X] T007 Change `devStackConfigSchema.frontend` from `z.array(frontendTechSchema)` to `frontendTechSchema.nullable()` in `packages/shared/src/schemas/wizard-state.schema.ts`
- [X] T008 Bump `schemaVersion: z.literal(6)` → `z.literal(7)` in `packages/shared/src/schemas/wizard-state.schema.ts`
- [X] T009 [P] Update `brewnetConfigSchema` — same frontendTechSchema + schemaVersion change in `packages/shared/src/schemas/config.schema.ts`
- [X] T010 Update `SCHEMA_VERSION` constant to `7` in `packages/shared/src/utils/constants.ts`

---

## Phase 2: Framework Registry Update

> **US1**: 사용자가 언어를 선택하면 해당 언어의 프레임워크 서브 프롬프트가 즉시 표시된다.

- [X] T011 [US1] Add `kotlin` entry with `ktor` (default) + `springboot-kt` frameworks in `packages/cli/src/config/frameworks.ts`
- [X] T012 [US1] Update `nodejs` frameworks: remove `nextjs-api`, `fastify` — keep `nextjs` (default), `express`, `nestjs` with updated descriptions in `packages/cli/src/config/frameworks.ts`
- [X] T013 [US1] Update `java` frameworks: remove `java-pure` — keep `spring`, `springboot` (default, recommended) in `packages/cli/src/config/frameworks.ts`
- [X] T014 [US1] Update `dotnet` frameworks: replace `aspnet` + `blazor` with `aspnet-minimal` (default), `aspnet-mvc` in `packages/cli/src/config/frameworks.ts`
- [X] T015 [US1] Reorder `rust` frameworks: move `axum` to index 0 (default), `actix-web` to index 1 in `packages/cli/src/config/frameworks.ts`
- [X] T016 [US1] Replace `FRONTEND_REGISTRY`: keys `react`, `vue`, `svelte`, `none` (remove vuejs/reactjs/typescript/javascript) with Vite-based descriptions in `packages/cli/src/config/frameworks.ts`
- [X] T017 [US1] Update `Language` export type in `packages/cli/src/config/frameworks.ts` to add `'kotlin'`
- [X] T018 [US1] Update `FrontendTech` export type in `packages/cli/src/config/frameworks.ts` to match new values

---

## Phase 3: Bug Fix — Framework Sub-Prompt Not Appearing

> **US1** (continued): 핵심 버그 수정

- [X] T019 [US1] Add guard in framework selection loop: skip `select()` only if `frameworks` is empty AND add `'(no framework — plain language)'` fallback option in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T020 [US1] Fix `default` prop crash: replace `frameworks[0].id` with `frameworks[0]?.id ?? ''` defensive access in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T021 [US1] Add per-language header with version info above each framework `select()` prompt (e.g., `Python 3.13`, `Node.js 22 LTS`) in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T022 [US1] Change framework section label from conditional to always-shown when languages selected, with explicit `─── Framework Selection ───` separator in `packages/cli/src/wizard/steps/dev-stack.ts`

---

## Phase 4: Frontend Selection Revamp

> **US2**: 언어/프레임워크 선택 완료 후 프론트엔드를 단일 선택으로 고른다.

- [X] T023 [US2] Change frontend prompt from `checkbox` to `select` with choices: React (Vite), Vue.js (Vite), SvelteKit, Skip frontend in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T024 [US2] Update `selectedFrontend` variable type from `FrontendTech[]` to `FrontendTech | null` (value `'none'` maps to `null`) in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T025 [US2] Update `buildDevStackState` signature: `frontend: FrontendTech | null` (remove array) in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T026 [US2] Update `applySkipDevStack`: set `next.devStack.frontend = null` instead of `[]` in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T027 [US2] Update `isDevStackEmpty`: check `frontend === null` instead of `frontend.length === 0` in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T028 [US2] Update Dev Stack Summary section: show single frontend name or "(none)" in `packages/cli/src/wizard/steps/dev-stack.ts`

---

## Phase 5: Defaults & State Migration

- [X] T029 Update `createDefaultWizardState()`: `devStack.frontend: null`, add `kotlin` to language list placeholder, bump `schemaVersion: 7` in `packages/cli/src/config/defaults.ts`
- [X] T030 Update `loadState()` migration: detect `schemaVersion < 7` and convert `frontend: []` → `null`, `frontend: ['reactjs']` → `'react'`, etc. in `packages/cli/src/wizard/state.ts`
- [X] T031 [P] Update all places that reference `devStack.frontend` as array (`.length`, `.includes()`, `.map()`) to handle `FrontendTech | null` — check `complete.ts`, `review.ts`, `compose-generator.ts`, `service-verifier.ts`

---

## Phase 6: Test Updates

- [X] T032 Update `tests/unit/cli/config/frameworks.test.ts`: language count 7→8 (add kotlin), framework totals (20→19), FRONTEND_REGISTRY keys and names, EXPECTED_FRAMEWORKS_BY_LANGUAGE for all changed languages
- [X] T033 Update `tests/unit/cli/wizard/dev-stack.test.ts`: FrontendTech type assertions, `applySkipDevStack` frontend null check, `isDevStackEmpty` null check, `buildDevStackState` single frontend
- [X] T034 Update `tests/unit/cli/wizard/state.test.ts`: schemaVersion 6→7, `devStack.frontend: null` default, migration test for v6 state
- [X] T035 [P] Update `tests/integration/review-export.test.ts`: schemaVersion 6→7, `frontend: null` in state fixtures
- [X] T036 [P] Update `tests/integration/project-setup.test.ts`: schemaVersion 6→7
- [X] T037 [P] Update `tests/e2e/full-install.test.ts`, `tests/e2e/partial-install.test.ts`: schemaVersion 6→7
- [X] T038 Add new test: framework loop shows prompt for each selected language (regression test for the core bug) in `tests/unit/cli/wizard/dev-stack.test.ts`
- [X] T039 Add new test: framework loop with 0 languages selected → no framework prompts → no crash in `tests/unit/cli/wizard/dev-stack.test.ts`

---

## Phase 7: Polish

- [X] T040 [P] Update step header in `dev-stack.ts`: "Step 4/8" is still correct (AdminSetup=0 shift already done) — verify step counter display matches TOTAL_STEPS
- [X] T041 [P] Update `getFilteredFrameworks` JSDoc comment: remove "Languages with no frameworks (e.g., Rust, Go) get an empty array" (no longer true) in `packages/cli/src/wizard/steps/dev-stack.ts`
- [X] T042 [P] Update `CLAUDE.md` language references from BUSL-1.1 business model section if it mentions FrontendTech types

---

## Dependency Order

```
Phase 1 (T001-T010) → Phase 2 (T011-T018) → Phase 3 (T019-T022)
                    ↘                       ↗
                      Phase 4 (T023-T028) →
                                            Phase 5 (T029-T031) → Phase 6 (T032-T039) → Phase 7
```

Phase 1과 Phase 2는 순서대로 (타입 먼저, 그 다음 레지스트리).
Phase 3과 Phase 4는 Phase 2 완료 후 병렬 진행 가능.

---

## Critical Path (MVP)

버그만 빠르게 고치려면:

```
T019 → T020 → T021 → T022 (프레임워크 서브 프롬프트 버그 수정만)
```

전체 스펙 정합성 포함:

```
T001~T010 → T011~T018 → T019~T028 → T029~T031 → T032~T039
```

---

**Total**: 42 tasks | **Parallelizable**: T005-T006, T009, T011-T018 (registry), T031, T035-T037, T040-T042
