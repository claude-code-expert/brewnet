# Feature Specification: Create App Modal — Boilerplate List Restriction & Mode Clarification

**Feature Branch**: `001-fix-create-app-modal`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "Create App 모달 개선: boilerplate 목록을 docs/boilerplate-list.md 기준 16개로 정확히 제한하고, boilerplate(언어+프레임워크 선택 → Gitea repo 생성 + 빌드/배포 자동화)와 git-clone(기존 소스를 Gitea로 미러링, 소스 관리 목적)의 역할과 UX 플로우를 명확히 구분."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Beginner Chooses a Boilerplate Stack (Priority: P1)

A first-time user opens "Create New App" and selects Boilerplate mode. They want a working app with their preferred language and framework ready to run — without writing any code. They see exactly the 16 supported stacks (from the official boilerplate list), select one, and confirm. The system creates a Gitea repository, clones the template, builds, and starts the app automatically.

**Why this priority**: This is the primary happy path. Restricting the list to 16 supported stacks prevents broken "Create" attempts with unsupported options. The clearest UX win for beginners.

**Independent Test**: Open "Create New App" → select Boilerplate → verify exactly 16 stacks appear (matching docs/boilerplate-list.md) → select any stack → complete → confirm app appears in the Apps list with a running deployment job.

**Acceptance Scenarios**:

1. **Given** the user opens "Create New App" and chooses Boilerplate mode, **When** Step 2 loads, **Then** exactly 16 stacks appear, grouped by language (Go, Python, Java, Rust, Kotlin, Node.js), matching `docs/boilerplate-list.md` — no Ruby, no Quarkus, no unsupported entries.
2. **Given** the user selects a stack and completes the wizard, **When** they click "Create App", **Then** a progress modal appears showing Gitea repo creation → clone → build → start steps.
3. **Given** the stack list is displayed, **When** the user scans it, **Then** each item shows the language and framework name clearly with the stack ID in a secondary style.

---

### User Story 2 — User Understands Mode Difference Before Choosing (Priority: P1)

A user at Step 1 sees two mode options: **Boilerplate** and **Git Clone**. Before clicking Next, they can read a clear description under each mode button explaining what each does and when to use it — without needing to hover or click for more info.

**Why this priority**: Without clear mode distinction, beginners pick the wrong mode. This is a UX-only change with zero backend impact but high confusion-reduction value.

**Independent Test**: Open "Create New App" → Step 1 → both mode buttons visible → description text under each mode correctly explains purpose and outcome — no tooltips needed.

**Acceptance Scenarios**:

1. **Given** Step 1 is displayed, **When** the user reads the mode descriptions, **Then** "Boilerplate" explains it creates a new project from a ready-made template with auto build and deploy, and "Git Clone" explains it mirrors an existing git repository into Gitea for source management only (no auto-deploy).
2. **Given** the user selects "Git Clone" mode, **When** Step 2 loads, **Then** a URL input field appears (not a language/framework picker), with a placeholder like "https://github.com/you/your-repo.git".
3. **Given** the user selects "Boilerplate" mode, **When** Step 2 loads, **Then** the 16-stack list appears (no URL input).

---

### User Story 3 — Git Clone Mode Captures Source URL (Priority: P2)

A user who already has source code in an external repository wants to mirror it into Gitea via brewnet for centralized source management. They select Git Clone mode, enter their repository URL, and the system creates a Gitea mirror. No build or deploy automation is triggered.

**Why this priority**: This is a distinct workflow from boilerplate. Clarifying that Git Clone does NOT auto-deploy prevents user confusion and wasted time debugging "why didn't my app deploy?"

**Independent Test**: Create App → Git Clone mode → enter a valid public git URL → complete → app appears in list with mode="git-clone" and status="stopped" (no auto-deploy).

**Acceptance Scenarios**:

1. **Given** the user selected Git Clone and entered a valid git URL, **When** they click "Create App", **Then** the system mirrors the repo into Gitea and the app appears in the Apps list with status "stopped" and no active deployment job.
2. **Given** the user completes Git Clone setup, **When** viewing the app in the Apps list, **Then** no auto-deploy progress modal appears.
3. **Given** the user enters no URL in Git Clone mode, **When** they try to click Next, **Then** an inline validation message appears: "Repository URL is required."

---

### Edge Cases

- What if the user changes mode on Step 1 after having already advanced to Step 2? → When returning to Step 1 and switching mode, all Step 2 state (selected stack, entered URL) MUST reset to empty.
- What if all 16 boilerplate stacks fail to load? → Show a fallback error state: "Could not load available stacks. Please try again."
- What if the user enters an app name that already exists? → Inline validation on Step 1 catches this before Step 2 is reached and shows: "An app with this name already exists."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Step 2 in Boilerplate mode MUST display exactly 16 stacks as defined in `docs/boilerplate-list.md` — no more, no fewer.
- **FR-002**: Unsupported languages (Ruby) and frameworks (Quarkus, Fastify, Koa, Rails, Sinatra) MUST NOT appear anywhere in the Create App modal.
- **FR-003**: Stacks in the Boilerplate list MUST be grouped by language (Go, Python, Java, Rust, Kotlin, Node.js) to aid quick scanning.
- **FR-004**: Each stack entry MUST display the language name and framework name. The stack ID MUST be shown in a secondary style for transparency.
- **FR-005**: Step 1 MUST display a visible, always-readable description beneath each mode button explaining its purpose and outcome — no tooltip required.
- **FR-006**: Boilerplate mode description MUST communicate: "Creates a new app from a pre-built template. A Gitea repository is created automatically and the app is built and started."
- **FR-007**: Git Clone mode description MUST communicate: "Mirrors an existing git repository into Gitea for source management. The app is NOT automatically built or deployed."
- **FR-008**: Git Clone mode's Step 2 MUST show a text input for the source repository URL, replacing the language/framework picker entirely.
- **FR-009**: Git Clone mode MUST use the value `'git-clone'` for the `mode` field sent to the backend.
- **FR-010**: When the user changes mode on Step 1 after visiting Step 2, all Step 2 state (selected stack ID, entered URL) MUST reset to empty defaults.
- **FR-011**: Boilerplate stack IDs in the UI MUST match the app name identifiers used by the backend (e.g. `go-app`, `py-app`, `java-app` per `docs/boilerplate-list.md`).

### Key Entities

- **BoilerplateStack**: Represents one selectable template. Attributes: `id` (stack ID matching backend), `lang` (display language), `framework` (display framework name).
- **AppMode**: Valid creation modes: `'boilerplate'` (new project from template, auto-deploy) | `'git-clone'` (source mirroring, no auto-deploy).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Create App modal's boilerplate list displays exactly 16 stacks — zero unsupported entries visible.
- **SC-002**: A user who reads the mode descriptions on Step 1 can correctly identify which mode to use for "I have existing code I want to manage" vs "I want a ready-to-run new project" — without consulting external documentation.
- **SC-003**: Zero unsupported language or framework options (Ruby, Quarkus, Fastify, Koa, Rails, Sinatra) appear anywhere in the Create App modal.
- **SC-004**: Git Clone and Boilerplate modes show entirely distinct Step 2 UIs — URL input vs stack list — with no overlap.
- **SC-005**: After completing Git Clone mode, the created app has `status: "stopped"` and no deployment progress modal is triggered.

## Assumptions

- The backend already accepts and correctly handles `mode: 'git-clone'` separately from `mode: 'boilerplate'`. This spec covers only the UI/modal layer.
- Stack IDs shown in the UI must match what the backend expects. The source of truth is `docs/boilerplate-list.md` column "앱 이름" (e.g. `go-app`, `go-echo`, `go-fiber`).
- The 16 supported stacks are stable and will not change during this implementation.
- The existing `'new-project'` mode (custom language/framework picker) is replaced entirely by the restricted 16-stack boilerplate list. The custom picker is removed.
- Short descriptions for each boilerplate stack are not required in this iteration; only language and framework name need to be displayed.
