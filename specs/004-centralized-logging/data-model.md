# Data Model: Centralized Logging System

**Feature**: 004-centralized-logging
**Date**: 2026-03-15

## Entities

### UnifiedLogEntry

A normalized log record from any source, used as the universal output format.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| timestamp | string (ISO 8601) | Yes | When the event occurred |
| source | LogSource | Yes | Origin: `'cli'`, `'tunnel'`, `'access'`, `'service'` |
| level | UnifiedLogLevel | Yes | Severity: `'info'`, `'warn'`, `'error'`, `'debug'` |
| service | string | No | Container/service name (e.g., `'traefik'`, `'gitea'`) |
| message | string | Yes | Human-readable log message |
| metadata | Record<string, unknown> | Yes | Arbitrary structured data (defaults to `{}`) |

### LogQuery

Filter and pagination parameters for querying unified logs.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| sources | LogSource[] | No | all 4 sources | Filter by origin |
| services | string[] | No | all services | Filter by service name |
| levels | UnifiedLogLevel[] | No | all levels | Filter by severity |
| since | string (ISO 8601) | No | none | Start of time range |
| until | string (ISO 8601) | No | none | End of time range |
| limit | number | No | 100 | Max entries (capped at 1000) |
| offset | number | No | 0 | Pagination offset |
| search | string | No | none | Text search in message field |

### LogQueryResult

Paginated response from a log query.

| Field | Type | Description |
|-------|------|-------------|
| entries | UnifiedLogEntry[] | Matched log entries, sorted by timestamp descending |
| total | number | Total matching entries (before pagination) |
| hasMore | boolean | Whether more entries exist beyond current page |

### LogStats

Aggregated statistics across all log sources.

| Field | Type | Description |
|-------|------|-------------|
| total | number | Total log entry count |
| bySource | Record<LogSource, number> | Count per source |
| byLevel | Record<string, number> | Count per level |
| recentErrors | UnifiedLogEntry[] | Latest error-level entries (max 10) |
| lastUpdated | string (ISO 8601) | When stats were computed |

### ComposeLogging

Docker Compose logging configuration applied to every service.

| Field | Type | Description |
|-------|------|-------------|
| driver | string | Log driver name (always `'json-file'`) |
| options | Record<string, string> | Driver options: `max-size`, `max-file`, `tag` |

## Type Aliases

| Alias | Values | Description |
|-------|--------|-------------|
| LogSource | `'cli'` \| `'tunnel'` \| `'access'` \| `'service'` | Origin of a log entry |
| UnifiedLogLevel | `'info'` \| `'warn'` \| `'error'` \| `'debug'` | Extends existing LogLevel with 'debug' |

## Source-Specific Transformation Rules

### CLI JSONL → UnifiedLogEntry

| CLI LogEntry field | UnifiedLogEntry field | Transformation |
|-------------------|-----------------------|----------------|
| timestamp | timestamp | Direct copy (already ISO 8601 string) |
| level | level | Direct copy ('info' \| 'warn' \| 'error') |
| command | metadata.command | Moved to metadata |
| message | message | Direct copy |
| metadata | metadata | Merged (spread) |
| — | source | Set to `'cli'` |

### Tunnel NDJSON → UnifiedLogEntry

| TunnelLogEvent field | UnifiedLogEntry field | Transformation |
|---------------------|-----------------------|----------------|
| timestamp | timestamp | Direct copy |
| event | metadata.event | Moved to metadata |
| tunnelMode | metadata.tunnelMode | Moved to metadata |
| tunnelId | metadata.tunnelId | Moved to metadata (if present) |
| tunnelName | metadata.tunnelName | Moved to metadata (if present) |
| domain | service | Used as service name (if present) |
| detail | message | Used as message |
| error | level | Present → `'error'`, absent → `'info'` |
| — | source | Set to `'tunnel'` |

### Traefik Access Log → UnifiedLogEntry

| Traefik JSON field | UnifiedLogEntry field | Transformation |
|-------------------|-----------------------|----------------|
| StartUTC | timestamp | Direct copy |
| OriginStatus | level | >= 500 → `'error'`, >= 400 → `'warn'`, else → `'info'` |
| ServiceName | service | Direct copy |
| RequestMethod + RequestPath + OriginStatus | message | Format: `"GET /api/repos → 200"` |
| RouterName, ClientAddr, Duration, RequestHost, request_User-Agent | metadata | Spread into metadata |
| — | source | Set to `'access'` |

### Docker Container Log → UnifiedLogEntry

| Docker stream field | UnifiedLogEntry field | Transformation |
|--------------------|-----------------------|----------------|
| timestamp | timestamp | From Docker timestamp prefix |
| stream type | level | stdout (type 1) → `'info'`, stderr (type 2) → `'error'` |
| container name | service | Container name (stripped of project prefix) |
| log line content | message | Raw log text |
| — | metadata | `{ containerId }` |
| — | source | Set to `'service'` |

## Relationships

```
LogQuery ──queries──> [Log Aggregator] ──produces──> LogQueryResult
                                                        └── entries: UnifiedLogEntry[]

LogStats ──computed from──> [Log Aggregator]
                               └── reads 4 sources:
                                     ├── CLI JSONL files
                                     ├── Tunnel NDJSON file
                                     ├── Traefik access log
                                     └── Docker container logs (via dockerode)
```

## Constants

| Constant | Value | Usage |
|----------|-------|-------|
| DOCKER_LOG_MAX_SIZE | `'10m'` | max-size for json-file driver |
| DOCKER_LOG_MAX_FILES | `'3'` | max-file for json-file driver |
| CLI_LOG_RETENTION_DAYS | `30` | Days before CLI logs are deleted |
| ACCESS_LOG_MAX_BYTES | `52_428_800` (50MB) | copytruncate threshold |
| LOG_QUERY_DEFAULT_LIMIT | `100` | Default page size |
| LOG_QUERY_MAX_LIMIT | `1000` | Maximum page size |
| LOG_POLL_INTERVAL_MS | `5000` | Admin Panel auto-refresh interval |
