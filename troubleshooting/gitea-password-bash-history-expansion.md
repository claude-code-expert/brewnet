# Gitea Password Bash History Expansion Troubleshooting

> bash 대화형 쉘에서 `!@` 등 특수문자 포함 비밀번호 사용 시 history expansion으로 값이 변조되는 문제

---

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-04 |
| **상태** | ✅ 해결됨 (우회 확인, 근본 원인 이해) |
| **에러 타입** | Runtime / Configuration |
| **브랜치** | 001-create-app |
| **재발 여부** | 최초 발생 |

## 문제 요약

`skagml12!@` 비밀번호로 Gitea admin 계정을 생성·변경한 후 웹 UI 로그인이 계속 실패했다. 원인은 bash 대화형 쉘에서 `!@`가 **history expansion**으로 해석되어 실제 저장된 비밀번호가 입력한 값과 달라지기 때문이었다. `execa`(셸 없이 OS exec) 기반의 코드 경로에서는 동일한 문제가 발생하지 않는다.

## 에러 상세

```bash
# 입력한 명령 (이중 따옴표 내 ! 주의)
docker exec -u git brewnet-gitea gitea admin user change-password \
  --username admin --password "skagml12!@"

# bash가 실제로 실행한 것 (history expansion 발생 후):
# !@ → "previous event" 또는 이전 인자로 치환
# 결과: 저장된 비밀번호가 "skagml12" + 이전 커맨드 인자로 변조됨

# 로그인 시도
curl -c cookies.txt -b cookies.txt -X POST http://localhost:3000/user/login \
  --data "user_name=admin&password=skagml12!@&_csrf=..."
# → 로그인 성공처럼 보이지만 기존 세션 쿠키 재사용으로 인한 거짓 양성
```

## 근본 원인

**bash history expansion**: bash 대화형 모드에서 `!` 문자는 history expansion 트리거다:
- `!@` → 가장 최근 명령의 인수로 치환
- `!!` → 이전 전체 명령으로 치환
- `!n` → n번째 history 항목으로 치환

이중 따옴표(`"`) 안에서도 `!`는 history expansion 대상이 된다 (단일 따옴표 `'`에서는 비활성화).

**거짓 양성 curl 결과**: curl에 `-c cookies.txt -b cookies.txt` 옵션을 사용하면 이전 세션의 로그인 쿠키가 재사용되어, 실제로는 인증 실패인데도 성공처럼 보일 수 있다.

## 재현 조건

1. bash 대화형 쉘에서 아래 실행:
   ```bash
   echo "test!@value"   # "value" 부분에서 이전 인자로 치환됨
   ```
2. `!@`를 포함한 비밀번호로 `docker exec ... gitea admin user change-password` 실행
3. 저장된 비밀번호가 입력한 값과 다름
4. 웹 UI에서 동일 비밀번호로 로그인 → "사용자 이름 또는 암호가 올바르지 않습니다"

## 해결 방안

### 방법 1: 단일 따옴표 사용 (bash 직접 실행 시)

```bash
# ✅ 단일 따옴표 — history expansion 비활성화
docker exec -u git brewnet-gitea gitea admin user change-password \
  --username admin --password 'skagml12!@'
```

### 방법 2: execa 사용 (Node.js 코드)

`execa`는 셸 없이 OS의 `execve`를 직접 호출하므로 bash history expansion이 발생하지 않는다:

```typescript
// ✅ execa: 셸 없이 실행 → 특수문자 안전
await execa('docker', [
  'exec', '-u', 'git', 'brewnet-gitea',
  'gitea', 'admin', 'user', 'create',
  '--username', 'admin',
  '--password', 'skagml12!@',   // 특수문자 그대로 전달됨
  '--email', 'admin@brewnet.local',
  '--admin', '--must-change-password', 'false',
]);
```

### 방법 3: 비밀번호에 `!` 미사용

보안상 큰 차이 없이 혼란을 줄이려면 `!` 없는 비밀번호 사용:

```
Brewnet2026   # ← 세션에서 최종 사용된 비밀번호
```

### 방법 4: histexpand 비활성화 (임시)

```bash
set +H   # history expansion 비활성화 (현재 쉘 세션만)
docker exec -u git brewnet-gitea gitea admin user change-password \
  --username admin --password "skagml12!@"
set -H   # 다시 활성화
```

### 코드 변경

이번 세션에서는 `generate.ts`가 이미 `execa` 배열 인자 방식을 사용하므로 코드 변경 없음. 셸 기반 `exec`가 아닌 `execa`를 사용하는 한 비밀번호 특수문자는 안전하다.

## 예방 방법

- CLI 코드에서 외부 명령 실행 시 항상 `execa(cmd, args[])` 배열 형식 사용 (셸 문자열 인자 지양)
- bash 직접 실행 테스트 시 특수문자 포함 비밀번호는 단일 따옴표 사용
- curl 쿠키 파일 재사용 시 로그인 상태를 믿지 말고 실제 새 쿠키로 검증
- 새 쿠키로 깔끔한 검증:
  ```bash
  curl -c /tmp/test.txt -X POST http://localhost:3000/user/login \
    --data "user_name=admin&password=Brewnet2026&_csrf=..."
  ```

## 관련 참고

- 관련 커밋: `8686e95`
- 관련 파일: `packages/cli/src/wizard/steps/generate.ts` (execa 사용 → 안전)
- bash man page: "HISTORY EXPANSION" 섹션 참조
- 관련 이슈: `-u git` 픽스와 함께 발생한 디버깅 세션

---
