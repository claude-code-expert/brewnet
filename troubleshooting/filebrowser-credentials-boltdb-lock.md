# FileBrowser 초기 계정/비밀번호 적용 불가 (BoltDB 잠금) Troubleshooting

> `brewnet init`에서 설정한 admin 계정/비밀번호가 FileBrowser에 적용되지 않아 로그인이 불가능한 문제를 기록합니다.

---

## 발생 기록 #1 — 2026-03-02

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Docker / Runtime / Configuration |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | 신규 설치 시 (기존 DB 볼륨 재사용 시) |

### 문제 요약

`brewnet init`에서 설정한 `admin` 계정과 비밀번호로 FileBrowser 로그인 시도 시 실패. `admin/admin` 기본값도 불가. 컨테이너 로그를 보면 최초 실행 시 랜덤 비밀번호가 생성되며, 이후 `docker exec`로 비밀번호 변경 시도 시 무한 대기(hang) 발생.

### 에러 상세

```
# docker logs
User 'admin' initialized with randomly generated password: e_U2GqkZE9N9joWW

# docker exec 시도 시 응답 없음 (hang)
$ docker exec brewnet-filebrowser filebrowser users update 1 --password "new-password"
# (무응답, 타임아웃)

# FB_USERNAME / FB_PASSWORD 환경변수 설정해도 동일 실패
# — DB 볼륨 존재 시 환경변수 무시됨
```

### 근본 원인

**원인 1 — BoltDB 독점 잠금 (primary)**

FileBrowser는 내부 데이터베이스로 BoltDB를 사용함. BoltDB는 파일 기반 DB로 **프로세스 하나만 동시에 열기 가능(exclusive lock)**. FileBrowser 컨테이너가 실행 중이면 DB 파일(`/database/filebrowser.db`)에 독점 잠금이 걸림. 이 상태에서 `docker exec filebrowser users update`를 실행하면 동일 DB 오픈 시도 → 잠금 획득 대기 → 영구 hang.

**원인 2 — 환경변수 최초 기동 시에만 적용**

`FB_USERNAME`, `FB_PASSWORD` 환경변수는 DB 파일이 존재하지 않을 때 초기화에만 사용됨. DB 볼륨이 이미 존재하는 경우(재설치, 볼륨 재사용) 환경변수 무시.

**원인 3 — 랜덤 비밀번호 자동 생성**

최신 `filebrowser/filebrowser:latest` 이미지는 최초 기동 시 `admin` 계정을 랜덤 비밀번호로 생성하고 로그에 한 번만 출력. 이후 로그 확인 없이는 비밀번호를 알 수 없음.

### 재현 조건

1. FileBrowser 포함하여 `brewnet init` 실행 (또는 기존 볼륨 있는 재설치)
2. 설정한 비밀번호로 로그인 시도 → 실패
3. `docker exec brewnet-filebrowser filebrowser users update 1 --password "xxx"` → hang

### 해결 방안

컨테이너를 중지하여 BoltDB 잠금을 해제한 뒤, 임시 컨테이너로 DB를 수정하고 재시작하는 방식 적용.

```
[기존 방식 - 실패]
컨테이너 실행 중 → docker exec로 users update → BoltDB 잠금 → hang

[새 방식 - 성공]
1. docker stop brewnet-filebrowser  (잠금 해제)
2. docker run --rm -v <db-volume>:/database filebrowser users update 1 ...  (임시 컨테이너로 DB 수정)
3. docker start brewnet-filebrowser  (재시작)
```

#### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/wizard/steps/generate.ts` | FileBrowser 자격증명 설정을 stop→temp-container→start 패턴으로 변경 |

```typescript
// packages/cli/src/wizard/steps/generate.ts
async function applyFilebrowserCredentials(state: WizardState, execaFn: typeof execa) {
  // 1. DB 볼륨 이름 조회
  const { stdout } = await execaFn('docker', [
    'inspect', 'brewnet-filebrowser',
    '--format', '{{range .Mounts}}{{if eq .Destination "/database"}}{{.Name}}{{end}}{{end}}',
  ]);
  const dbVolume = stdout.trim();

  // 2. 컨테이너 중지 (BoltDB 독점 잠금 해제)
  await execaFn('docker', ['stop', 'brewnet-filebrowser']);

  // 3. 임시 컨테이너로 DB 수정 (잠금 없음)
  await execaFn('docker', [
    'run', '--rm', '-v', `${dbVolume}:/database`,
    'filebrowser/filebrowser:latest',
    '--database', '/database/filebrowser.db',
    'users', 'update', '1',
    '--username', state.admin.username || 'admin',
    '--password', state.admin.password || '',
  ]);

  // 4. 컨테이너 재시작
  await execaFn('docker', ['start', 'brewnet-filebrowser']);
}
```

### 예방 방법

- BoltDB 등 독점 잠금 DB를 사용하는 서비스는 실행 중 `docker exec`로 DB 조작 불가 — 반드시 컨테이너 중지 후 작업
- 서비스 자격증명 설정 로직은 볼륨 재사용 시나리오를 고려해 환경변수 대신 DB 직접 수정 방식으로 구현
- 서비스 초기화 순서: 컨테이너 첫 기동(랜덤 비밀번호 생성) → 중지 → 임시 컨테이너로 비밀번호 교체 → 재시작

### 관련 참고

- 관련 파일: `packages/cli/src/wizard/steps/generate.ts`
- BoltDB 특성: https://github.com/etcd-io/bbolt (exclusive lock on open)
- FileBrowser GitHub issue: FB_PASSWORD env only applies on fresh install

---
