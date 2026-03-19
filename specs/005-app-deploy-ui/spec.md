# Feature Specification: App Deploy UI

**Feature Branch**: `005-app-deploy-ui`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "App Deploy UI redesign: replace apps-page.ts with brewnet-app-deploy.html UI pattern, connect to real app-manager.ts APIs, fix known bugs, add port duplicate detection and connectRepoToApp"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - App Dashboard at a Glance (Priority: P1)

A user opens the Brewnet Admin panel and navigates to the App Deploy page. They immediately see: a stats bar showing total apps, running, stopped, and building counts; a list of app cards with status badges; and a Gitea repository table below.

**Why this priority**: This is the entry point for every other action. Without a functional display, no other story can be tested.

**Independent Test**: Start admin server with 2+ registered apps, open `/apps` page, verify stats bar shows correct counts and app cards render with correct status badges.

**Acceptance Scenarios**:

1. **Given** 3 registered apps (1 running, 1 stopped, 1 building), **When** the user opens `/apps`, **Then** stats bar shows TOTAL: 3, RUNNING: 1, STOPPED: 1, BUILDING: 1
2. **Given** a running app "my-blog", **When** the page loads, **Then** the app card shows app name, language chip, framework, port, Gitea repo path, commit count, and a green "● RUNNING" badge with pulse animation
3. **Given** no registered apps, **When** the page loads, **Then** an empty state message is shown and all stat counts are 0

---

### User Story 2 - Create App from Boilerplate (Priority: P1)

A user clicks "+ New App", selects a language/framework template (e.g., Go/Gin), enters an app name and port, then submits. The system creates a Gitea repository, pushes the boilerplate code, and shows a building status that transitions to stopped when ready.

**Why this priority**: App creation is the primary onboarding action. Without it, the page has nothing to show.

**Independent Test**: Click "+ New App" → Boilerplate tab → select template → enter name/port → submit → verify app appears in list as "building" then "stopped".

**Acceptance Scenarios**:

1. **Given** the New App modal is open on the Boilerplate tab, **When** the user selects "Go / Gin" and types "my-api", **Then** port field auto-fills to 8080 and a preview shows `git.local/admin/my-api`
2. **Given** a valid app name and port, **When** the user clicks "앱 생성 및 Gitea 푸시", **Then** the app is added to the list with status "building" and the modal closes
3. **Given** an app name with uppercase or spaces, **When** the user types, **Then** input is auto-normalized to lowercase-hyphen format
4. **Given** a port already in use by another app, **When** the user enters that port, **Then** a warning is displayed and the port field is highlighted

---

### User Story 3 - Create App from Git URL (Priority: P2)

A user pastes an external Git URL (e.g., `https://github.com/user/my-project`), the app name is auto-extracted, and after entering a port they submit. The system mirrors the repo to Gitea and registers the app.

**Why this priority**: Many users have existing projects on GitHub/GitLab and need to import them.

**Independent Test**: Enter Git Clone tab → paste URL → verify app name auto-fills → enter port → submit → verify app registered.

**Acceptance Scenarios**:

1. **Given** the Git Clone tab is active, **When** the user pastes `https://github.com/user/my-project.git`, **Then** the app name field auto-fills with "my-project"
2. **Given** a valid URL and name, **When** submitted, **Then** app appears in list as "building"

---

### User Story 4 - Create App from New Project (Priority: P2)

A user selects a language, optionally a framework, enters an app name and port. The system scaffolds a new project, creates a Gitea repo, and pushes the initial commit.

**Why this priority**: Supports new project start without needing an existing repo.

**Independent Test**: New Project tab → select Go → select Gin → enter name/port → submit → verify app registered.

**Acceptance Scenarios**:

1. **Given** the New Project tab, **When** the user selects "Node.js", **Then** framework chips appear (Express, NestJS, Next.js)
2. **Given** language and framework selected, **When** the user types an app name, **Then** a live preview shows Gitea path and port binding
3. **Given** only language selected (no framework), **When** submitted, **Then** language default scaffolding is used

---

### User Story 5 - Build and Deploy an App (Priority: P1)

A user clicks "Build" on an app card. A progress modal opens showing the first 4 steps of the build pipeline animating from waiting → active → done, with live log output scrolling in real time. Deploy shows all 6 steps. On completion, the modal shows a close button.

**Why this priority**: Build and Deploy are the core operations after app creation.

**Independent Test**: Click Build on a stopped app → verify progress modal opens → verify 4 steps animate sequentially → verify log output appears → verify close button appears on completion.

**Acceptance Scenarios**:

1. **Given** a stopped app, **When** the user clicks "Build", **Then** the progress modal opens showing "Git pull → Dockerfile 파싱 → Docker 이미지 빌드 → 이미지 태그 등록" steps
2. **Given** the progress modal is open, **When** a step becomes active, **Then** it animates with a rotating icon and the previous step shows a ✓ check
3. **Given** the build completes, **When** all steps reach "done", **Then** a "닫기" button appears
4. **Given** a "building" status app, **When** the user views the card, **Then** Build, Deploy, Start, and Stop buttons are all disabled
5. **Given** Deploy completes successfully, **When** the progress modal closes, **Then** the app status changes to "running"

---

### User Story 6 - Connect a Domain to an App (Priority: P2)

A user clicks the "🌐 도메인" button on an app card. A domain modal opens with 3 tabs: automatic Cloudflare setup, manual existing domain guide, and subdomain addition for already-tunneled domains.

**Why this priority**: External access is a key value proposition of Brewnet.

**Independent Test**: Open domain modal → verify 3 tabs → fill Cloudflare tab fields → verify live URL preview updates.

**Acceptance Scenarios**:

1. **Given** the domain modal is open on "새 Cloudflare 도메인" tab, **When** the user enters subdomain "myapp" and domain "example.com", **Then** preview shows "myapp.example.com"
2. **Given** the modal is on "기존 도메인 연결" tab, **When** the user enters a domain, **Then** a DNS CNAME guide is displayed with a copy button for the tunnel ID
3. **Given** the modal is on "서브도메인 추가" tab, **When** the user selects a base domain and types a prefix, **Then** the full subdomain is previewed in real time
4. **Given** a domain is successfully connected, **When** the modal closes, **Then** the app card shows "🌐 connected-domain.com ↗" as a clickable link

---

### User Story 7 - Delete an App (Priority: P2)

A user clicks the delete button on a stopped app. A confirmation modal appears requiring the user to type the app name before deleting.

**Why this priority**: Destructive operations must be protected from accidents.

**Independent Test**: Click delete on a stopped app → verify name confirmation input required → type correct name → verify delete button activates → confirm → verify app removed from list.

**Acceptance Scenarios**:

1. **Given** a running app, **When** the user clicks delete, **Then** the modal shows a red warning "먼저 Stop을 눌러 중지하세요" and the delete button is disabled
2. **Given** a stopped app, **When** the user clicks delete, **Then** a name confirmation input appears
3. **Given** the delete modal is open, **When** the user types the wrong app name, **Then** the delete button remains disabled
4. **Given** the correct app name is typed, **When** the delete button is clicked, **Then** the app is removed from the list and its Gitea repo connection is released

---

### User Story 8 - View and Connect Gitea Repositories (Priority: P3)

The bottom section shows all Gitea repositories with a badge indicating whether each is connected to an App Deploy entry. Unconnected repos have a "+ 연결" action button.

**Why this priority**: Provides visibility into Gitea repos and enables connecting existing repos to the deploy system.

**Independent Test**: Page loads → verify Gitea repo table shows all repos → verify connected repos show green badge → verify unconnected repos show "+ 연결" button.

**Acceptance Scenarios**:

1. **Given** 6 Gitea repos (3 connected, 3 not), **When** the page loads, **Then** connected repos show `✔ <appName>` in green and unconnected show "미연결" in grey
2. **Given** an unconnected repo, **When** the user clicks "+ 연결", **Then** a connection is registered and the badge updates to show the linked app name

---

### Edge Cases

- What happens when the admin server cannot reach Gitea? → Show error in the relevant section with a retry option
- How does the system handle a port already in use when creating an app? → Warn the user and suggest the next available port
- What happens if an app is deleted while building? → Block deletion during "building" status (same as running)
- How are apps with a `building` status treated on page reload? → Restore building state from job status API
- What happens when a domain is already connected to another app? → Show a warning in the domain modal
- What if the user closes the progress modal while a build is still running? → The build continues in the background; app stays in "building" status

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The page MUST display a stats bar showing total app count, running count, stopped count, and building count, updated on each page load and manual refresh
- **FR-002**: The page MUST display each registered app as a card showing: name, status badge, language chip, framework, port, Gitea repo path, commit count, last action time, and domain link (or connect button)
- **FR-003**: Each app card MUST show action buttons (Build, Deploy, Start/Stop, Domain, Delete) with enabled/disabled state matching the app's current status
- **FR-004**: The New App modal MUST support 3 creation modes: Boilerplate template selection, Git URL import, and New Project scaffolding
- **FR-005**: App name inputs MUST auto-normalize to lowercase letters and hyphens only
- **FR-006**: The system MUST detect port conflicts when creating an app, warn the user, and suggest the next available port
- **FR-007**: Build and Deploy actions MUST display a step-by-step progress modal with animated state transitions (waiting → active → done) and scrolling log output
- **FR-008**: The progress modal MUST poll the backend for real step progress and log output
- **FR-009**: After a successful Deploy, the app status MUST automatically change to "running"
- **FR-010**: The domain modal MUST support 3 connection modes: automatic Cloudflare setup, manual existing domain guide, and subdomain addition
- **FR-011**: The domain modal MUST show a real-time URL preview as the user types domain/subdomain fields
- **FR-012**: App deletion MUST require the user to type the exact app name before the delete button becomes active
- **FR-013**: App deletion MUST be blocked when the app is in "running" or "building" status
- **FR-014**: The Gitea repository table MUST show all repos with connection status badge (connected app name or "미연결")
- **FR-015**: Unconnected repos in the Gitea table MUST have a "+ 연결" action that registers the repo to the App Deploy system
- **FR-016**: A status filter dropdown MUST allow filtering the app list by: 전체 / Running / Stopped / Building

### Key Entities

- **App**: Registered deploy target — name (unique identifier), language, framework, status (running/stopped/building), port, Gitea repo path, domain (nullable), commit count, last action time
- **GiteaRepo**: Gitea repository record — name, language, private flag, star count, last updated, linked app ID (nullable)
- **AppJob**: In-progress creation or build task — job ID, app name, current step index, step list, log lines, status (running/done/failed)
- **DomainConnection**: Association between an app and an external domain — app ID, domain string, connection mode (cloudflare/manual/subdomain), tunnel ingress registered flag

### Assumptions

- Gitea is running and accessible at `git.local` (or configured host)
- The admin server is already running when the user opens the page
- A valid Gitea token exists at `~/.brewnet/gitea-token`
- App registry is stored at `~/.brewnet/apps.json`
- Boilerplate templates are already available from `001-create-app` implementation

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create an app from a boilerplate template and see it appear in the list within 5 seconds of submission
- **SC-002**: Build/Deploy progress modal updates are visible within 1 second of each step completing on the server
- **SC-003**: The app list and stats bar reflect accurate real-time status — no stale data shown without a manual refresh
- **SC-004**: All app card action buttons correctly enable/disable based on app status with zero incorrect states
- **SC-005**: App deletion requires name confirmation and cannot be triggered on a running or building app under any circumstance
- **SC-006**: Domain connection modal previews update in real time as the user types (no perceptible delay)
- **SC-007**: The Gitea repo table loads and displays all repos within 2 seconds of page open

---

## Admin Dashboard — Services Table URL Display Rules

### Unified Stack (nodejs-nextjs*) — Two-Line Local URL

`nodejs-nextjs` / `nodejs-nextjs-full` 스택은 프론트엔드와 백엔드가 **포트 3000 하나**를 공유.
서비스 테이블 Local 컬럼에 단순히 `http://localhost:3000`만 표시하면 API 접근 경로가 보이지 않으므로,
`isUnified` 스택에 한해 두 줄로 표기한다:

| 줄 | 표기 | 용도 |
|----|------|------|
| 1 | `http://localhost:<port>` | Next.js 프론트엔드 (UI 진입점) |
| 2 | `http://localhost:<port>/api/hello` | Next.js API Route 확인용 |

**감지 방법**: `BOILERPLATE_STACKS` 배열에서 `isUnified === true`이고 `backendUrl` 포트가 `s.port`와 일치하는 항목이 있으면 unified로 판단.

**구현 위치**: `packages/cli/src/services/admin-server.ts` — `loadServices()` 내 `tbody.innerHTML` 렌더링 블록.

**비 unified 스택**: 단일 링크만 표시 (기존 동작 유지).
