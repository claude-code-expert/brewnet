# Admin Server 재시작 후 wizardState null — lastProject 빈값 Troubleshooting

> 이 문서는 admin-server 재시작 후 `lastProject` 빈값으로 wizardState가 null이 되어 Gitea 401, cloudflare 401, create-app 전체 실패가 발생한 트러블슈팅 히스토리를 기록합니다.

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-19 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Runtime / Configuration |
| **브랜치** | `001-fix-create-app-modal` |
| **재발 여부** | 최초 발생 |
| **재발 주기** | — |

## 문제 요약

`test-cycle.sh --skip-init` 재실행 시 모든 create-app 작업이 ~5초만에 `status=failed`로 종료되고, Phase 9.4 `/api/settings/cloudflare` → 401, `/api/git/repos` → Gitea 401이 동시에 발생했다. `~/.brewnet/config.json`의 `lastProject`가 빈 문자열로 초기화되어 admin-server가 빈 wizardState로 시작한 것이 근본 원인이었다.

## 에러 상세

```
Phase 9.4: /api/settings/cloudflare → HTTP 401 (예상: 200)
Phase 10: create-app tc-lifecycle-test → status=failed (즉시 실패)
Phase 11: 0/16 stacks — all jobs immediately status=failed (~5s)

curl -s "http://localhost/git/api/v1/user" \
  -H "Authorization: token $(cat ~/.brewnet/gitea-token)" → 401 Unauthorized

~/.brewnet/config.json: { "lastProject": "" }
~/.brewnet/projects/ → 존재하지 않음
```

## 근본 원인

`admin-server.ts:898-912`에서 서버 시작 시 `getLastProject()`를 한 번만 호출하고 `wizardState`를 클로저에 고정:

```typescript
// admin-server.ts:898-912
let wizardState: WizardState | null = null;
const last = getLastProject();  // "" → undefined
if (last) {
  const state = loadState(last);
  if (state) wizardState = state;
}
const password = wizardState?.admin?.password ?? '';  // → ''
```

`lastProject`가 빈 값이면 `wizardState = null`, `password = ''`이 된다.

이 상태에서:
1. **`checkAdminAuth()`**: `state?.admin?.password`가 undefined → 즉시 401 반환 (`"Admin password not configured"`)
2. **`resolveContext()` in app-manager.ts**: `loadState(undefined)` → null, `projectPath = process.cwd()`, `secretsPath = <cwd>/secrets/admin_password` → 존재하지 않음 → `giteaPassword = ''` → GiteaClient 401
3. **Gitea token**: `~/.brewnet/gitea-token` 파일 없음 (token 생성은 GiteaClient.prepare()가 담당하는데 인증 실패로 미실행)

**`lastProject`가 비워진 원인**: `~/.brewnet/config.json`은 `conf` 패키지가 관리하는 별도 파일. 이전 세션에서 test-cycle.sh 전체 실행(init 포함) 후 Phase 2(uninstall) 또는 수동 정리 과정에서 `~/.brewnet/projects/` 디렉토리와 wizard state가 삭제되었고, `config.json`의 `lastProject`는 `""` 상태 유지.

## 재현 조건

1. `~/.brewnet/config.json`의 `lastProject` 값이 `""` 또는 존재하지 않음
2. `~/.brewnet/projects/my-homeserver/selections.json` 미존재
3. admin-server 시작 또는 재시작
4. `bash test-cycle.sh --skip-init` 실행
5. → Phase 9.4 401, Phase 10-11 create-app 전체 실패

## 해결 방안

### 1. wizard state 복원

```bash
# selections.json backup에서 복원 (test-cycle.sh가 /tmp/brewnet-test-config.json에 백업)
mkdir -p ~/.brewnet/projects/my-homeserver
cp /tmp/brewnet-test-config.json ~/.brewnet/projects/my-homeserver/selections.json
```

### 2. lastProject 설정

```bash
node -e "
const fs = require('fs'), path = require('path');
const cfgPath = path.join(require('os').homedir(), '.brewnet', 'config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
cfg.lastProject = 'my-homeserver';
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, '\t'));
"
```

### 3. admin-server 재시작

```bash
# 포트 8088의 모든 프로세스 종료 후 재시작
lsof -ti :8088 | xargs kill -9
sleep 2
node packages/cli/dist/index.js admin --foreground --no-open &
```

### 코드 변경

이번 에피소드에서 코드 변경은 없음. 환경 복원으로 해결.

### test-cycle.sh 개선 방향 (예방)

`--skip-init` 사용 시 자동으로 lastProject와 selections.json을 확인하고 복원하는 로직 추가 필요:

```bash
# test-cycle.sh에 추가 (--skip-init 시작 부분)
if [ "$SKIP_INIT" = true ]; then
  LAST_PROJECT=$(node -e "
    const fs=require('fs'),os=require('os'),path=require('path');
    const cfg=path.join(os.homedir(),'.brewnet','config.json');
    try{const d=JSON.parse(fs.readFileSync(cfg,'utf8'));process.stdout.write(d.lastProject||'');}catch{}
  " 2>/dev/null || true)
  if [ -z "$LAST_PROJECT" ] && [ -f "$CONFIG_BACKUP" ]; then
    PROJECT_NAME=$(node -e "
      const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
      process.stdout.write(d.projectName||'');
    " "$CONFIG_BACKUP" 2>/dev/null || true)
    if [ -n "$PROJECT_NAME" ]; then
      mkdir -p "$HOME/.brewnet/projects/$PROJECT_NAME"
      cp "$CONFIG_BACKUP" "$HOME/.brewnet/projects/$PROJECT_NAME/selections.json"
      node -e "
        const fs=require('fs'),os=require('os'),p=require('path');
        const cfg=p.join(os.homedir(),'.brewnet','config.json');
        const d=JSON.parse(fs.readFileSync(cfg,'utf8'));
        d.lastProject='$PROJECT_NAME';
        fs.writeFileSync(cfg,JSON.stringify(d,null,'\t'));
      "
      warn "lastProject 없음 → '${PROJECT_NAME}'으로 자동 복원"
    fi
  fi
fi
```

## 예방 방법

- **`test-cycle.sh --skip-init` 사용 전**: `~/.brewnet/config.json`의 `lastProject` 값 확인
- **admin-server 재시작 시**: wizard state가 올바른지 확인 후 시작
- **test-cycle.sh 개선**: `--skip-init` 시작 시 lastProject 자동 검증 및 복원 로직 추가 (위 코드 참조)
- **`/tmp/brewnet-test-config.json` 보존**: 이 파일이 selections.json 복원의 유일한 소스임. test-cycle.sh 초기 실행 시 이 백업이 생성됨

## 관련 참고

- 관련 파일: `packages/cli/src/services/admin-server.ts:898-912` (wizardState 초기화)
- 관련 파일: `packages/cli/src/services/app-manager.ts:357-375` (resolveContext)
- 관련 파일: `packages/cli/src/wizard/state.ts:217-225` (getLastProject)
- 관련 파일: `~/.brewnet/config.json` (lastProject 저장 위치)
- 관련 파일: `~/.brewnet/projects/<name>/selections.json` (wizard state 저장 위치)
- 백업 소스: `/tmp/brewnet-test-config.json`

---
