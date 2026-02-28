# Brewnet Centralized Logging System — Design Document

> **Status**: Planned (not yet implemented)
> **Created**: 2026-02-28
> **Spec**: `specs/` TBD

---

## 1. Problem Statement

Brewnet 홈서버에 로컬/외부에서 접근할 때 발생하는 로그가 4개 소스에 분산되어 있다:

| 소스 | 포맷 | 위치 | 문제 |
|------|------|------|------|
| CLI 작업 로그 | JSONL | `~/.brewnet/logs/brewnet-YYYY-MM-DD.log` | 별도 파일, CLI 전용 |
| 터널 감사 로그 | NDJSON | `~/.brewnet/logs/tunnel.log` | 별도 파일, 터널 전용 |
| Docker 서비스 로그 | text | `<projectPath>/logs/<service>.log` | 시작 시 200줄만 캡처, 정적 |
| Docker Compose 로그 | text | `docker compose logs` 직접 실행 | 실시간만 가능, 검색 불가 |

**추가 문제점:**
- Traefik HTTP 접근 로그 미설정 (누가 언제 어떤 서비스에 접근했는지 기록 없음)
- Docker 로그 로테이션 미설정 (장기 운영 시 디스크 가득 참)
- 통합 조회 불가 (어드민 패널에 로그 뷰어 없음)
- 로그 검색/필터링 기능 없음

---

## 2. Architecture

추가 Docker 컨테이너 없이, 파일 기반 경량 로그 통합 시스템 구축.

```
  CLI JSONL (~/.brewnet/logs/)  ────────┐
  Tunnel NDJSON (~/.brewnet/logs/)  ────┤
  Traefik Access JSON (project/logs/)  ─┤──> Log Aggregator ──> Admin /api/logs
  Docker Container Logs (dockerode)  ───┘                   ──> brewnet logs --all
```

### Design Principles
- **Zero additional containers** — ELK/Loki 같은 무거운 스택 사용하지 않음
- **Docker-native** — Docker json-file 로그 드라이버 + Traefik 내장 access log 활용
- **File-based aggregation** — 읽기 시점에 여러 소스를 병합 (별도 수집 데몬 없음)
- **Bounded storage** — 모든 소스에 로테이션 적용, 디스크 소모 제한

---

## 3. Data Model

### 3.1 UnifiedLogEntry

모든 소스에서 읽은 로그를 통합하는 공통 구조:

```typescript
type LogSource = 'cli' | 'tunnel' | 'access' | 'service';

interface UnifiedLogEntry {
  timestamp: string;           // ISO 8601
  source: LogSource;
  level: 'info' | 'warn' | 'error' | 'debug';
  service?: string;            // 컨테이너/서비스명
  message: string;
  metadata: Record<string, unknown>;
}
```

### 3.2 LogQuery

통합 로그 조회 파라미터:

```typescript
interface LogQuery {
  sources?: LogSource[];       // 소스 필터 (기본: 전체)
  services?: string[];         // 서비스명 필터
  levels?: ('info' | 'warn' | 'error' | 'debug')[];
  since?: string;              // ISO 8601 시작 시간
  until?: string;              // ISO 8601 종료 시간
  limit?: number;              // 최대 항목 수 (기본: 100, 최대: 1000)
  offset?: number;             // 페이지네이션 오프셋
  search?: string;             // 메시지 내 텍스트 검색
}
```

### 3.3 LogQueryResult / LogStats

```typescript
interface LogQueryResult {
  entries: UnifiedLogEntry[];
  total: number;
  hasMore: boolean;
}

interface LogStats {
  total: number;
  bySource: Record<LogSource, number>;
  byLevel: Record<string, number>;
  recentErrors: UnifiedLogEntry[];
  lastUpdated: string;
}
```

---

## 4. Implementation Phases

### Phase 1: Docker 로깅 인프라

**목표**: 모든 컨테이너에 로그 로테이션 설정 + Traefik HTTP 접근 로그 활성화

#### 4.1 Docker 로그 드라이버 설정

`compose-generator.ts` — 모든 서비스에 logging 필드 추가:

```yaml
# 생성되는 docker-compose.yml 예시
services:
  traefik:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        tag: "{{.Name}}"
  gitea:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        tag: "{{.Name}}"
  # ... 모든 서비스 동일
```

→ 컨테이너당 최대 30MB (3 × 10MB), Docker 엔진이 자동 로테이션.

#### 4.2 Traefik HTTP Access Log

Traefik command에 다음 플래그 추가:

```
--accesslog=true
--accesslog.filepath=/logs/access.log
--accesslog.format=json
--accesslog.bufferingsize=100
--accesslog.fields.headers.defaultmode=drop
--accesslog.fields.headers.names.User-Agent=keep
--accesslog.fields.headers.names.X-Forwarded-For=keep
```

Traefik volume에 `./logs:/logs` 바인드 마운트 추가.

출력 예시 (`<projectPath>/logs/access.log`):
```json
{
  "StartUTC": "2026-02-28T10:00:00Z",
  "Duration": 1234567,
  "RouterName": "gitea@docker",
  "ServiceName": "gitea",
  "ClientAddr": "192.168.1.100",
  "RequestHost": "git.example.com",
  "RequestMethod": "GET",
  "RequestPath": "/api/v1/repos",
  "OriginStatus": 200,
  "request_User-Agent": "Mozilla/5.0..."
}
```

#### 4.3 변경 파일

| 파일 | 변경 |
|------|------|
| `packages/cli/src/services/compose-generator.ts` | ComposeLogging 인터페이스, getLoggingConfig(), Traefik access log flags + volume |
| `packages/cli/src/wizard/steps/generate.ts` | `mkdirSync(join(projectPath, 'logs'))` 추가 |

---

### Phase 2: 공유 타입 & 상수

**목표**: 로그 관련 타입과 상수를 shared 패키지에 정의

#### 변경 파일

| 파일 | 변경 |
|------|------|
| `packages/shared/src/types/logging.ts` | NEW — UnifiedLogEntry, LogQuery, LogQueryResult, LogStats |
| `packages/shared/src/utils/constants.ts` | 로깅 상수 추가 |
| `packages/shared/src/index.ts` | export 추가 |

#### 상수

```typescript
export const DOCKER_LOG_MAX_SIZE = '10m';
export const DOCKER_LOG_MAX_FILES = '3';
export const CLI_LOG_RETENTION_DAYS = 30;
export const ACCESS_LOG_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
export const LOG_QUERY_DEFAULT_LIMIT = 100;
export const LOG_QUERY_MAX_LIMIT = 1000;
export const LOG_POLL_INTERVAL_MS = 5000;
```

---

### Phase 3: Log Aggregator 모듈

**목표**: 4개 소스에서 통합 읽기/필터/정렬하는 핵심 모듈

파일: `packages/cli/src/utils/log-aggregator.ts` (NEW)

#### 리더 함수

| 함수 | 소스 | 읽기 방식 | 변환 규칙 |
|------|------|-----------|-----------|
| `readCliLogs()` | `~/.brewnet/logs/brewnet-*.log` | glob + JSONL 파싱 | `source: 'cli'`, level 유지 |
| `readTunnelLogs()` | `~/.brewnet/logs/tunnel.log` | NDJSON 파싱 | `source: 'tunnel'`, error 필드 유무로 level 결정 |
| `readAccessLogs()` | `<projectPath>/logs/access.log` | Traefik JSON 파싱 | `source: 'access'`, status code로 level 결정 |
| `readServiceLogs()` | Docker containers | dockerode API | `source: 'service'`, stderr=error, stdout=info |

**Traefik access log → level 변환:**
- `OriginStatus >= 500` → `error`
- `OriginStatus >= 400` → `warn`
- 나머지 → `info`
- message 형식: `"GET /api/repos → 200"`

**Docker container log 읽기:**
```typescript
const docker = new Dockerode();
const container = docker.getContainer(containerId);
const logs = await container.logs({
  stdout: true, stderr: true,
  timestamps: true,
  tail: options.tail ?? 100,
  since: sinceUnixTimestamp,
});
```

#### 통합 쿼리

```typescript
async function queryLogs(query: LogQuery, projectPath: string): Promise<LogQueryResult> {
  // 1. 요청된 소스별 리더 병렬 실행
  // 2. 결과 배열 flat merge
  // 3. level/service/search 필터 적용
  // 4. timestamp 내림차순 정렬
  // 5. offset + limit 적용
  // 6. { entries, total, hasMore } 반환
}
```

---

### Phase 4: 로그 로테이션

**목표**: 장기 운영 시 디스크 가득 참 방지

파일: `packages/cli/src/utils/log-rotation.ts` (NEW)

| 소스 | 전략 | 한계 | 트리거 시점 |
|------|------|------|------------|
| CLI JSONL | 날짜 기반 삭제 | 30일 | logger 초기화 시 |
| Tunnel log | copytruncate | 50MB, 5개 파일 | aggregator 읽기 시 |
| Access log | copytruncate | 50MB, 5개 파일 | aggregator 읽기 시 |
| Docker logs | json-file driver | 10MB × 3개 | Docker 엔진 자동 |

**copytruncate**: 원본 파일을 복사 후 truncate → Traefik처럼 파일 핸들을 유지하는 프로세스와 호환.

```
access.log → access.log.1 (복사) → access.log (truncate)
access.log.1 → access.log.2 (기존 파일 시프트)
```

---

### Phase 5: Admin Panel 로그 API & UI

**목표**: 어드민 패널에서 로그 조회 가능하게

#### 5.1 API 엔드포인트

`packages/cli/src/services/admin-server.ts`에 추가:

```
GET /api/logs
  Query: source, level, service, since, until, limit, offset, search
  Response: LogQueryResult

GET /api/logs/stats
  Response: LogStats
```

#### 5.2 대시보드 Logs 탭

기존 Services 테이블 위에 탭 바 추가:

```
┌─────────────────────────────────────────────────────┐
│  [Services]  [Logs]                                 │  ← 탭 바
├─────────────────────────────────────────────────────┤
│  Source: [All] [Access] [Docker] [CLI] [Tunnel]     │  ← 소스 필터
│  Level:  ● INFO  ● WARN  ● ERROR                   │  ← 레벨 필터
│  Service: [▾ All services]  🔄 Auto-refresh: ON     │  ← 서비스 드롭다운
├─────────────────────────────────────────────────────┤
│  10:00:01  ACCESS  ■ gitea    GET /api/v1  → 200    │
│  10:00:02  ACCESS  ■ next..   GET /        → 200    │
│  10:00:03  DOCKER  ■ redis    Ready to accept conn  │
│  10:00:05  CLI     ■         [init] wizard started   │
│  10:00:07  ACCESS  ■ gitea    POST /login  → 302    │
└─────────────────────────────────────────────────────┘
```

- 5초 간격 `/api/logs` 폴링 (auto-refresh 토글)
- 레벨 컬러: info=#3fb950(green), warn=#e3b341(yellow), error=#f85149(red)
- 터미널 스타일 모노스페이스 출력

---

### Phase 6: CLI 명령어 확장

**목표**: `brewnet logs` 명령어에 통합 로그 조회 기능 추가

`packages/cli/src/commands/logs.ts` 수정:

```bash
# 기존 동작 유지 (하위 호환)
brewnet logs [service]           # docker compose logs
brewnet logs -f                  # docker compose logs --follow

# 새 옵션 (log-aggregator 사용)
brewnet logs --all               # 모든 소스 통합 뷰
brewnet logs --source access     # Traefik 접근 로그만
brewnet logs --source cli        # CLI 작업 로그만
brewnet logs --source tunnel     # 터널 감사 로그만
brewnet logs --level error       # 에러만 필터
brewnet logs --since 1h          # 시간 범위 (1h, 30m, 1d, ISO 날짜)
brewnet logs --json              # JSON 출력 (스크립팅용)
```

`--all` 또는 `--source` 지정 시 `log-aggregator` 모듈 사용, 그 외에는 기존 `docker compose logs` 유지.

---

## 5. Dependencies Between Phases

```
Phase 1 (Docker 인프라)          ← 독립
Phase 2 (공유 타입)              ← 독립, Phase 1과 병렬 가능
Phase 3 (Log Aggregator)        ← Phase 2 의존
Phase 4 (로테이션)               ← Phase 1 의존 (access log 경로)
Phase 5 (Admin Panel)           ← Phase 3 의존
Phase 6 (CLI 확장)              ← Phase 3 의존, Phase 5와 병렬 가능
```

---

## 6. Storage Budget

홈서버 환경을 고려한 디스크 사용 한계:

| 소스 | 최대 용량 | 비고 |
|------|----------|------|
| Docker 컨테이너 로그 | 30MB × N (서비스 수) | json-file 3×10MB |
| Traefik access log | 250MB | copytruncate 5×50MB |
| CLI JSONL | ~100MB | 30일 보관, 일별 ~3MB |
| Tunnel log | 50MB | copytruncate |
| **총합 (10개 서비스 기준)** | **~700MB** | |

---

## 7. Testing Strategy

| Phase | 테스트 파일 | 주요 검증 |
|-------|-----------|-----------|
| 1 | `tests/unit/cli/services/compose-generator.test.ts` | logging 필드 존재, Traefik access log flags, volume |
| 3 | `tests/unit/cli/utils/log-aggregator.test.ts` (NEW) | 각 리더 파싱, queryLogs 병합/필터/정렬 |
| 4 | `tests/unit/cli/utils/log-rotation.test.ts` (NEW) | copytruncate, 날짜 기반 정리 |
| 5 | `tests/unit/cli/services/admin-server.test.ts` | /api/logs 엔드포인트 응답 |
| 6 | `tests/unit/cli/commands/logs.test.ts` | --all, --source, --level 플래그 동작 |

---

## 8. Future Considerations (Out of Scope)

- **실시간 스트리밍**: WebSocket 기반 실시간 로그 스트림 (현재는 폴링)
- **Loki/Grafana 연동**: Pro 티어에서 Grafana Loki 옵션 제공
- **알림**: 에러율 임계값 초과 시 알림 (Slack, Email)
- **로그 내보내기**: S3/MinIO로 오래된 로그 아카이빙
- **구조화된 로그 검색**: 전문 검색 인덱스 (SQLite FTS5 활용 가능)

---

## 9. References

- Existing CLI logger: `packages/cli/src/utils/logger.ts`
- Existing tunnel logger: `packages/cli/src/utils/tunnel-logger.ts`
- Docker Compose generator: `packages/cli/src/services/compose-generator.ts`
- Admin server: `packages/cli/src/services/admin-server.ts`
- Logs command: `packages/cli/src/commands/logs.ts`
- Generate step: `packages/cli/src/wizard/steps/generate.ts`
- [Traefik Access Log docs](https://doc.traefik.io/traefik/observability/access-logs/)
- [Docker json-file logging driver](https://docs.docker.com/config/containers/logging/json-file/)
