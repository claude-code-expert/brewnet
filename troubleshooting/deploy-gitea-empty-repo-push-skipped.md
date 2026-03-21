# Deploy Gitea Empty Repo Push Skipped Troubleshooting

> Deploy 실행 시 Gitea 저장소가 존재하지만 empty 상태일 때 push가 생략되는 문제

---

## 최초 발생 — 2026-03-19

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-19 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Git / Runtime |
| **브랜치** | 001-fix-create-app-modal |
| **재발 여부** | 최초 발생 |

## 문제 요약

`deployApp()` 실행 시 Gitea 저장소가 존재하지만 empty인 경우 코드가 push되지 않았다. `_runDeploy`의 분기 로직이 "저장소 없음" 케이스만 push 처리하고, "저장소는 있지만 비어 있는" 케이스를 처리하지 않았다. 추가로 보일러플레이트가 `--depth 1` shallow clone으로 받아져 있어 empty 저장소에 push 시 "shallow update not allowed" 에러가 발생했다.

## 에러 상세

```
# git push 직접 시도
$ git push brewnet HEAD:main --force
To http://localhost/git/admin/nodejs-nestjs.git
 ! [remote rejected] HEAD -> main (shallow update not allowed)
error: 레퍼런스를 'http://localhost/git/admin/nodejs-nestjs.git'에 푸시하는데 실패했습니다

# Gitea API 응답
{ "empty": true, "size": 22, "default_branch": "main" }

# admin-server 로그
[pull] git pull failed (non-critical): ...  ← push 시도 안 함
```

## 근본 원인

### 1. `_runDeploy` 분기 로직 누락

```typescript
// app-manager.ts — 수정 전
if (!repoExists) {
  // create repo + push ← 이 경우만 push
} else if (!existsSync(app.appDir)) {
  // re-clone from Gitea
} else {
  await execa('git', ['pull', 'brewnet', ...])  // ← empty repo면 pull 실패, push 안 함
}
```

Gitea 저장소가 생성은 됐지만 push 전에 중단된 경우(앱 생성 도중 오류, Gitea DB 재초기화 등)가 처리되지 않음.

### 2. shallow clone 문제

boilerplate 스택은 `git clone --depth 1`으로 받아지므로 shallow repository다. Gitea는 empty 저장소에 shallow push를 거부한다.

```
git rev-parse --is-shallow-repository
→ true
```

## 재현 조건

1. 앱 생성 중 Gitea DB 재초기화 또는 기타 이유로 저장소는 생성됐지만 코드는 push 안 된 상태
2. admin UI에서 "Deploy" 클릭
3. `repoExists` → true (저장소 있음), `appDir` → exists (로컬 코드 있음)
4. `git pull` 시도 → empty 저장소라 실패 (non-critical로 무시)
5. docker compose up만 실행 → Gitea에는 여전히 코드 없음

## 해결 방안

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/gitea-client.ts` | `repoIsEmpty(name)` 메서드 추가 — Gitea API의 `empty` 필드 확인 |
| `packages/cli/src/services/app-manager.ts` | `_runDeploy`에 empty repo 분기 추가 — shallow 감지 후 unshallow, 이후 force push |

```typescript
// gitea-client.ts — 추가
async repoIsEmpty(name: string): Promise<boolean> {
  const res = await fetch(`${baseUrl}/api/v1/repos/${username}/${name}`, ...);
  if (res.status !== 200) return false;
  const data = await res.json() as { empty?: boolean };
  return data.empty === true;
}

// app-manager.ts — _runDeploy 추가 분기
} else if (await gitea.repoIsEmpty(appName)) {
  appendLog(job, '[pull] Gitea repo is empty — pushing local code');
  // remote 설정
  await execa('git', ['remote', 'add', 'brewnet', authedUrl], ...).catch(() =>
    execa('git', ['remote', 'set-url', 'brewnet', authedUrl], ...),
  );
  // shallow clone이면 unshallow
  const isShallow = await execa('git', ['rev-parse', '--is-shallow-repository'], ...)
    .then((r) => r.stdout.trim() === 'true').catch(() => false);
  if (isShallow) {
    await execa('git', ['fetch', '--unshallow', 'origin'], ...).catch(async () => {
      const { reinitGit } = await import('./boilerplate-manager.js');
      await reinitGit(app.appDir);
    });
  }
  await execa('git', ['push', 'brewnet', 'HEAD:main', '--force'], ...);
}
```

## 예방 방법

- Gitea DB 초기화(재설치, 마이그레이션 등) 후에는 모든 앱을 re-deploy해야 Gitea에 코드가 복원됨
- 보일러플레이트 앱 생성 흐름에서 push 실패 시 에러를 non-critical로 처리하지 말 것 — 최소한 경고 표시
- `repoExists` 체크만으로는 충분하지 않음 — `repoIsEmpty` 체크도 함께 필요

## 관련 참고

- 관련 파일: `packages/cli/src/services/app-manager.ts`, `packages/cli/src/services/gitea-client.ts`
- 관련 선행 이슈: Gitea DB 손실 후 재초기화 (`admin-server-wizardstate-null-lastproject-empty.md`)
- shallow clone 처리 패턴은 `_createModeA` 함수에도 동일하게 적용되어 있음

---
