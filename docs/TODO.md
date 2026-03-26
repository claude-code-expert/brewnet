# Brewnet Development TODO

> Last updated: 2026-03-24

## 현재 구현 현황

```
CLI 명령어:       19/19 (100%)  ██████████
Dashboard UI:    핵심 완료      ████████░░
API 엔드포인트:   12/20 (60%)   ██████░░░░
설치 위저드:      7/7 (100%)    ██████████
도메인 기능:      핵심 완료      █████████░
테스트 커버리지:  70.01%        ███████░░░
```

---

## 🔴 P0 — MVP 필수

### CLI

- [x] `brewnet deploy <path>` — 로컬 프로젝트 배포 (`commands/deploy.ts`)

### Admin UI

- [x] App Detail > Domain 탭 완성 (006-domain-settings spec)
  - [x] `AppDomainTab.tsx` — connect/disconnect UI 구현됨
  - [x] `DomainSettingModal.tsx` — sequential step flow (`StepIndicator.tsx` 통합)
  - [x] contextual help tooltip (`HelpTooltip.tsx` + `HelpDrawer.tsx` 통합)

### 테스트

- [x] E2E 테스트 프레임워크 — JSON 시나리오 기반 16스택 자동화

---

## 🟡 P1 — 중요

### CLI

- [x] `brewnet export` — 프로젝트 설정 아카이브 (`commands/export.ts`)
- [x] `brewnet storage init` — 파일 서버 설정 (`commands/storage.ts`)

### Spec 완성

- [x] `004-centralized-logging` 완성
  - [x] Docker json-file 로깅 설정 compose 생성 시 자동 적용
  - [x] Traefik 액세스 로그 JSON 포맷 자동 설정

### 로그 시스템

- [x] 로그 회전 주기적 실행 — admin-server.ts 1시간 `setInterval` 구현됨

### 테스트

- [ ] CLI 코어 테스트 커버리지 90% 달성
  - 현재: **70.01%** (5679/8111 statements)
  - 목표: 90% → 잔여 ~1621 statements
  - 주요 갭:
    | 파일 | 미커버 | 현재% |
    |------|--------|-------|
    | `admin-server.ts` | ~756개 | ~32% |
    | `wizard/steps/system-check.ts` | ~225개 | ~7.5% |
    | `wizard/steps/init.ts` | ~195개 | ~7.5% |
    | `compose-generator.ts` | ~180개 | ~46% |
    | `app-manager.ts` | ~120개 | ~55% |
  - 난이도: Hard / 3-4주

---

## 🟢 P2 — 선택 기능

### Admin UI 확장

- [ ] 모니터링 대시보드 — CPU/Memory 그래프 (Recharts)
- [ ] 자동 백업 스케줄링 UI — cron 기반
- [ ] SSL 인증서 상태 모니터링
- [ ] 시스템 알림/이벤트 로그 페이지

### 인프라

- [x] 설치 텔레메트리 — Cloudflare Worker + KV (`infra/telemetry-worker/`)
- [ ] CI/CD 파이프라인 — GitHub Actions (lint + test + build)
- [ ] 코드 커버리지 리포팅 — Codecov 통합
- [ ] DDNS 자동 갱신 — DuckDNS/No-IP 지원

### 문서

- [ ] API 문서 정비 — 현재 구현된 엔드포인트 기준으로 재작성
