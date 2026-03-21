# New App Boilerplate Tab Creates Duplicate App + Port Conflict

## Symptom
Wizard에서 보일러플레이트 설치(port 3000) → Apps > New App > Boilerplate 탭에서 같은 스택 선택 →
port 3001로 새 앱 생성 → localhost:3000, :3001 모두 404.

## Root Cause
Boilerplate 탭은 **이미 설치된 보일러플레이트를 다시 생성**하는 불필요한 과정.
wizard가 `.brewnet-boilerplate.json`에 등록하지만 `apps.json`에는 등록하지 않아서,
Apps 페이지에서 보이지 않음 → 사용자가 다시 생성하려고 시도.

## Fix
1. **Boilerplate 탭 제거** — New App 모달 2탭: New Project | Git Clone
2. **자동 등록** — `listApps()`가 `.brewnet-boilerplate.json`을 읽어서 `apps.json`에 없는 항목 자동 추가
3. wizard 보일러플레이트가 Apps 목록에 바로 표시, Deploy 버튼으로 배포

## Affected Files
- `packages/cli/src/services/apps-page.ts`
- `packages/cli/src/services/app-manager.ts`

## Commit
`a0be520`
