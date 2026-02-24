# Docker 자동 설치 Requirements Checklist

**Purpose**: Docker 자동 설치 요건(REQ-1.2.8~1.2.12)의 완결성·명확성·일관성·커버리지를 검증하는 요건 품질 체크리스트
**Created**: 2026-02-24
**Feature**: [spec.md — User Story 2](../spec.md)
**Scope**: `REQ-1.2.8~REQ-1.2.12`, `T043~T044`, `spec.md §US2`, `docker-installer.ts`
**Depth**: Standard (PR 리뷰 수준)

---

## Requirement Completeness

- [ ] CHK001 — macOS + Homebrew 있음 / macOS + Homebrew 없음 / Linux 세 가지 설치 경로가 모두 요건에 명시되어 있는가? [Completeness, Spec §US2, REQ-1.2.8~1.2.9]
- [ ] CHK002 — Docker 자동 설치 성공 이후 "데몬 기동 확인" 단계가 별도 요건(REQ-1.2.10)으로 분리 정의되어 있는가? [Completeness, REQ-1.2.10]
- [ ] CHK003 — Linux 설치 후 docker 그룹 추가(REQ-1.2.11)와 관련된 **재로그인 없이 현재 세션에서 동작하는 방식**에 대한 요건이 정의되어 있는가? [Completeness, Gap, REQ-1.2.11]
- [ ] CHK004 — Docker 이미 설치된 경우 설치 단계를 건너뛰는 요건이 spec.md 또는 REQ에 명시되어 있는가? [Completeness, Spec §US2 시나리오 6]
- [ ] CHK005 — Homebrew 자동 설치(REQ-1.2.9) 실패 시 처리 요건이 독립적으로 정의되어 있는가, 아니면 Docker 설치 실패(REQ-1.2.12)에 통합되어 있는가? [Completeness, Ambiguity, REQ-1.2.9/1.2.12]

---

## Requirement Clarity

- [ ] CHK006 — "데몬 기동 확인" 타임아웃 값(macOS 90초, Linux 30초)이 요건에 정량적으로 명시되어 있는가, 아니면 구현 코드에만 존재하는가? [Clarity, REQ-1.2.10, Gap]
- [ ] CHK007 — REQ-1.2.8의 "공식 convenience script(get.docker.com)"가 특정 URL·버전·검증(checksum 등) 수준까지 명시되어 있는가? [Clarity, REQ-1.2.8, Ambiguity]
- [ ] CHK008 — "수동 설치 URL(플랫폼별) 안내"(REQ-1.2.12)에서 macOS와 Linux 각각의 URL이 요건에 명확히 지정되어 있는가? [Clarity, REQ-1.2.12]
- [ ] CHK009 — "재로그인 안내"(REQ-1.2.11)가 어떤 형태(CLI 출력, 경고 메시지 등)로 표시되어야 하는지 요건에 정의되어 있는가? [Clarity, REQ-1.2.11, Ambiguity]
- [ ] CHK010 — "Docker 자동 설치 시작" 시 사용자에게 사전 고지(동의 없는 시스템 변경)가 필요한지에 대한 요건이 명시되어 있는가? [Clarity, Gap]

---

## Requirement Consistency

- [ ] CHK011 — spec.md §US2 시나리오 2(구 "BN001 halts with install instructions")가 신규 자동 설치 시나리오(2~6)로 대체된 후, BN001 에러 코드 사용 시점이 `errors.ts` 정의 및 `docker-manager.ts` 기존 가드와 충돌 없이 일관되게 정의되어 있는가? [Consistency, Spec §US1 시나리오 4, REQ-1.2.8]
- [ ] CHK012 — tasks.md의 T037("Docker + Docker Compose version check 24.0+") 체크포인트 설명("halts on Docker missing(BN001)")이 신규 자동 설치 흐름을 반영하여 업데이트되었는가? [Consistency, T037, T042~T044]
- [ ] CHK013 — REQUIREMENT.md REQ-1.2.2("설치 여부 확인")와 REQ-1.2.8("자동 설치")가 서로 보완 관계임이 명확하며, REQ-1.2.2가 "확인 후 자동 설치 트리거"로 역할이 재정의되었는가? [Consistency, REQ-1.2.2 vs REQ-1.2.8]
- [ ] CHK014 — REQUIREMENT_ADDENDUM.md 등 파생 문서에서 Docker 사전 설치 가정(현재 "사용자 직접 설치")이 자동 설치 정책으로 일관되게 갱신되었는가? [Consistency, Gap]

---

## Scenario Coverage

- [ ] CHK015 — Docker 설치 중 **네트워크 오류**(curl 실패, Homebrew 다운로드 실패)에 대한 예외 시나리오가 요건에 정의되어 있는가? [Coverage, Exception Flow, Gap]
- [ ] CHK016 — macOS에서 **Docker Desktop 최초 실행 시 사용자 약관 동의 UI**가 필요한 상황에 대한 요건(또는 의도적 제외 명시)이 있는가? [Coverage, Edge Case, Gap]
- [ ] CHK017 — Linux에서 **systemctl이 없는 환경**(Alpine, 일부 컨테이너, WSL2)에 대한 예외 처리 요건이 정의되어 있는가? [Coverage, Edge Case, Gap]
- [ ] CHK018 — Docker 설치 성공 후 **Docker Compose(v2) 별도 확인** 시나리오가 요건에 포함되어 있는가? (Docker CLI는 설치됐으나 compose plugin 누락 케이스) [Coverage, Gap, REQ-1.2.8]
- [ ] CHK019 — **Ctrl+C 인터럽트** 발생 시(설치 도중 사용자 취소) 부분 설치 상태 정리 요건이 정의되어 있는가? [Coverage, Exception Flow, Gap]
- [ ] CHK020 — Docker 설치 후 **버전 검증**(24.0+ 요건)이 자동 설치 경로에서도 수행되는지 요건에 명시되어 있는가? [Coverage, REQ-1.2.2, REQ-1.2.8]

---

## Acceptance Criteria Quality

- [ ] CHK021 — spec.md §US2 시나리오 2~5의 "Then" 절이 관찰 가능한 출력(메시지 내용, 종료 코드, spinner 상태 등)으로 충분히 구체적인가? [Acceptance Criteria, Spec §US2]
- [ ] CHK022 — "데몬 기동 확인 타임아웃"(REQ-1.2.10) 요건이 "최대 X초 이내 준비 완료"로 객관적으로 측정 가능하게 정의되어 있는가? [Measurability, REQ-1.2.10]
- [ ] CHK023 — "설치 성공" 판정 기준(`docker info` 종료 코드 0 등)이 spec 또는 REQ 수준에서 명시되어 있는가, 아니면 구현에만 암묵적으로 존재하는가? [Measurability, Gap]

---

## Non-Functional Requirements

- [ ] CHK024 — Docker 자동 설치에 소요되는 **최대 허용 시간**(전체 설치 과정 포함)에 대한 비기능 요건이 정의되어 있는가? [NFR, Performance, Gap]
- [ ] CHK025 — 설치 과정에서 **sudo 권한 요청**(Linux)이 필요하다는 사실을 사용자에게 사전 고지하는 보안 요건이 명시되어 있는가? [NFR, Security, REQ-1.2.8]
- [ ] CHK026 — get.docker.com 스크립트 실행 시 **무결성 검증**(checksum, https 강제) 요건이 정의되어 있는가? [NFR, Security, Gap]

---

## Dependencies & Assumptions

- [ ] CHK027 — macOS 자동 설치가 **Homebrew에 의존**한다는 사실이 요건의 전제 조건(Assumption)으로 명시되어 있는가? [Assumption, REQ-1.2.8~1.2.9]
- [ ] CHK028 — Docker 자동 설치가 **인터넷 연결 필수**라는 전제가 "Offline First" 헌법 원칙과의 관계에서 요건에 명시적으로 예외 처리되어 있는가? [Assumption, Conflict, CLAUDE.md §Offline First]
- [ ] CHK029 — Linux 설치 시 지원 배포판 범위(Ubuntu/Debian/CentOS/RHEL 등)가 요건에 명확히 정의되어 있는가? [Dependency, Clarity, REQ-1.2.8]

---

## Notes

- 체크 완료 항목: `[x]` 로 변경
- `[Gap]` 항목은 현재 요건 문서에 해당 내용이 없음을 의미
- `[Ambiguity]` 항목은 요건이 존재하나 해석에 따라 달라질 수 있음을 의미
- `[Conflict]` 항목은 두 요건 간 잠재적 충돌 가능성을 의미
