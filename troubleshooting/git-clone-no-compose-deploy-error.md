# Git Clone App Deploy Runs Parent Compose

## Symptom
Git Clone으로 생성한 앱(docker-compose.yml 없음)에 Deploy 클릭 시:
- 홈서버 전체 컨테이너가 재빌드됨 (brewnet-landing, brewnet-gitea 등)
- Health check가 엉뚱한 포트를 폴링
- SSE 로그에 전체 홈서버 로그가 표시됨

## Root Cause
Docker Compose v2는 현재 디렉토리에 compose 파일이 없으면 **부모 디렉토리를 탐색**해서 실행.
앱 디렉토리(`apps/brewnet-web/`)에 docker-compose.yml이 없으면 `my-homeserver/docker-compose.yml`을 찾아서 실행.

## Fix
1. **Git Clone 시**: compose 없으면 Docker 단계 스킵 → status=`stopped`
2. **Deploy 시**: compose 없으면 프로젝트 타입 감지 → Dockerfile + docker-compose.yml 자동 생성
3. **지원 타입**: Next.js, Node.js, Python, Go, Rust, Java/Kotlin, Static HTML (nginx)
4. **감지 불가 시**: 명확한 에러 메시지 (부모 compose 실행 방지)

## Affected Files
- `packages/cli/src/services/app-manager.ts`

## Commits
`81f1a76`, `3e0965b`, `1ba0953`, `dcba552`, `06aef9a`
