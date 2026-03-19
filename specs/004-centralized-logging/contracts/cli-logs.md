# CLI Contract: brewnet logs

**Feature**: 004-centralized-logging
**Date**: 2026-03-15

## Command Signature

```
brewnet logs [service] [options]
```

## Options

| Flag | Argument | Default | Description |
|------|----------|---------|-------------|
| `-f, --follow` | (none) | off | Follow log output in real time (existing) |
| `-n, --tail <lines>` | number | (all) | Lines from end of logs (existing) |
| `-p, --path <path>` | string | cwd | Project path (existing) |
| `--all` | (none) | off | Show unified logs from all sources (NEW) |
| `--source <type>` | `cli\|tunnel\|access\|service` | (none) | Filter by single source (NEW) |
| `--level <level>` | `info\|warn\|error\|debug` | (none) | Filter by severity (NEW) |
| `--since <duration>` | `Nh\|Nm\|Nd\|ISO date` | (none) | Time range start (NEW) |
| `--json` | (none) | off | Output as JSON lines (NEW) |

## Behavior Rules

1. **Backward compatibility**: When none of `--all`, `--source`, `--level`, `--since` are specified → delegate to `docker compose logs` (existing behavior).

2. **Aggregator path**: When any of `--all`, `--source`, `--level`, `--since` are specified → use Log Aggregator.

3. **`--all` with service argument**: `--all` takes precedence, shows all sources filtered by that service name.

4. **`--json` without aggregator flags**: Only valid with aggregator flags (`--all`, `--source`, etc.). If used alone, show error: `"--json requires --all or --source"`.

5. **`--follow` with aggregator flags**: Not supported. Show error: `"--follow is not supported with --all/--source (use without these flags for real-time streaming)"`.

## Output Formats

### Default (colored table)

```
2026-03-15 10:00:07  ACCESS   gitea       POST /login → 302
2026-03-15 10:00:05  CLI                  [init] Wizard started
2026-03-15 10:00:03  SERVICE  redis       Ready to accept connections
2026-03-15 10:00:01  ACCESS   nextcloud   GET / → 200
2026-03-15 09:58:30  ACCESS   nextcloud   GET /status.php → 500
```

Color scheme:
- Source labels: cli=cyan, tunnel=magenta, access=blue, service=white
- Level: info=green, warn=yellow, error=red

### JSON lines (--json)

```jsonl
{"timestamp":"2026-03-15T10:00:07Z","source":"access","level":"info","service":"gitea","message":"POST /login → 302","metadata":{"routerName":"gitea@docker"}}
{"timestamp":"2026-03-15T10:00:05Z","source":"cli","level":"info","service":null,"message":"Wizard started","metadata":{"command":"init"}}
```

## Duration Shorthand

| Format | Example | Meaning |
|--------|---------|---------|
| `Nh` | `1h`, `24h` | N hours ago |
| `Nm` | `30m`, `5m` | N minutes ago |
| `Nd` | `1d`, `7d` | N days ago |
| ISO 8601 | `2026-03-15` | Specific date/time |

## Error Messages

| Condition | Message |
|-----------|---------|
| Invalid `--source` value | `Invalid source: 'foo'. Valid: cli, tunnel, access, service` |
| Invalid `--level` value | `Invalid level: 'fatal'. Valid: info, warn, error, debug` |
| Invalid `--since` value | `Invalid time format: 'xyz'. Use: 1h, 30m, 1d, or ISO date (2026-03-15)` |
| `--json` without aggregator | `--json requires --all or --source` |
| `--follow` with aggregator | `--follow is not supported with --all/--source` |
