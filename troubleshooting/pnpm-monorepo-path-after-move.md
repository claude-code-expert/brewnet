# pnpm 모노레포 프로젝트 이동 후 설치 실패 Troubleshooting

> 이 문서는 pnpm 모노레포 프로젝트 폴더 이동 후 발생하는 설치/바이너리 오류 히스토리를 기록합니다.

---

# pnpm 모노레포 프로젝트 이동 후 npm install 실패 + 글로벌 바이너리 구 경로 참조

## 메타데이터

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-01 |
| **상태** | ✅ 해결됨 |
| **에러 타입** | Package / Configuration |
| **브랜치** | feature/traefik |
| **재발 여부** | 최초 발생 |
| **재발 주기** | 프로젝트 폴더 이동 시마다 발생 가능 |

## 문제 요약

pnpm 모노레포 프로젝트를 다른 폴더로 이동(`ai-project/brewnet` → `Claude-Code-Expert/brewnet`)한 후,
`npm install` 실행 시 `Cannot read properties of null (reading 'matches')` 오류가 발생하였고,
`brewnet` 글로벌 CLI 명령 실행 시 이전 경로를 참조하여 `Cannot find module` 오류가 발생하였다.

## 에러 상세

### 에러 1: npm install 실패

```
npm error Cannot read properties of null (reading 'matches')
npm error A complete log of this run can be found in: ~/.npm/_logs/2026-03-01T09_06_33_580Z-debug-0.log

TypeError: Cannot read properties of null (reading 'matches')
    at Link.matches (.../node_modules/@npmcli/arborist/lib/node.js:1117:41)
    at Link.canDedupe (...)
    at PlaceDep.pruneDedupable (...)
```

### 에러 2: brewnet 글로벌 바이너리 구 경로 참조

```
Error: Cannot find module '/Users/codevillain/ai-project/brewnet/packages/cli/dist/index.js'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1383:15)
    ...
Node.js v22.20.0
```

## 근본 원인

**에러 1**: 이 프로젝트는 `pnpm-workspace.yaml`과 `pnpm-lock.yaml`을 가진 pnpm 모노레포인데,
`npm install`을 실행했다. 또한 폴더 이동으로 pnpm의 symlink 기반 `node_modules`가 깨져 있었다.
npm arborist는 깨진 심볼릭 링크를 처리하지 못해 null 참조 오류를 던진다.

**에러 2**: `brewnet` 글로벌 바이너리는 `pnpm link --global`로 등록된 셸 스크립트이며,
스크립트 내부에 이전 절대 경로(`ai-project/brewnet/packages/cli/dist/index.js`)가 하드코딩되어 있다.
폴더 이동 후 이 경로가 유효하지 않아 모듈을 찾지 못한다.

## 재현 조건

1. pnpm 모노레포 프로젝트를 `pnpm link --global`로 글로벌 바이너리 등록
2. 프로젝트 폴더를 다른 경로로 이동 (`mv` 또는 Finder로 이동)
3. `npm install` 또는 등록된 CLI 명령 실행

## 해결 방안

### 에러 1: node_modules 삭제 후 pnpm으로 재설치

기존 모든 `node_modules` 디렉토리를 삭제하고 `pnpm install`로 재설치한다.

```bash
# 모든 node_modules 삭제
rm -rf node_modules packages/shared/node_modules packages/cli/node_modules

# pnpm으로 재설치 (npm 아님)
pnpm install
```

### 에러 2: 글로벌 바이너리 재등록

기존 글로벌 패키지를 제거하고 새 경로에서 재등록한다.

```bash
# 구 경로 바이너리 제거
pnpm remove -g brewnet

# 새 경로에서 글로벌 링크 재등록
cd packages/cli
pnpm link --global
```

## 예방 방법

- 이 프로젝트는 **pnpm 전용 모노레포**이므로 반드시 `pnpm` 명령을 사용한다 (`npm` 사용 금지)
- 프로젝트 폴더 이동 후에는 반드시 위 2단계 해결 절차를 따른다
- `pnpm link --global`은 경로를 하드코딩하므로, 경로 변경 시마다 재등록이 필요하다

## 관련 참고

- 관련 파일: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packages/cli/package.json`
- pnpm 글로벌 바이너리 위치: `~/Library/pnpm/brewnet`

---
