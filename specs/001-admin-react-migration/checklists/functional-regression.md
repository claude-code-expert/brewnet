# Functional Regression Requirements Checklist: Admin UI React Migration

**Purpose**: Validate that the functional regression requirements (SC-002 and related FRs) are specific enough to objectively verify that the React implementation "works identically" to the old HTML-generation approach. Focus: spec-vs-implementation gap for user-action regression coverage.
**Created**: 2026-03-18
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [quickstart.md](../quickstart.md)
**Depth**: Thorough (~40 items) | **Audience**: Spec reviewer / implementation validator

---

## Requirement Completeness

- [ ] CHK001 Is the complete list of "existing user actions" covered by SC-002 explicitly enumerated — or is the boundary of "every action" left to interpreter discretion? [Completeness, Spec §SC-002, Gap]
- [ ] CHK002 Are the exact polling interval values (in milliseconds) for all status refreshes documented in the spec, so FR-006's "same intervals" claim can be objectively verified? [Completeness, Spec §FR-006, Gap]
- [ ] CHK003 Are all four App Detail tabs (Overview, Deployment, Logs, Domain) individually specified with their own data-loading behavior, not just named as a list? [Completeness, Spec §FR-008, Gap]
- [ ] CHK004 Is the exact toast message text for the deploy-before-start guard (FR-009) specified, enabling byte-level regression comparison with the old implementation? [Completeness, Spec §FR-009, Gap]
- [ ] CHK005 Are response schemas (field names, types, example values) documented for the two new endpoints — `GET /api/config` and `GET /api/services/catalog` — that FR-011 mandates? [Completeness, Spec §FR-011, Gap]
- [ ] CHK006 Is there a complete inventory (or reference) of the 30+ existing REST API endpoints so that FR-003's "all unchanged" claim can be audited against a defined list? [Completeness, Spec §FR-003, Gap]
- [ ] CHK007 Are the Cloudflare credentials form field names, validation rules, and persistence format specified for the Settings tab (FR-007), or does the spec only state the form exists? [Completeness, Spec §FR-007, Gap]
- [ ] CHK008 Are the SSE log stream reconnection behavior requirements specified — retry interval, maximum retry count, and UI "reconnecting…" indicator — beyond the single edge-case bullet in the spec? [Completeness, Spec §Edge Cases, Gap]

---

## Requirement Clarity

- [ ] CHK009 Is "works identically" in SC-002 clarified with specific behavioral comparisons or an explicit test oracle — or does it rely on the implementer's subjective judgment? [Clarity, Spec §SC-002, Ambiguity]
- [ ] CHK010 Is "same setInterval polling strategy and intervals as the current implementation" in FR-006 defined with actual numeric intervals, not a forward-reference to implementation code? [Clarity, Spec §FR-006, Ambiguity]
- [ ] CHK011 Is "silent fallback" in FR-010 (BN502 suppression) defined precisely enough to distinguish between: (a) no toast, (b) no console log, and (c) no visible UI change? [Clarity, Spec §FR-010, Ambiguity]
- [ ] CHK012 Is "replicates the existing visual design 1:1" (FR-002) defined with measurable tolerance criteria, or is it purely a subjective visual comparison? [Clarity, Spec §FR-002, Ambiguity]
- [ ] CHK013 Is "all pages load within 2 seconds on local connection" (SC-001) defined with a specific measurement method — e.g., Time to Interactive, First Contentful Paint, or wall-clock from navigation? [Clarity, Spec §SC-001]
- [ ] CHK014 Is "status updates within 3 seconds" in User Story 2 AC-4 defined with a measurement starting point — from click event, from server response, or from visual indicator appearance? [Clarity, Spec §US2]
- [ ] CHK015 Is there a consistent definition of "identical"/"same" (SC-002) versus "replicate" (FR-002) versus "preserved" (FR-009) — or do these terms have ambiguously different tolerances? [Clarity, Consistency, Spec §SC-002, FR-002, FR-009]
- [ ] CHK016 Does FR-008 specify whether App Detail tabs must preserve their internal scroll position or loaded data when the user switches between tabs and returns? [Clarity, Spec §FR-008, Gap]
- [ ] CHK017 Is "no spurious error toasts appear on page load" (SC-004) defined with a complete enumeration of suppressed error conditions, or only the Gitea-502 case? [Clarity, Spec §SC-004, Ambiguity]
- [ ] CHK018 Does FR-003's scope of "unchanged" cover HTTP response headers, authentication requirements, and error response codes — or only HTTP method and URL path? [Clarity, Spec §FR-003, Ambiguity]

---

## Requirement Consistency

- [ ] CHK019 Do the polling requirements in FR-006 (setInterval) align with the `usePolling.ts` hook pattern described in plan.md — specifically, is there a spec-level requirement to use React hooks rather than raw setInterval? [Consistency, Spec §FR-006, Plan]
- [ ] CHK020 Is the `sessionStorage` auth requirement in FR-014 consistent with the `apiFetch` wrapper / `auth-context.tsx` approach in plan.md, or does the spec leave the implementation mechanism open? [Consistency, Spec §FR-014, Plan]
- [ ] CHK021 Does the SSE `?token` query string fallback requirement (FR-004c) have a corresponding specification in the spec itself, or is it only referenced in the plan's implementation notes? [Consistency, Spec §FR-004, Plan, Gap]
- [ ] CHK022 Are each of the spec's edge cases (Quick Tunnel inactive, Gitea 502, app-not-found 404) explicitly traceable to a functional requirement that mandates specific React component behavior? [Consistency, Spec §Edge Cases, FR-006–FR-010]
- [ ] CHK023 Does SC-007 (no 404 on refresh) and FR-005 (SPA fallback for all non-API GET requests) reference each other, ensuring they are consistently interpreted and cannot diverge during implementation? [Consistency, Spec §SC-007, FR-005]

---

## Acceptance Criteria Quality

- [ ] CHK024 Can each of the five acceptance scenarios in User Story 2 (Apps page) be objectively pass/fail evaluated without access to the original HTML-generation implementation for comparison? [Measurability, Spec §US2]
- [ ] CHK025 Is "progress indicator during job execution" (US2 AC-2) defined with specific visual behavior — e.g., which steps are shown, update frequency, terminal state on completion — or is it visually undefined? [Measurability, Spec §US2, Ambiguity]
- [ ] CHK026 Is "a success message appears" (US2 AC-5, Cloudflare credentials save) defined with specific content, duration, or dismissal behavior? [Measurability, Spec §US2, Ambiguity]
- [ ] CHK027 Can SC-002 ("every existing user action works identically") be objectively verified without a reference recording of the pre-migration UI — i.e., is there a baseline test artifact or specification of the old behavior? [Measurability, Spec §SC-002, Gap]
- [ ] CHK028 Is "the correct page loads" in SC-007 defined with specific content criteria — e.g., expected DOM sections, API calls made — or only the absence of HTTP 404? [Measurability, Spec §SC-007, Ambiguity]
- [ ] CHK029 Is "live log output streams in real time" (US3 AC-2) quantified with a latency requirement or minimum update frequency, making it distinguishable from slow-polling? [Measurability, Spec §US3, Ambiguity]
- [ ] CHK030 Does US3 AC-3 ("connection succeeds and the hostname appears in the dashboard External Domains section") define the maximum time the user must wait before the hostname is visible? [Measurability, Spec §US3, Gap]

---

## Scenario Coverage

- [ ] CHK031 Is the password re-entry scenario covered — when the user refreshes the page or opens a new tab after `sessionStorage` is cleared — with explicit acceptance criteria? [Coverage, Spec §FR-014, Gap]
- [ ] CHK032 Is the create-app job failure scenario (job starts, then fails mid-progress) specified with acceptance criteria for the modal UI state and user recovery path? [Coverage, Spec §FR-007, Gap]
- [ ] CHK033 Is the concurrent session scenario (two browser tabs open to the same admin server simultaneously) addressed in requirements, especially for shared state like running jobs? [Coverage, Gap]
- [ ] CHK034 Is the initial page load with zero deployed apps ("empty state" for `/apps`) specified as a scenario with acceptance criteria, or only assumed to work from the edge-case bullet? [Coverage, Spec §Edge Cases, FR-007, Gap]
- [ ] CHK035 Is the browser back-button behavior during an active deploy job specified — e.g., does navigating away cancel the job, show a confirmation, or allow it to continue in the background? [Coverage, Spec §US4, Gap]

---

## Edge Case Coverage

- [ ] CHK036 Is the behavior when `/api/apps/:name` returns 404 *during periodic polling* (not just on initial navigation) specified separately from the initial-load edge case? [Edge Case, Spec §Edge Cases, FR-008, Gap]
- [ ] CHK037 Is the behavior when the admin server restarts while the React SPA is open in the browser specified — e.g., are pending API calls retried, or does the user see an error? [Edge Case, Gap]
- [ ] CHK038 Are the two distinct empty states — `BOILERPLATE_STACKS` returning an empty array versus the endpoint returning 404 — differentiated in requirements with separate render behaviors? [Edge Case, Spec §Edge Cases]
- [ ] CHK039 Is the Quick Tunnel URL detection edge case (multiple `trycloudflare.com` patterns appearing in the cloudflared log before the real URL) addressed in the spec's External Domains requirements? [Edge Case, Spec §US1 AC-3, Gap]
- [ ] CHK040 Are requirements defined for the scenario where the React bundle is served correctly but a critical API endpoint (e.g., `/api/services`) returns 503 during initial dashboard load — specifically, what the user sees? [Edge Case, Spec §FR-005, Gap]

---

## Notes

- Items marked `[Gap]` indicate requirements believed to be absent from the spec — they should be explicitly added or scoped out before implementation sign-off.
- Items marked `[Ambiguity]` indicate existing requirements that need quantification or clarification to be objectively testable.
- SC-002 ("Zero functional regressions") is the highest-risk requirement in this spec because its acceptance criterion ("works identically") is not self-evidencing without a behavioral baseline of the pre-migration implementation.
- Check items off as completed: `[x]`
