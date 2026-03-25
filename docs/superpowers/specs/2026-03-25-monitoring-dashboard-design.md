# Monitoring Dashboard Design

**Date**: 2026-03-25
**Status**: Approved (v2 — 기존 구현 반영)
**Feature**: Admin UI — 모니터링 대시보드 강화 (히스토리 30분 + 디스크 + SSE + Dashboard 탭 통합)

---

## 현재 구현 상태 (기존)

다음 파일들이 이미 존재하며 부분적으로 동작 중:

| 파일 | 현재 상태 |
|------|----------|
| `pages/Monitor.tsx` | 독립 페이지 (`/monitor` 라우트), CPU/메모리 차트 있음 |
| `hooks/useMetrics.ts` | `usePolling` 기반, 5초 간격, **5분** 히스토리 (클라이언트 메모리) |
| `components/HostSummary.tsx` | CPU/RAM 게이지, **디스크 없음** |
| `components/ContainerChart.tsx` | `CpuChart`, `MemoryChart`, `ContainerTable` Recharts 구현 완료 |
| `recharts` | `package.json`에 이미 설치됨 (`^3.8.0`) |
| `/api/metrics/system` | CPU, RAM, uptime → REST 폴링 |
| `/api/metrics/containers` | 컨테이너별 CPU/메모리/네트워크 → REST 폴링 |

---

## 요구사항 vs 현재 갭

| 요구사항 | 현재 | 갭 |
|---------|------|-----|
| Dashboard "Monitoring" 탭 | 독립 `/monitor` 페이지만 존재 | Dashboard 탭 통합 필요 |
| 30분 히스토리 | 5분 (클라이언트 메모리) | 서버사이드 Ring Buffer 필요 |
| SSE 실시간 스트림 | REST 폴링 (5초) | SSE 마이그레이션 필요 |
| 디스크 사용량 | 없음 | 백엔드 `df` 파싱 + UI 추가 |

---

## 구현 범위 (신규 작업)

### 1. 서버사이드 MetricsCollector (신규)

**새 파일**: `packages/cli/src/services/metrics-collector.ts`

```typescript
interface MetricPoint {
  ts: number;      // Unix ms
  cpu: number;     // 0–100 (%)
  memMb: number;   // MB
}

interface ContainerRing {
  id: string;
  name: string;
  points: MetricPoint[];  // Ring Buffer, max 360 (30분 × 12/min)
}

class MetricsCollector {
  private rings: Map<string, ContainerRing>;
  private latestSystem: SystemSnapshot | null;
  private subscribers: Set<(data: MetricsEvent) => void>;
  private timer: NodeJS.Timeout | null;

  start(): void    // 5초 폴링 시작
  stop(): void     // 타이머 + 구독자 정리
  subscribe(fn): () => void   // SSE 클라이언트 등록/해제
  getHistory(): HistoryPayload  // 초기 로드용 전체 히스토리
}
```

**시스템 스냅샷 (`SystemSnapshot`)**:
```typescript
interface SystemSnapshot {
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsedGb: number;   // 신규
  diskTotalGb: number;  // 신규
}
```

**디스크 수집**: `child_process.exec('df -k /')`
- macOS/Linux 모두 `-k` 플래그로 1KB 블록 통일
- 실패 시: `diskUsedGb: null, diskTotalGb: null` (UI에서 "—" 표시)
- `df` 출력 예시: `Filesystem 1K-blocks Used Available Use% Mounted`

**CPU % 계산** (dockerode `container.stats({stream:false})`):
```
cpuDelta = cpu_usage.total_usage - precpu_usage.total_usage
systemDelta = system_cpu_usage - pre_system_cpu_usage
cpuPercent = (cpuDelta / systemDelta) × numCPUs × 100
```

### 2. `/api/metrics/stream` SSE 엔드포인트 (신규)

`admin-server.ts`에 추가:

```
GET /api/metrics/stream
Content-Type: text/event-stream

# 연결 직후 1회: 30분 전체 히스토리
data: { "type": "history", "host": {...}, "containers": [{ "name": "...", "points": [...] }], "ts": 1742000000000 }

# 이후 5초마다: 최신 포인트만
data: { "type": "snapshot", "host": {...}, "containers": [{ "name": "...", "cpu": 45, "memMb": 1024 }], "ts": 1742000005000 }
```

- 클라이언트 연결 시 즉시 `"type": "history"` 이벤트로 30분치 전송
- 이후 5초마다 `"type": "snapshot"` 이벤트 push
- 클라이언트는 `event.data` 파싱 후 `type` 필드로 분기 처리
- 연결 해제 시 subscriber 자동 제거

> **`/api/metrics/history` REST 엔드포인트 없음**: SSE 초기 연결이 history를 포함하므로 별도 REST 불필요. SSE 지원 불가 환경(일부 프록시)은 현재 범위 밖.

### 3 (구 4). 디스크 메트릭 — `HostSummary.tsx` 업데이트

기존 `SystemMetrics` 타입 **확장** (교체 아님 — `HostSummary`, `ContainerChart`의 기존 필드 참조 유지):
```typescript
// 기존 필드 cpu.usagePercent, memory.usagePercent 등 그대로 유지
interface SystemMetrics {
  cpu: { cores: number; model: string; loadAvg: {...}; usagePercent: number };
  memory: { total: number; used: number; free: number; usagePercent: number };
  uptime: number;
  timestamp: string;
  // 신규 추가:
  disk?: { usedGb: number; totalGb: number; usagePercent: number } | null;
}
```

`HostSummary.tsx`에 Disk GaugeBar 추가:
```tsx
{data.disk && <GaugeBar label="Disk" used={data.disk.usedGb} total={data.disk.totalGb} unit="GB" />}
{!data.disk && <GaugeBar label="Disk" used={0} total={0} unit="GB" placeholder="—" />}
```

### 4 (구 5). `useMetrics.ts` → SSE로 마이그레이션

기존 `usePolling` 기반 → `EventSource` 기반으로 교체:

```typescript
export function useMetrics(apiFetch: ApiFetch, enabled = true) {
  // 1. EventSource('/api/metrics/stream') 연결
  // 2. "history" 이벤트: 30분치 history 일괄 세팅
  // 3. "snapshot" 이벤트: 최신 포인트 append (Ring Buffer 유지)
  // 4. unmount 시 eventSource.close()
  // 5. 연결 실패 시 5초 후 재시도 (최대 3회)
  return { system, containers, history };
}
```

히스토리 크기: `MAX_HISTORY = 360` (30분 × 12/min)

### 6. Dashboard.tsx — "Monitoring" 탭 추가

기존 `Services | Logs` 탭에 `Monitoring` 탭 추가:
```tsx
{activeTab === 'monitoring' && <MonitoringPanel {...} />}
```

**`MonitoringPanel` 컴포넌트**: `Monitor.tsx`의 내용을 탭용 패널로 추출.
- `Monitor.tsx` (독립 페이지)는 유지 (기존 `/monitor` 라우트 보존)
- Dashboard 탭에서도 동일 컴포넌트 사용

---

## SSE 메시지 포맷

> **host 필드**: 기존 `SystemMetrics` 구조 유지 (cpu.usagePercent, memory.usagePercent 등), disk 필드만 추가

**초기 로드** (연결 직후 1회, `type: "history"`):
```json
{
  "type": "history",
  "host": {
    "cpu": { "usagePercent": 23, "cores": 4, "model": "...", "loadAvg": { "1m": 0.5 } },
    "memory": { "usagePercent": 39, "used": 3355443200, "total": 8589934592, "free": 5234491392 },
    "disk": { "usedGb": 120, "totalGb": 500, "usagePercent": 24 },
    "uptime": 86400,
    "timestamp": "2026-03-25T04:00:00Z"
  },
  "containers": [
    { "name": "jellyfin", "points": [{ "ts": 1742000000000, "cpu": 44, "memMb": 1020 }] }
  ],
  "ts": 1742000000000
}
```

**5초마다 업데이트** (`type: "snapshot"`):
```json
{
  "type": "snapshot",
  "host": {
    "cpu": { "usagePercent": 25 },
    "memory": { "usagePercent": 41 },
    "disk": { "usedGb": 120, "totalGb": 500, "usagePercent": 24 },
    "timestamp": "2026-03-25T04:00:05Z"
  },
  "containers": [
    { "name": "jellyfin", "cpu": 45, "memMb": 1024 }
  ],
  "ts": 1742000005000
}
```

---

## 파일별 변경 요약

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `services/metrics-collector.ts` | 신규 | Ring Buffer, Docker stats 수집, `df` 파싱 |
| `services/admin-server.ts` | 수정 | `/api/metrics/stream` SSE 엔드포인트 추가, MetricsCollector start/stop 연결 |
| `hooks/useMetrics.ts` | 수정 | polling → SSE, MAX_HISTORY 5min→30min |
| `components/HostSummary.tsx` | 수정 | Disk GaugeBar 추가 |
| `types.ts` (admin-ui) | 수정 | `SystemMetrics`에 `disk` 필드 추가 |
| `pages/Dashboard.tsx` | 수정 | "Monitoring" 탭 추가, MonitoringPanel 마운트 |
| `components/MonitoringPanel.tsx` | 신규 | Monitor.tsx 내용을 탭용으로 추출한 패널 |

---

## 에러 핸들링

| 상황 | 처리 |
|------|------|
| Docker stats API 실패 | 해당 컨테이너 건너뜀, warn 로그, 나머지 계속 |
| `df` 명령 실패 | `disk: null`, UI "—" 표시, 에러 로그 |
| SSE 연결 끊김 | 프론트 5초 후 재연결, 최대 3회 |
| stopped 컨테이너 | 수집 대상 제외, UI 미표시 |
| macOS `df` 블록 크기 | `-k` 플래그로 1KB 강제 통일 |

---

## 성능

- `container.stats({stream:false})`: 1회성 스냅샷, 5초 간격 → 부하 미미
- Ring Buffer 메모리: 10개 컨테이너 × 360포인트 × ~50 bytes ≈ 180KB
- SSE broadcast: MetricsCollector 1개가 모든 클라이언트에 동일 데이터 전송
- admin-ui 번들: Recharts 이미 설치됨, 추가 크기 없음

---

## 테스트

| 파일 | 커버 항목 |
|------|----------|
| `metrics-collector.test.ts` | CPU% 계산, Ring Buffer 360 제한, stopped 필터, `df` 파싱 (macOS/Linux) |
| `useMetrics.test.ts` | SSE 연결/해제, 재연결 로직, history 병합 |
| `HostSummary.test.tsx` | disk null 처리 ("—" 표시), 정상 렌더링 |

---

## 구현 순서

1. `metrics-collector.ts` — 수집 로직, Ring Buffer, disk 파싱
2. `admin-server.ts` — `/api/metrics/stream` SSE 엔드포인트 + MetricsCollector 시작/종료 연결
3. `useMetrics.ts` — polling → SSE 마이그레이션, MAX_HISTORY 360으로 변경
4. `types.ts` — `SystemMetrics`에 `disk` 필드 추가
5. `HostSummary.tsx` — Disk GaugeBar 추가
6. `MonitoringPanel.tsx` — Monitor.tsx 내용 추출 (탭용 패널)
7. `Dashboard.tsx` — "Monitoring" 탭 추가
8. 테스트 작성
