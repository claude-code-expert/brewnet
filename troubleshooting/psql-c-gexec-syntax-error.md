# psql -c 플래그와 \gexec 메타커맨드 호환 불가 Troubleshooting

> psql `-c` 플래그로 전달된 SQL 문자열 안에 `\gexec` 클라이언트 메타커맨드를 포함하면 syntax error 발생.

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
