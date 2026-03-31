# Brewnet 개발 명령어

## 빌드

```bash
# 전체 빌드 (루트에서)
cd ~/Claude-Code-Expert/brewnet
pnpm build

# CLI만 빌드
pnpm --filter @brewnet/cli build
```

---

## 글로벌 설치 / 재설치

```bash
# 빌드 후 글로벌 링크 (소스 변경 반영)
cd ~/Claude-Code-Expert/brewnet
pnpm build
pnpm install -g packages/cli

# 또는
npm install -g packages/cli
```

---

## 어드민 서버 소스 변경 반영

```bash
# 1. 빌드
pnpm --filter @brewnet/cli build

# 2. 실행 중인 어드민 서버 종료 (실제 프로세스명: node .../index.js admin)
pkill -f "index.js admin"
# 포트로 직접 종료하는 방법
# kill $(lsof -ti :8088)

# 3. 재시작
brewnet admin
```

---

## 언인스톨 (서비스 제거)

```bash
# 설치된 서비스 제거
brewnet uninstall

# 글로벌 CLI 제거
pnpm remove -g brewnet
```

---

## 설치 (init)

```bash
brewnet init
```

---

## 재부팅 시 활성화 방법

```bash
# 방법 1: 수동 단일 명령어 (docker compose up -d + admin 서버 통합)
brewnet start

# 방법 2: OS 서비스 자동 시작 등록 (최초 1회)
brewnet service install

# 등록 상태 확인
brewnet service status

# 등록 해제
brewnet service uninstall
```

---

## 자주 쓰는 조합

```bash
# 소스 수정 → 테스트까지 한번에
pnpm build && pkill -f "index.js admin"; brewnet admin

# 클린 빌드
pnpm clean && pnpm build
```
