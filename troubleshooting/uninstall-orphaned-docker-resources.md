# Uninstall Orphaned Docker Resources Troubleshooting

> `brewnet uninstall` 실행 시 Docker 컨테이너/볼륨/네트워크가 정리되지 않는 두 가지 버그

---

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-04 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Docker / Configuration |
| **브랜치** | 001-create-app |
| **재발 여부** | 최초 발생 |

## 문제 요약

`brewnet uninstall` 실행 후 Docker 컨테이너, 볼륨, 네트워크가 남아있었다. 두 가지 독립적인 버그가 원인이었다: (1) `listInstallations()`가 빈 배열을 반환하면 함수가 조기 반환하여 Docker 정리를 건너뜀, (2) 네트워크 삭제 시 하드코딩된 이름(`brewnet`, `brewnet-internal`)을 사용해 프로젝트 이름이 붙은 실제 네트워크(`my-homeserver_brewnet-internal`)를 놓침.

## 에러 상세

```
# 증상 1: brewnet uninstall 실행 시 아무 출력 없이 종료
$ brewnet uninstall
(no output)

# Docker 리소스 확인 결과 컨테이너/네트워크/볼륨 모두 남아있음
$ docker ps -a --filter name=brewnet
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
...still running...

# 증상 2: 네트워크가 harcoded 이름으로 삭제 시도되어 실패
Error response from daemon: network brewnet not found
```

## 근본 원인

### 버그 1: 조기 반환 (Early Return)

`packages/cli/src/commands/uninstall.ts`에서 `listInstallations()`가 빈 배열을 반환하면 (프로젝트 상태 파일 없음) 즉시 반환 처리:

```typescript
// 기존 코드 (broken)
const installations = listInstallations();
if (installations.length === 0) {
  console.log(chalk.yellow('No installations found.'));
  return;  // ← Docker 정리 없이 종료
}
```

비대화형 환경(Bash 도구 등)에서는 `@inquirer/prompts confirm`이 예외를 던져 중단되고, 그 외에도 상태 파일이 존재하지 않으면 동일하게 조기 반환.

### 버그 2: 하드코딩된 네트워크 이름

`packages/cli/src/services/uninstall-manager.ts`에서 네트워크 삭제 시 정적 이름 사용:

```typescript
// 기존 코드 (broken)
await execa('docker', ['network', 'rm', 'brewnet', 'brewnet-internal']);
```

Docker Compose는 프로젝트 이름을 접두사로 붙인 네트워크를 생성함 (`my-homeserver_brewnet-internal`). 하드코딩된 이름은 이 네트워크를 삭제하지 못함.

## 재현 조건

**버그 1:**
1. `~/.brewnet/projects/` 디렉토리가 없거나 비어있는 상태
2. `brewnet uninstall` 실행
3. → 아무 Docker 정리 없이 종료

**버그 2:**
1. `brewnet init`으로 프로젝트 설치 (이름: `my-homeserver` 등)
2. `brewnet uninstall` 실행
3. → `docker network rm brewnet brewnet-internal` 실행 → "network brewnet not found" 에러
4. → 실제 네트워크 `my-homeserver_brewnet-internal`은 남아있음

## 해결 방안

### 버그 1 수정: 조기 반환 → 고아 리소스 정리

```typescript
// packages/cli/src/commands/uninstall.ts
if (installations.length === 0) {
  // 프로젝트 상태가 없어도 brewnet-* Docker 리소스 정리 시도
  const { execa: execaFn } = await import('execa');

  // 고아 컨테이너 제거
  const psResult = await execaFn('docker', ['ps', '-a', '--filter', 'name=brewnet', '-q'])
    .catch(() => ({ stdout: '' }));
  const containerIds = (psResult as { stdout: string }).stdout.trim().split('\n').filter(Boolean);
  if (containerIds.length > 0) {
    await execaFn('docker', ['rm', '-f', ...containerIds]).catch(() => {});
    console.log(chalk.green(`Removed ${containerIds.length} orphaned container(s).`));
  }

  // 고아 볼륨 제거
  const volResult = await execaFn('docker', ['volume', 'ls', '--filter', 'name=brewnet', '-q'])
    .catch(() => ({ stdout: '' }));
  const volIds = (volResult as { stdout: string }).stdout.trim().split('\n').filter(Boolean);
  if (volIds.length > 0) {
    await execaFn('docker', ['volume', 'rm', ...volIds]).catch(() => {});
    console.log(chalk.green(`Removed ${volIds.length} orphaned volume(s).`));
  }

  // 고아 네트워크 제거
  const netResult = await execaFn('docker', ['network', 'ls', '--filter', 'name=brewnet', '-q'])
    .catch(() => ({ stdout: '' }));
  const netIds = (netResult as { stdout: string }).stdout.trim().split('\n').filter(Boolean);
  if (netIds.length > 0) {
    await execaFn('docker', ['network', 'rm', ...netIds]).catch(() => {});
    console.log(chalk.green(`Removed ${netIds.length} orphaned network(s).`));
  }

  return;
}
```

### 버그 2 수정: 동적 네트워크 ID 조회

```typescript
// packages/cli/src/services/uninstall-manager.ts
// Before (broken)
await execa('docker', ['network', 'rm', 'brewnet', 'brewnet-internal']);

// After (fixed)
const netListResult = await execa(
  'docker', ['network', 'ls', '--filter', 'name=brewnet', '--format', '{{.ID}}'],
  { reject: false }
);
const netIds = netListResult.stdout.trim().split('\n').filter(Boolean);
if (netIds.length > 0) {
  await execa('docker', ['network', 'rm', ...netIds], { reject: false });
  result.removed.push(`Docker networks: ${netIds.length} removed`);
} else {
  result.skipped.push('Docker networks: none found');
}
```

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------||
| `packages/cli/src/commands/uninstall.ts` | 조기 반환 제거, 고아 리소스(컨테이너/볼륨/네트워크) 정리 로직 추가 |
| `packages/cli/src/services/uninstall-manager.ts` | 하드코딩된 `network rm brewnet brewnet-internal` → 동적 `network ls --filter name=brewnet → network rm [ids]` |
| `tests/unit/cli/services/uninstall-manager.test.ts` | `beforeEach` 목 업데이트: `network ls` 호출 시 `'net-aaa\nnet-bbb'` 반환, assertion 수정 |
| `tests/unit/cli/services/uninstall-complete-cleanup.test.ts` | 동일 목 패턴 적용, `network ls --filter` 호출 검증으로 변경 |
| `tests/integration/uninstall.test.ts` | `beforeEach` 스마트 목 적용, `networkLsCall` 검증으로 변경 |

## 예방 방법

- `brewnet uninstall` 의 상태 없는 경로에서도 Docker 정리가 실행되는지 테스트 필수
- Docker Compose 네트워크는 항상 `docker network ls --filter name=brewnet` 으로 동적 조회
- 수동 복구:
  ```bash
  # 고아 컨테이너 제거
  docker ps -a --filter name=brewnet -q | xargs docker rm -f

  # 고아 볼륨 제거
  docker volume ls --filter name=brewnet -q | xargs docker volume rm

  # 고아 네트워크 제거
  docker network ls --filter name=brewnet -q | xargs docker network rm
  ```

## 관련 참고

- 관련 커밋: `8686e95`
- 관련 파일: `packages/cli/src/commands/uninstall.ts`, `packages/cli/src/services/uninstall-manager.ts`
- 관련 이슈: `brewnet uninstall` 비대화형 환경(CI, 배시 도구)에서 프롬프트 예외로 추가 조기 종료 가능

---
