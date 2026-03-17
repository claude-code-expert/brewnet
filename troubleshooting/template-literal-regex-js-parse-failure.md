# Template Literal 내 Regex 리터럴 → JS 파싱 실패

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-17 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Build / Runtime |
| **브랜치** | feature/apps-ui |
| **재발 여부** | 최초 발생 |

## 문제 요약

`apps-page.ts`의 TypeScript template literal 안에 `/^https?:\/\/[^/]+/` regex 리터럴을 사용하면 브라우저에서 전체 `<script>` 블록이 파싱 실패하여 /apps 페이지가 완전히 동작하지 않음.

## 에러 상세

```
증상: /apps 페이지 "불러오는 중..." 고정, New App 버튼 미동작
```

## 근본 원인

TypeScript template literal (`` ` ``) 안에서 `\/`는 escape 문자로 소비됨:
- 소스: `/^https?:\/\/[^/]+/`
- 컴파일 후 브라우저 도달: `/^https?://[^/]+/`
- `//` → JavaScript 라인 코멘트로 해석
- 해당 라인 이후 모든 코드가 코멘트로 무시
- `var gitInternalPath = ...` 미정의 → `renderApps()` 실패 → 모든 JS 함수 미정의

## 해결 방법

```typescript
// Before (broken):
var x = app.url.replace(/^https?:\/\/[^/]+/, '');

// After (fixed):
var x = app.url.replace(new RegExp('^https?://[^/]+'), '');
```

## 예방 방법

> **RULE: template literal 안 인라인 JS에서는 regex 리터럴(`/.../`) 절대 사용 금지.**
> 반드시 `new RegExp('...')` 문자열 방식 사용.
> 기존 코드(예: `repoPath` 라인)가 이미 `new RegExp()` 방식을 사용하고 있었음.

## 관련 참고

- 파일: `packages/cli/src/services/apps-page.ts`
- 이전 유사 이슈: CHANGELOG [005-app-deploy-ui] "esbuild Template Literal 호환성"
