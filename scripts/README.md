# Brewnet Release Scripts

## release.sh — 빌드, 검증, 배포 파이프라인

| 모드 | 명령어 | 동작 |
|------|--------|------|
| **dry-run** (기본) | `bash scripts/release.sh` | 빌드 + 팩 + 검증 + 스모크 테스트 |
| **publish** | `bash scripts/release.sh --publish` | 위 전부 + git tag + push (→ GitHub Actions npm publish) |

---

### Step 1: Pre-flight checks

배포 전 환경을 검증합니다.

- **브랜치 확인**: `main` 브랜치에서 실행 중인지 확인. 다른 브랜치에서 실행하면 실패 처리
- **Working tree 상태**: 커밋되지 않은 변경사항이 있으면 실패 처리. 클린 상태에서만 배포 진행
- **태그 중복 확인**: `v{version}` 태그가 이미 존재하는지 확인. 존재하면 스킵 안내
- **버전 표시**: `packages/cli/package.json`의 `version` 필드를 읽어서 배포 대상 버전 표시

### Step 2: Build all packages

3개 패키지를 의존성 순서대로 빌드합니다.

1. **`@brewnet/shared`** — 공유 타입/스키마 (TypeScript → JavaScript)
2. **`@brewnet/admin-ui`** — React SPA (Vite build → `dist/` 폴더에 HTML/CSS/JS 번들 생성)
3. **`@brewnet/cli`** — CLI 애플리케이션 (tsup ESM 빌드 + admin-ui `dist/`를 `cli/dist/admin-ui/`로 복사)

> admin-ui 번들이 cli/dist 안에 포함되어야 `brewnet serve`로 대시보드를 서빙할 수 있습니다.

### Step 3: Verify bundle contents

빌드 결과물이 올바른지 3가지를 확인합니다.

- **admin-ui 번들**: `cli/dist/admin-ui/index.html`이 존재하는지 확인. 없으면 tsup `onSuccess` 복사 실패
- **bin 엔트리**: `package.json`의 `bin.brewnet` (→ `./dist/index.js`)이 실제로 존재하는지 확인
- **files 필드**: `package.json`의 `files` 배열에 `"dist"`가 포함되어 있는지 확인. 없으면 npm publish 시 dist 폴더 누락

### Step 4: npm pack & tarball verify

실제 npm 패키지 tarball을 생성하고 내용물을 검증합니다.

- **npm pack**: `@brewnet/cli` 디렉토리에서 `.tgz` tarball 생성 (`/tmp/`에 저장)
- **admin-ui 포함 여부**: tarball 내 `admin-ui` 관련 파일이 3개 이상 (index.html, CSS, JS) 존재하는지 확인
- **엔트리 포인트**: tarball 내 `dist/index.js`가 존재하는지 확인
- **총 파일 수/크기**: tarball의 파일 수와 크기를 리포팅 (~50개 파일, ~580KB)

### Step 5: Install & smoke test

tarball을 글로벌 설치하고 실제 동작을 확인합니다.

- **글로벌 설치**: `npm install -g /tmp/brewnet-cli-{version}.tgz`로 tarball에서 직접 설치
- **PATH 확인**: `which brewnet`으로 실행 파일이 PATH에 등록되었는지 확인
- **버전 확인**: `brewnet --version`이 `package.json` 버전과 일치하는지 검증
- **help 확인**: `brewnet --help`가 `Usage:` 텍스트를 포함하는지 확인
- **admin-ui 경로**: 글로벌 설치 경로(`npm root -g`)에서 `admin-ui/index.html`이 접근 가능한지 확인

> 테스트 종료 시 `npm uninstall -g @brewnet/cli`로 자동 정리됩니다 (trap cleanup).

### Step 6: Tag & push (--publish 모드만)

`--publish` 플래그가 있을 때만 실행됩니다.

- **태그 생성**: `git tag v{version}` 생성
- **태그 push**: `git push origin v{version}` → GitHub Actions의 `publish.yml` 워크플로우 자동 트리거
- **GitHub Actions**: tag push 이벤트(`v*`)를 감지하여 `npm publish @brewnet/cli` 실행

> dry-run 모드에서는 이 단계를 건너뛰고 `--publish`로 재실행하라는 안내를 표시합니다.

---

## 배포 후 확인

```bash
# npm에서 최신 버전 확인
npm view @brewnet/cli version

# GitHub Actions 워크플로우 상태 확인
gh run list --limit 1

# 설치 테스트
npm install -g @brewnet/cli@{version}
brewnet --version
```

---

## 기타 스크립트

| 스크립트 | 용도 |
|---------|------|
| `reload-admin.sh` | CLI 빌드 후 admin 데몬 재시작 |
| `test-all-stacks.sh` | 16개 보일러플레이트 스택 E2E 테스트 |
| `test-deploy-cycle.sh` | 보일러플레이트 → Gitea → 배포 → 헬스체크 반복 테스트 |
| `loop-validate-stack.sh` | 20분 주기 cron: 스택 1개씩 순환 검증 |
| `watchdog.sh` | 1분 주기 admin-server 상태 및 프로젝트 파일 감시 |
