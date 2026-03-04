# Gitea DB 인증 실패 — INSTALL_LOCK 누락 Troubleshooting

> 이 문서는 Gitea 데이터베이스 인증 실패 관련 트러블슈팅 히스토리를 기록합니다.

---

# pq: password authentication failed for user 'brewnet'

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-03 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Docker |
| **브랜치** | feature/boilerplate |
| **재발 여부** | 최초 발생 |
| **재발 주기** | — |

## 문제 요약

Gitea 접속 시 "데이터베이스 설정이 올바르지 않습니다: pq: password authentication failed for user 'brewnet'" 오류가 로컬 및 외부 접근 모두에서 발생. PostgreSQL의 `brewnet` 계정 비밀번호와 Gitea가 사용하는 비밀번호가 일치하지 않아 DB 연결 불가.

## 에러 상세

```
데이터베이스 설정이 올바르지 않습니다:
pq: password authentication failed for user "brewnet"

(외부 터널 접근 및 로컬 접근 모두 동일)
```

## 근본 원인

`GITEA__security__INSTALL_LOCK=true`가 설정되지 않아 Gitea 최초 기동 시 웹 설치 마법사(installer)가 실행됨.

### 문제 전파 경로:

1. Gitea 컨테이너 시작 → `INSTALL_LOCK` 미설정 → 웹 설치 마법사 표시
2. 사용자 또는 자동 설정으로 설치 마법사 실행 → 잘못된 DB 자격증명으로 `app.ini` 생성
3. 컨테이너 재시작 후 Gitea는 **env vars보다 `app.ini`를 우선** 읽음
4. `app.ini`의 PASSWD ≠ PostgreSQL의 실제 비밀번호 → `pq: password authentication failed`

### 추가 원인:

- `generate.ts` 섹션 10에서 사용자에게 설치 마법사 진행을 **명시적으로 안내**하고 있었음 (의도치 않게 문제를 악화)
- `GITEA__database__PASSWD__FILE`은 Docker secrets migration 이후 정상 설정되었으나, `app.ini`가 먼저 읽히므로 무력화

## 재현 조건

1. PostgreSQL + Gitea 포함한 brewnet init 실행
2. 서비스 기동 후 Gitea URL(로컬 또는 터널) 접속
3. 웹 설치 마법사가 표시됨 — 어떤 형태로든 제출
4. `docker compose restart` 또는 서버 재시작
5. Gitea에서 DB 인증 실패 에러 발생

## 해결 방안

### 1. GITEA__security__INSTALL_LOCK=true 추가

Gitea env에 INSTALL_LOCK 플래그를 추가하여 웹 설치 마법사 실행을 차단. 이로써 Gitea는 처음부터 `GITEA__database__*` env vars만 사용하여 DB에 연결.

### 2. 설치 마법사 안내 문구 → Admin 계정 자동 생성으로 교체

기존 "마법사에서 아래 값을 입력하세요" 안내 제거. 대신 Gitea 기동 후 `gitea admin user create --admin`을 `docker exec`로 자동 실행하는 로직 추가.

- Gitea 헬스체크: `curl http://localhost:3000/api/healthz` (최대 60s 대기)
- 헬스체크 성공 후: `gitea admin user create --admin --must-change-password false` 실행
- "user already exists" 오류는 재실행 시 무시

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/services/compose-generator.ts` | `getGiteaEnv()`에 `GITEA__security__INSTALL_LOCK: 'true'` 추가 |
| `packages/cli/src/wizard/steps/generate.ts` | 섹션 10: 마법사 안내 제거 → `gitea admin user create` 자동 실행 로직으로 교체 |

### compose-generator.ts 변경 핵심

```typescript
function getGiteaEnv(state: WizardState): Record<string, string> {
  const env: Record<string, string> = {
    USER_UID: '1000',
    USER_GID: '1000',
    // Lock the web installer
    'GITEA__security__INSTALL_LOCK': 'true',
  };
  // ...기존 DB 연결 설정
}
```

### generate.ts 변경 핵심

```typescript
if (state.servers.gitServer.enabled) {
  // 기존: 설치 마법사 안내 메시지 출력
  // 변경: gitea admin user create 자동 실행

  const gitea = ora({ text: '  Gitea: admin 계정 생성 중...' }).start();
  // Gitea 헬스체크 (최대 60s, 첫 시도는 즉시)
  for (let i = 0; i < 12 && !giteaReady; i++) {
    try {
      await execaFn('docker', ['exec', 'brewnet-gitea', 'curl', '-fsSL', 'http://localhost:3000/api/healthz']);
      giteaReady = true;
    } catch {
      if (i < 11) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  // admin user create
  await execaFn('docker', ['exec', 'brewnet-gitea', 'gitea', 'admin', 'user', 'create',
    '--username', adminUser, '--password', adminPass, '--email', adminEmail,
    '--admin', '--must-change-password', 'false',
  ]);
}
```

## 기존 설치 복구 방법

이미 `app.ini`가 잘못된 자격증명으로 생성된 경우:

```bash
# 방법 1: Gitea 볼륨 초기화 (데이터 삭제)
docker compose down
docker volume rm brewnet_gitea_data
docker compose up -d

# 방법 2: app.ini 직접 수정
docker exec -it brewnet-gitea vi /data/gitea/conf/app.ini
# [database] 섹션의 PASSWD 값을 secrets/db_password 파일 내용으로 수정
docker compose restart gitea
```

## 테스트 영향

`generate.test.ts`에서 기존 Gitea 헬스폴링 루프가 `setTimeout` 먼저 실행하는 방식이어서 5s 타임아웃 발생. 해결: **check-first, wait-on-retry** 패턴으로 변경 — mock 성공 시 즉시 응답, 실제 환경에서만 5s 대기.

## 예방 방법

- Gitea처럼 설치 마법사가 있는 서비스는 반드시 **INSTALL_LOCK 또는 동등한 헤드리스 설치 플래그**를 설정
- `app.ini` 기반 서비스는 재시작 시 env vars를 무시한다는 점 주의
- 새로운 서비스 추가 시: 서비스 문서에서 "초기 설정 파일 우선순위" 확인 필수

## 관련 참고

- 관련 파일: `packages/cli/src/services/compose-generator.ts` (getGiteaEnv)
- 관련 파일: `packages/cli/src/wizard/steps/generate.ts` (섹션 10)
- Gitea INSTALL_LOCK 문서: https://docs.gitea.com/administration/config-cheat-sheet#security
- Gitea admin CLI: `gitea admin user create --help`

---
