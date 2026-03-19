# gitea_db 생성 실패 Troubleshooting

> gitea_db 사전 생성 과정에서 발생하는 여러 원인(psql 메타커맨드 오류, PostgreSQL 초기화 타이밍 경쟁)을 기록합니다.

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-02 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Runtime / Configuration |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | — |

## 문제 요약

`generate.ts`의 gitea_db 생성 코드가 `docker exec brewnet-postgresql psql -c` 명령에 `\gexec` 메타커맨드를 포함한 SQL을 전달.
`\gexec`는 psql 인터랙티브 세션 또는 `-f` 파일 입력에서만 동작하는 클라이언트 메타커맨드로, `-c` 플래그에서는 무시되지 않고 syntax error를 발생시킴.

## 에러 상세

```
ERROR:  syntax error at or near "\"
LINE 1: ...S (SELECT FROM pg_database WHERE datname = 'gitea_db')\gexec
                                                                 ^
```

## 근본 원인

`\gexec`는 psql이 쿼리 결과의 각 행을 SQL로 실행하는 **클라이언트 메타커맨드**다.
`-c` 플래그로 전달된 문자열은 psql 클라이언트를 거치지 않고 서버에 순수 SQL로 직접 전달되므로, `\gexec`가 백슬래시 그대로 SQL 파서에 노출되어 syntax error가 발생한다.

## 재현 조건

1. `generate.ts`의 gitea_db 생성 로직에 `\gexec`가 포함된 상태
2. `brewnet init` 또는 관련 wizard 실행 → generate 스텝에서 gitea_db 생성 시도
3. PostgreSQL 컨테이너(`brewnet-postgresql`)가 실행 중인 상태

## 해결 방안

`\gexec` 패턴 전체를 `DO $$ BEGIN ... END $$;` PL/pgSQL 익명 블록으로 교체.
`DO $$...$$`는 PostgreSQL 9.0+에서 지원하는 순수 SQL로, `-c` 플래그와 완전 호환되며 `IF NOT EXISTS` 조건 분기도 처리 가능.

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/wizard/steps/generate.ts` L532–537 | `\gexec` 패턴 → `DO $$ BEGIN IF NOT EXISTS ... END $$;` 교체 |

**변경 전:**
```typescript
'-c', `SELECT 'CREATE DATABASE gitea_db OWNER brewnet'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gitea_db')\\gexec`
```

**변경 후:**
```typescript
const dbUser = state.servers.dbServer.dbUser || 'brewnet';
'-c', `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gitea_db') THEN EXECUTE 'CREATE DATABASE gitea_db OWNER ${dbUser}'; END IF; END $$;`
```

### 검증 명령어

```bash
# gitea_db 생성 확인
docker exec brewnet-postgresql psql -U brewnet -d postgres -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gitea_db') THEN EXECUTE 'CREATE DATABASE gitea_db OWNER brewnet'; END IF; END \$\$;"
# → "DO" 출력 시 성공

# 재실행해도 오류 없음 확인
docker exec brewnet-postgresql psql -U brewnet -d postgres -c \
  "SELECT datname FROM pg_database WHERE datname = 'gitea_db';"
# → gitea_db 행이 나와야 함
```

## 예방 방법

- `psql -c`와 함께 사용할 SQL에는 `\gexec`, `\i`, `\copy` 등 백슬래시 메타커맨드 절대 사용 금지
- 조건부 DDL(CREATE IF NOT EXISTS 불가한 경우)은 `DO $$ BEGIN ... END $$;` PL/pgSQL 익명 블록 사용
- psql 메타커맨드가 필요한 경우 `-f` 임시 파일 또는 `-c` 대신 stdin 파이프 사용

## 관련 참고

- 관련 파일: `packages/cli/src/wizard/steps/generate.ts`
- PostgreSQL DO 문서: https://www.postgresql.org/docs/current/sql-do.html

---

---

## 발생 기록 #2 — 2026-03-03 (재발)

### 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-03 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Runtime / Docker |
| **브랜치** | feature/boilerplate |
| **재발 여부** | 재발 (2번째) |
| **재발 주기** | 새 설치 시 간헐적 발생 |

### 문제 요약

`pq: database "gitea_db" does not exist` 에러가 Gitea 컨테이너에서 발생. gitea_db 사전 생성 코드 자체는 올바른 SQL을 사용하지만, Docker PostgreSQL 컨테이너의 초기화 타이밍 경쟁 조건으로 psql 연결이 실패하고 빈 catch로 무시됨.

### 에러 상세

```
# Gitea 컨테이너 로그 (docker logs brewnet-gitea)
pq: database "gitea_db" does not exist
```

### 근본 원인

Docker PostgreSQL 공식 이미지의 초기화 순서:

1. `initdb` 실행 (클러스터 생성)
2. PostgreSQL 임시 기동 → TCP 소켓 열림 ← **`pg_isready` 여기서 0 반환**
3. init 스크립트 실행: POSTGRES_USER 생성, POSTGRES_DB 생성 ← **아직 완료 안 됨**
4. PostgreSQL 정식 기동

기존 코드는 `pg_isready`가 0을 반환하는 즉시 `psql -U brewnet`을 실행하지만, step 3 (유저 생성)이 아직 진행 중이면 `FATAL: role "brewnet" does not exist` 에러가 발생하고 catch에서 무시됨. 결과적으로 gitea_db가 생성되지 않음.

### 해결 방안

`pg_isready` 성공 후 2단계 폴링:
1. `pg_isready` → TCP 리스너 확인
2. `psql SELECT 1` 루프 → 실제 유저 접속 확인 (최대 30초)
→ 유저 준비 후 gitea_db 체크/생성

### 코드 변경

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/wizard/steps/generate.ts` | `pg_isready` 이후 `psql -c 'SELECT 1'` 확인 루프 추가 (최대 30초) |

### 예방 방법

- `pg_isready`는 TCP 소켓 확인만 하므로 init 스크립트 완료 보장 안 됨
- 유저 생성 완료 확인은 반드시 `psql SELECT 1` 또는 실제 쿼리로 검증 필요

---
