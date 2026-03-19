# Boilerplate Compose Array Labels → Object 캐스팅 깨짐

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-17 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Configuration / Docker |
| **브랜치** | feature/apps-ui |
| **재발 여부** | 최초 발생 |

## 문제 요약

`addQuickTunnelAppLabels()`가 boilerplate docker-compose.yml에 Traefik 라벨을 주입할 때, 기존 array 형식 labels를 object로 잘못 캐스팅하여 Docker Compose가 Traefik 라벨을 무시.

## 에러 상세

```yaml
# 보일러플레이트 compose 원본 (array 형식):
labels:
  - "com.brewnet.stack=nodejs-nestjs"
  - "com.brewnet.role=backend"

# yaml.load() 결과: JavaScript Array
# ["com.brewnet.stack=nodejs-nestjs", "com.brewnet.role=backend"]

# (svc['labels'] ?? {}) as Record<string, string> 캐스팅 결과:
# {0: "com.brewnet.stack=nodejs-nestjs", 1: "com.brewnet.role=backend"}

# yaml.dump() 후 docker-compose.yml:
labels:
  "0": com.brewnet.stack=nodejs-nestjs
  "1": com.brewnet.role=backend
  traefik.enable: "true"
  ...

# Docker Compose: 숫자 키 + 문자열 키 혼합 → Traefik 라벨 인식 안 됨
```

## 근본 원인

JavaScript에서 Array를 `Record<string, string>`으로 캐스팅하면 배열 인덱스가 문자열 키가 됨. Docker Compose labels는 array 또는 object 형식만 허용하며, 숫자 키 + 문자열 키 혼합은 미지원.

## 해결 방법

```typescript
// compose-generator.ts addQuickTunnelAppLabels()
let labels: Record<string, string>;
const rawLabels = svc['labels'];
if (Array.isArray(rawLabels)) {
  labels = {};
  for (const l of rawLabels) {
    const s = String(l);
    const idx = s.indexOf('=');
    if (idx > 0) labels[s.slice(0, idx)] = s.slice(idx + 1);
  }
} else {
  labels = (rawLabels ?? {}) as Record<string, string>;
}
```

## 예방 방법

> **RULE: yaml.load() 결과의 labels를 사용할 때 반드시 `Array.isArray()` 체크.**
> 보일러플레이트 compose는 GitHub에서 clone되므로 labels 형식을 제어할 수 없음.
> `addExternalLabels()` (Host 기반)도 동일한 패턴이므로 향후 동일 수정 필요.

## 관련 참고

- 파일: `packages/cli/src/services/compose-generator.ts` `addQuickTunnelAppLabels()`
- Docker Compose labels 문서: https://docs.docker.com/compose/compose-file/05-services/#labels
