---
name: troubleshooting
description: Record a troubleshooting case to the troubleshooting/ folder. Use when the user reports an error, asks to document a solved issue, or says phrases like "트러블슈팅 기록", "에러 기록", "이슈 문서화", "/troubleshooting".
user-invocable: true
handoffs:
  - After recording, suggest running /changelog to include the fix in the session changelog
---

# Troubleshooting Recording Skill

## Purpose

발생한 에러 및 해결 과정을 `troubleshooting/` 폴더에 주제별 Markdown 파일로 기록합니다:
- 에러 타입 및 문제 요약
- 근본 원인 분석
- 해결 방안 및 코드 변경 내용
- 해결 여부 및 날짜
- 재발 여부 추적

## Usage

```bash
/troubleshooting "pgAdmin이 startup 시 fetch failed 반환"
/troubleshooting "pnpm 모노레포 폴더 이동 후 npm install 오류"
/troubleshooting  # 인자 없이 실행 시 현재 세션의 마지막 오류 자동 감지
```

## Workflow

### 1. Parse Arguments & Detect Topic

사용자 입력 또는 현재 세션 컨텍스트에서 주제를 파악합니다:
- 인자가 있으면 해당 내용 기반으로 주제 추출
- 인자가 없으면 대화 컨텍스트에서 가장 최근에 해결한 오류 자동 감지
- 주제를 파악할 수 없으면 사용자에게 요청

### 2. Determine File Name

주제 기반으로 파일명을 결정합니다:

**명명 규칙:**
- kebab-case 사용
- 에러 대상 + 오류 유형 + (선택) 해결 키워드
- 예시:
  - `pgadmin-startup-fetch-failed.md`
  - `pnpm-monorepo-path-after-move.md`
  - `traefik-dashboard-port-misconfiguration.md`
  - `docker-compose-secrets-migration.md`

**기존 파일 확인:**
```bash
ls troubleshooting/
```
- 같은 주제의 파일이 있으면 새 섹션으로 추가 (재발 사례)
- 없으면 새 파일 생성

### 3. Collect Information

대화 컨텍스트에서 다음을 추출합니다:
- **에러 메시지**: 실제 오류 텍스트
- **발생 조건**: 어떤 명령/상황에서 발생했는지
- **원인 분석**: 왜 발생했는지
- **해결 과정**: 무엇을 어떻게 수정했는지
- **코드 변경**: 수정된 파일 및 라인

### 4. Generate Troubleshooting Entry

`troubleshooting/templates/entry.md` 템플릿 기반으로 항목 생성:

```markdown
# [에러 제목]

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | YYYY-MM-DD |
| **상태** | ✅ 해결됨 / ⚠️ 우회 적용 / ❌ 미해결 |
| **에러 타입** | Network / Docker / Build / Runtime / Configuration / Package |
| **브랜치** | feature/xxx |
| **재발 여부** | 최초 발생 / 재발 (N번째) |
| **재발 주기** | — |

## 문제 요약

[1-3문장으로 무엇이 잘못되었는지 설명]

## 에러 상세

\`\`\`
[실제 에러 메시지]
\`\`\`

## 근본 원인

[왜 발생했는지 기술적으로 설명. 커밋/변경사항 참조 포함]

## 재현 조건

1. [재현 단계 1]
2. [재현 단계 2]

## 해결 방안

[해결을 위해 수행한 작업]

### 코드 변경 (있을 경우)

| 파일 | 변경 내용 |
|------|-----------|
| `경로/파일.ts` | 설명 |

### 명령어 (있을 경우)

\`\`\`bash
# 실행한 명령어
\`\`\`

## 예방 방법

[재발 방지를 위해 주의할 사항]

## 관련 참고

- 관련 커밋: `abc1234`
- 관련 파일: `경로/파일.ts`
- 관련 이슈: —

---
```

### 5. Write to File

**새 파일인 경우:**
```markdown
<!-- troubleshooting/[topic-name].md -->
# [에러 제목] Troubleshooting

> 이 문서는 [에러 제목] 관련 트러블슈팅 히스토리를 기록합니다.

[첫 번째 항목]
```

**기존 파일에 추가 (재발)인 경우:**
- 파일 상단의 최신순 정렬 유지
- 새 항목을 기존 항목 위에 추가
- 파일 헤더의 재발 횟수 업데이트

### 6. Update Recurrence Index

`troubleshooting/README.md`(인덱스 파일) 업데이트:

```markdown
# Troubleshooting Index

| 파일 | 에러 타입 | 마지막 발생 | 상태 | 재발 횟수 |
|------|-----------|-------------|------|-----------|
| [pgadmin-startup-fetch-failed.md](./pgadmin-startup-fetch-failed.md) | Runtime | 2026-03-01 | ✅ 해결됨 | 1 |
```

### 7. Report to User

```
📋 트러블슈팅 기록 완료:

파일: troubleshooting/[파일명].md
상태: ✅ 해결됨

기록된 내용:
- 에러 타입: [타입]
- 원인: [요약]
- 해결: [해결 방법 요약]

troubleshooting/README.md 인덱스도 업데이트되었습니다.
```

## Implementation Notes

### Error Type 분류

| 타입 | 설명 |
|------|------|
| `Network` | fetch failed, ECONNREFUSED, timeout |
| `Docker` | 컨테이너 기동 실패, 포트 충돌, compose 오류 |
| `Build` | TypeScript 컴파일 오류, 번들링 실패 |
| `Runtime` | 모듈 없음, 경로 오류, 실행 중 크래시 |
| `Configuration` | 환경변수 누락, 설정 파일 오류 |
| `Package` | npm/pnpm 의존성, 버전 충돌 |
| `Git` | 브랜치/커밋/경로 관련 |

### Status 결정 기준

- `✅ 해결됨`: 근본 원인을 수정하고 재현 없음
- `⚠️ 우회 적용`: 임시 방편으로 우회하지만 근본 원인 미해결
- `❌ 미해결`: 아직 해결책 없음

### Edge Cases

- 에러 메시지가 없는 경우: 대화 컨텍스트에서 최대한 재구성
- 여러 에러가 한 세션에 발생한 경우: 각각 별도 파일로 생성
- 같은 파일에 같은 에러가 재발한 경우: 기존 항목 아래에 "재발 기록" 섹션 추가

## Examples

### Example 1: Runtime 에러 기록

```bash
/troubleshooting "pgAdmin health check fetch failed"
```

→ 생성 파일: `troubleshooting/pgadmin-startup-fetch-failed.md`

### Example 2: Package 에러 기록

```bash
/troubleshooting "pnpm 모노레포 폴더 이동 후 npm install 실패"
```

→ 생성 파일: `troubleshooting/pnpm-monorepo-path-after-move.md`

### Example 3: 인자 없이 자동 감지

```bash
/troubleshooting
```

→ 현재 세션 대화에서 가장 최근 오류 자동 감지 후 기록

## Handoffs

이 스킬 실행 후 제안:

1. **Changelog 업데이트**: 수정 내용이 코드를 포함하는 경우
   ```bash
   /changelog "트러블슈팅 기록 및 [오류명] 수정"
   ```

2. **커밋 생성**: 문서만 추가한 경우
   ```bash
   git add troubleshooting/
   git commit -m "docs: add troubleshooting record for [오류 요약]"
   ```

## Related Skills

- `/changelog`: 세션 변경사항 전체 기록
- `/speckit.implement`: 구현 중 발생한 이슈 기록
