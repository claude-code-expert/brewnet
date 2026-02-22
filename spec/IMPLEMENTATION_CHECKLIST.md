# 🛠️ Brewnet UX 개선 구현 체크리스트

> **개발팀을 위한 구체적인 구현 작업 체크리스트**

---

## 📋 문서 정보

| 항목 | 내용 |
|------|------|
| **목적** | MVP 개발 전 UX 개선 항목 구현 검증 |
| **대상** | 개발팀, QA팀 |
| **버전** | 1.0 |
| **상태** | 검토 대기 |

---

# 🔴 [UX-01] 자동 설치 감지 및 최적화

## 목표
사용자가 플랫폼별 최적 설치 방법을 자동으로 받도록 함

## 구현 체크리스트

### 1단계: 플랫폼 감지 스크립트

- [ ] `scripts/install.sh` - 플랫폼 감지 로직 작성
  - [ ] macOS 감지 (Darwin)
  - [ ] Linux 감지 (Ubuntu, Debian, CentOS)
  - [ ] Windows 감지 (WSL, native)
  
- [ ] `scripts/detect-os.sh` 작성
  ```bash
  ✓ uname -s 로 OS 감지
  ✓ uname -m 로 아키텍처 감지 (arm64, x86_64)
  ✓ 패키지 매니저 감지 (brew, apt, yum)
  ```

### 2단계: 설치 방법 선택

- [ ] install.sh에서 자동 추천
  ```bash
  ✓ macOS + Homebrew 설치됨 → brew 추천
  ✓ macOS + Homebrew 없음 → curl 추천
  ✓ Linux → curl 추천
  ✓ Windows WSL → curl 추천
  ```

- [ ] 대체 옵션 제시 (대화형)
  ```bash
  ✓ 선택지 1-3개로 제한
  ✓ 각 선택의 장점 1-2줄 설명
  ✓ 기본값 제시 (Enter)
  ```

### 3단계: Docker 자동 설치 옵션

- [ ] Docker 설치 상태 확인
  ```bash
  ✓ docker --version 실행
  ✓ docker compose version 실행
  ✓ 설치 안 되어 있으면 자동 설치 제안
  ```

- [ ] macOS Docker 자동 설치
  ```bash
  ✓ brew install docker 또는 Docker Desktop 설치
  ✓ 설치 후 검증
  ✓ 재부팅 필요 여부 확인
  ```

- [ ] Linux Docker 자동 설치
  ```bash
  ✓ apt/yum 기반 자동 설치 스크립트
  ✓ Docker daemon 시작
  ✓ sudo 권한 확인 및 설정
  ```

- [ ] Windows WSL2 지원
  ```bash
  ✓ WSL2 감지
  ✓ Docker Desktop WSL2 백엔드 설정 가이드
  ✓ 또는 WSL2 내부 Docker 설치
  ```

### 4단계: 테스트

- [ ] macOS 테스트
  - [ ] Homebrew 있을 때
  - [ ] Homebrew 없을 때
  - [ ] M1/M2 Apple Silicon
  - [ ] Intel Mac

- [ ] Linux 테스트
  - [ ] Ubuntu 20.04, 22.04
  - [ ] Debian 11, 12
  - [ ] CentOS 8, 9

- [ ] Windows 테스트
  - [ ] WSL2
  - [ ] Windows Terminal

## 예상 시간: 3일
## 담당자: CLI Developer

---

# 🔴 [UX-02] Cloudflare/도메인 자동화

## 목표
도메인 등록을 "1클릭"으로 완료

## 구현 체크리스트

### 1단계: Cloudflare OAuth 연동

- [ ] Cloudflare 개발자 계정 생성
  - [ ] https://dash.cloudflare.com 접속
  - [ ] API 토큰 생성
  - [ ] OAuth 앱 등록

- [ ] OAuth 콜백 서버 구현 (`src/tunnel/oauth-server.ts`)
  ```typescript
  ✓ HTTP 서버 (포트 7777)
  ✓ /callback 엔드포인트
  ✓ 인증 코드 처리
  ✓ 타임아웃 설정 (300초)
  ```

- [ ] 자동 브라우저 오픈
  ```typescript
  ✓ 'open' npm 패키지 사용
  ✓ macOS, Linux, Windows 지원
  ✓ 브라우저 오픈 실패 시 URL 출력
  ```

- [ ] 토큰 저장 및 관리
  ```typescript
  ✓ ~/.brewnet/cloudflare-token 저장
  ✓ 토큰 암호화 (bcrypt)
  ✓ 토큰 만료 시간 설정
  ✓ 토큰 새로고침 로직
  ```

### 2단계: DigitalPlat API 연동

- [ ] DigitalPlat API 문서 확인
  - [ ] 도메인 등록 API 엔드포인트
  - [ ] 인증 방식 (API 키)
  - [ ] 레이트 제한

- [ ] 도메인 등록 함수 구현 (`src/tunnel/digitalplat-api.ts`)
  ```typescript
  ✓ 가용성 확인
  ✓ 도메인 등록
  ✓ DNS 레코드 설정
  ✓ 에러 처리
  ```

- [ ] DNS 전파 확인
  ```typescript
  ✓ nslookup 또는 dig 명령
  ✓ 5분 간격 확인
  ✓ 최대 24시간 타임아웃
  ✓ 진행률 표시
  ```

### 3단계: Tunnel 자동 생성

- [ ] Cloudflare API v4 사용
  ```typescript
  ✓ POST /accounts/{accountId}/tunnels (생성)
  ✓ GET /accounts/{accountId}/tunnels (조회)
  ✓ PUT /tunnels/{tunnelId}/config (설정)
  ```

- [ ] Public Hostname 자동 설정
  ```typescript
  ✓ 각 서비스별 라우팅 규칙
  ✓ TLS 설정 (자동 HTTPS)
  ✓ CORS 헤더 설정
  ```

- [ ] Docker Compose 자동 업데이트
  ```typescript
  ✓ cloudflared 서비스 추가
  ✓ TUNNEL_TOKEN 설정
  ✓ .env 파일 업데이트
  ```

### 4단계: 에러 처리

- [ ] 네트워크 에러
  ```typescript
  ✓ 오프라인 감지
  ✓ 재시도 로직
  ✓ 사용자 친화 에러 메시지
  ```

- [ ] Cloudflare API 에러
  ```typescript
  ✓ 계정 없음
  ✓ API 할당량 초과
  ✓ 인증 실패
  ```

- [ ] DigitalPlat API 에러
  ```typescript
  ✓ 도메인 이미 사용 중
  ✓ API 키 만료
  ✓ 서비스 장애
  ```

### 5단계: 통합 테스트

- [ ] 전체 플로우 테스트
  - [ ] `brewnet tunnel setup` 실행
  - [ ] Cloudflare 자동 로그인
  - [ ] 도메인 자동 등록
  - [ ] Tunnel 생성 및 설정
  - [ ] DNS 전파 확인
  - [ ] 외부 접근 테스트

- [ ] 에러 시나리오
  - [ ] Cloudflare 로그인 취소 시
  - [ ] 인터넷 연결 끊김
  - [ ] API 할당량 초과
  - [ ] 도메인 이미 존재

## 예상 시간: 5일
## 담당자: Backend + API Developer

---

# 🔴 [UX-03] 셋업 완료 후 가이드

## 목표
셋업 후 사용자가 각 서비스를 쉽게 시작할 수 있도록 함

## 구현 체크리스트

### 1단계: 대화형 메뉴 UI

- [ ] Inquirer.js 또는 Clack 사용
  ```typescript
  ✓ 선택지 최대 6개
  ✓ 각 선택지 설명 포함
  ✓ 이전 단계 돌아가기 옵션
  ```

- [ ] 서비스 상태 표시
  ```typescript
  ✓ 실행 중인 서비스 목록
  ✓ 포트 번호
  ✓ 상태 표시기 (✓ / ✗)
  ```

### 2단계: 서비스별 가이드 구현

- [ ] Nextcloud 가이드
  ```typescript
  ✓ 초기 로그인 정보 표시
  ✓ 파일 업로드 방법
  ✓ 공유 설정
  ✓ 모바일 앱 설정
  ✓ 브라우저 자동 열기
  ```

- [ ] Jellyfin 가이드
  ```typescript
  ✓ 라이브러리 추가 절차
  ✓ 파일 위치 지정
  ✓ 스캔 방법
  ✓ 스트리밍 테스트
  ✓ 브라우저 자동 열기
  ```

- [ ] FastAPI 가이드
  ```typescript
  ✓ API 문서 (Swagger) 링크
  ✓ 코드 위치 설명
  ✓ Hot-reload 설명
  ✓ 첫 API 작성 예제
  ✓ 데이터베이스 연결 가이드
  ```

- [ ] PostgreSQL/pgAdmin 가이드
  ```typescript
  ✓ 관리자 로그인
  ✓ 초기 비밀번호 변경
  ✓ 테이블 조회
  ✓ 백업 방법
  ```

### 3단계: 자동 브라우저 열기

- [ ] 사용자 동의 요청
  ```typescript
  ✓ "브라우저에서 이 서비스를 열까요?" 질문
  ✓ 기본값: true (자동 열기)
  ✓ 선택지 제공
  ```

- [ ] 브라우저 열기 기능
  ```typescript
  ✓ 'open' npm 패키지
  ✓ localhost URL
  ✓ 로컬 포트 번호
  ✓ 실패 시 URL 출력
  ```

### 4단계: 초기 비밀번호 관리

- [ ] 자동 생성
  ```typescript
  ✓ 안전한 비밀번호 생성 (crypto)
  ✓ 복잡도: 대문자, 소문자, 숫자, 특수문자
  ✓ 최소 12자
  ```

- [ ] 저장 및 표시
  ```typescript
  ✓ .env 파일에 저장
  ✓ 셋업 완료 후 표시
  ✓ 변경 방법 안내
  ```

### 5단계: 명령어 추가

- [ ] `brewnet next-step` 명령
  ```bash
  ✓ 셋업 완료 후 대화형 가이드
  ✓ 언제든 다시 실행 가능
  ✓ 각 서비스별 가이드 제공
  ```

- [ ] `brewnet open <service>` 명령
  ```bash
  ✓ brewnet open nextcloud
  ✓ brewnet open jellyfin
  ✓ brewnet open api-docs
  ✓ brewnet open pgadmin
  ```

- [ ] `brewnet setup <service>` 명령
  ```bash
  ✓ brewnet setup nextcloud (초기 설정 가이드)
  ✓ brewnet setup jellyfin (라이브러리 추가)
  ✓ brewnet setup fastapi (API 개발)
  ```

### 6단계: 문서 작성

- [ ] `QUICK_START.md` 작성
  ```markdown
  ✓ 각 서비스 5분 튜토리얼
  ✓ 스크린샷 포함
  ✓ 초보자 친화적
  ```

- [ ] `SERVICES_GUIDE.md` 작성
  ```markdown
  ✓ 모든 서비스 상세 설명
  ✓ 초기 설정 절차
  ✓ 일반적인 질문 FAQ
  ```

## 예상 시간: 3일
## 담당자: Frontend + Content

---

# 🟡 [UX-04] 프리셋 시스템

## 목표
초보자가 "1개 선택"으로 완료

## 구현 체크리스트

### 1단계: 프리셋 데이터 정의

- [ ] `src/cli/presets.ts` 작성
  ```typescript
  ✓ media (미디어 스트리밍) - 가장 인기
  ✓ development (개발자 스택)
  ✓ home-automation (홈 자동화)
  ✓ privacy-focused (프라이버시)
  ✓ custom (커스텀)
  ```

- [ ] 각 프리셋별 정보
  ```typescript
  ✓ name, description
  ✓ services[]
  ✓ databases[]
  ✓ cache option
  ✓ estimatedResources
  ✓ targetUsers[]
  ✓ popular flag
  ```

### 2단계: UI 개선

- [ ] 프리셋 선택 화면
  ```typescript
  ✓ 최대 5개 옵션 표시
  ✓ 각 옵션에 설명 1줄
  ✓ 가장 인기 프리셋 강조
  ✓ "커스텀" 옵션 포함
  ```

- [ ] 프리셋 선택 후 확인
  ```typescript
  ✓ 포함되는 서비스 표시
  ✓ 예상 리소스 표시
  ✓ 변경 가능 여부 표시
  ```

### 3단계: 프리셋 로드

- [ ] 프리셋 선택 → 서비스 자동 선택
  ```typescript
  ✓ 프리셋 데이터 로드
  ✓ Step 2-5 스킵
  ✓ 리뷰 페이지 직행
  ```

- [ ] 프리셋 커스터마이징 옵션
  ```typescript
  ✓ "이 프리셋 수정하시겠어요?" 질문
  ✓ Step 2부터 다시 시작
  ✓ 기존 선택지 유지
  ```

### 4단계: 프리셋 저장/로드

- [ ] `--preset` 옵션
  ```bash
  ✓ brewnet init --preset media
  ✓ brewnet init --preset development
  ```

- [ ] 커스텀 프리셋 저장
  ```bash
  ✓ brewnet init --export my-preset.json
  ✓ brewnet init --config my-preset.json
  ```

## 예상 시간: 2일
## 담당자: CLI Developer

---

# 🟡 [UX-05] 선택지별 상세 설명

## 목표
각 선택의 의미를 명확히 함

## 구현 체크리스트

### 1단계: 데이터 구조 정의

- [ ] `src/cli/choice-metadata.ts` 작성
  ```typescript
  ✓ 프레임워크별 메타데이터
  ✓ 데이터베이스별 메타데이터
  ✓ 서비스별 메타데이터
  ```

- [ ] 포함할 정보
  ```typescript
  ✓ title, description
  ✓ difficulty (⭐~⭐⭐⭐⭐)
  ✓ features[]
  ✓ memory, cpu, storage
  ✓ community size
  ✓ learnTime
  ✓ changeable (나중에 변경 가능?)
  ✓ warnings[]
  ✓ official docs link
  ```

### 2단계: UI 향상

- [ ] 선택지 표시
  ```typescript
  ✓ 난이도 표시 (⭐)
  ✓ 추천 마크 (✓ 추천)
  ✓ 설명 1-2줄
  ✓ 메모리 요구사항
  ```

- [ ] 선택 후 상세 정보
  ```typescript
  ✓ 특징 목록 (5개)
  ✓ 성능 정보 (메모리, CPU)
  ✓ 학습 시간
  ✓ 커뮤니티 크기
  ✓ 나중에 변경 가능 여부
  ✓ 공식 문서 링크
  ✓ 경고 메시지 (있으면)
  ```

### 3단계: 프레임워크별 메타데이터 작성

- [ ] Python 프레임워크
  ```typescript
  ✓ FastAPI
  ✓ Django
  ✓ Flask
  ```

- [ ] Node.js 프레임워크
  ```typescript
  ✓ Next.js
  ✓ Express
  ✓ NestJS
  ✓ Fastify
  ```

- [ ] Java 프레임워크
  ```typescript
  ✓ Spring Boot
  ✓ Quarkus
  ✓ Micronaut
  ```

- [ ] 기타 프레임워크
  ```typescript
  ✓ Rust (Actix, Axum)
  ✓ Go (Gin, Echo, Fiber)
  ```

### 4단계: 데이터베이스 메타데이터

- [ ] 관계형 DB
  ```typescript
  ✓ PostgreSQL (버전별)
  ✓ MySQL/MariaDB
  ✓ SQLite
  ```

- [ ] NoSQL DB
  ```typescript
  ✓ Redis
  ✓ MongoDB (라이선스 주의)
  ✓ Valkey
  ```

### 5단계: 테스트

- [ ] 메타데이터 정확성
  - [ ] 메모리 정보 실제 측정값과 비교
  - [ ] 지원 기간 공식 문서 확인
  - [ ] 커뮤니티 크기 GitHub star 수와 비교

## 예상 시간: 2일
## 담당자: Content + Backend

---

# 🟡 [UX-06] 리소스 예상치 정확화

## 목표
사용자가 자신의 시스템에서 프로젝트를 실행할 수 있을지 판단

## 구현 체크리스트

### 1단계: 서비스별 리소스 프로파일 측정

- [ ] 메모리 측정 (각 서비스)
  ```bash
  ✓ docker stats로 실제 메모리 측정
  ✓ 3가지 상태별 측정:
    - base: 부팅 직후
    - working: 일반 사용
    - peak: 최대 부하
  ```

- [ ] 스토리지 측정
  ```bash
  ✓ 애플리케이션 크기
  ✓ 로그 일일 증가량
  ✓ 캐시 증가량
  ```

- [ ] CPU 측정
  ```bash
  ✓ 유휴 상태
  ✓ 활성 사용
  ✓ 동시 접속 시
  ```

### 2단계: 리소스 계산기 구현

- [ ] `src/cli/resource-calculator.ts`
  ```typescript
  ✓ 선택된 서비스 입력
  ✓ 총 리소스 계산
  ✓ 시스템 리소스와 비교
  ✓ 경고 메시지 생성
  ✓ 최적화 팁 제시
  ```

- [ ] 계산 함수
  ```typescript
  ✓ calculateTotalMemory()
  ✓ calculateTotalStorage()
  ✓ estimateDailyGrowth()
  ✓ getWarnings()
  ✓ suggestOptimizations()
  ```

### 3단계: 리소스 표시

- [ ] 예상 리소스 테이블
  ```
  부팅 시: XXX MB
  일반 사용: XXX MB
  피크 시간: XXX MB
  
  스토리지:
  애플리케이션: XXX MB
  1개월 예상: XXX GB
  1년 예상: XXX GB
  ```

- [ ] 시각화
  ```
  메모리 사용률:
  [████████░░░░░░░░░░░░] 40%
  
  시스템: 8GB / 예상: 4GB
  ```

### 4단계: 경고 및 최적화 제시

- [ ] 경고 조건
  ```typescript
  ✓ 메모리 > 75% 경고
  ✓ 메모리 > 90% 경고 (심각)
  ✓ 스토리지 > 80% 경고
  ✓ 서비스 > 10개 경고
  ```

- [ ] 최적화 팁
  ```
  • 서비스 X와 Y는 함께 사용하면 메모리 200MB 추가 사용
  • Redis 활성화로 응답 속도 2배 향상
  • 외부 스토리지 사용으로 메인 시스템 부하 50% 감소
  ```

### 5단계: 테스트

- [ ] 리소스 정확성 검증
  - [ ] 실제 환경에서 측정값 비교
  - [ ] 다양한 설정 조합 테스트
  - [ ] 시간대별 변화 모니터링

## 예상 시간: 4일
## 담당자: Backend + Ops

---

# 🟡 [UX-07~09] 난이도/버전/모드 설명

## 목표
모든 선택의 의미를 일관성 있게 설명

## 구현 체크리스트

### 1단계: 난이도 표시

- [ ] 5단계 난이도 정의
  ```
  ⭐     - 초보자 추천
  ⭐⭐   - 초보자 가능
  ⭐⭐⭐ - 중급자
  ⭐⭐⭐⭐ - 고급자
  ⭐⭐⭐⭐⭐ - 전문가만
  ```

- [ ] 모든 선택지에 적용
  ```typescript
  ✓ 프레임워크
  ✓ 데이터베이스
  ✓ 서비스
  ```

### 2단계: 버전 지원 정보

- [ ] 버전별 지원 기간 표시
  ```
  Python 3.12 (2024년)
  • 지원 기간: 2028년까지
  • 성능: ⚡⚡⚡
  • 라이브러리 호환성: 대부분 지원
  
  Python 3.10 (2021년)
  • 지원 기간: 2026년까지
  • 성능: ⚡⚡
  • 라이브러리 호환성: 거의 모두 지원
  ```

- [ ] 현재 최신 버전 강조
  ```typescript
  ✓ 최신 버전 마크
  ✓ 이전 버전 주의 표시
  ✓ EOL (End of Life) 버전 경고
  ```

### 3단계: 개발 모드 vs 프로덕션

- [ ] 명확한 설명
  ```
  개발 모드:
  • Hot-reload: 코드 저장 → 자동 재시작
  • 메모리: +200MB
  • 시작 시간: 10초
  • 권장: 개발 중
  
  프로덕션 모드:
  • 빠른 응답
  • 메모리: 기본값
  • 시작 시간: 5초
  • 권장: 배포 후
  ```

- [ ] 전환 가능 여부 명시
  ```
  ✓ 나중에 docker-compose.dev.yml 편집으로 전환 가능
  ✓ 데이터 손실 없음
  ```

## 예상 시간: 3일
## 담당자: Content

---

# 🟢 [UX-10] Docker 자동 설치

## 구현 체크리스트

- [ ] 설치 스크립트 작성
  ```bash
  ✓ macOS: brew install docker
  ✓ Linux: apt/yum 패키지 설치
  ✓ 설치 후 검증
  ```

- [ ] 사용자 권한 설정
  ```bash
  ✓ sudo 권한 확인
  ✓ docker group에 사용자 추가
  ✓ 로그아웃/로그인 필요 안내
  ```

- [ ] 에러 처리
  ```typescript
  ✓ 설치 실패 시 수동 설치 링크
  ✓ 권한 부족 시 sudo 안내
  ```

## 예상 시간: 3일
## 담당자: DevOps

---

# 📊 구현 일정 및 우선순위

## MVP 이전 (필수) - 2주

```
주차 1:
  Day 1-3: UX-01 자동 설치 감지
  Day 4-5: UX-04 프리셋 시스템

주차 2:
  Day 1-2: UX-05 선택지 설명
  Day 3-5: UX-03 셋업 완료 후 가이드
  
병렬 진행:
  UX-02 Cloudflare 자동화 (별도 팀)
```

## Post-MVP (개선) - 2주

```
주차 3:
  Day 1-4: UX-06 리소스 계산기
  Day 5: UX-07~09 설명 강화

주차 4:
  Day 1-3: UX-10 Docker 자동 설치
  Day 4-5: 통합 테스트 및 버그 수정
```

---

# ✅ 검증 체크리스트

## 개발 전

- [ ] 3명 초보 사용자 사용성 테스트 (프로토타입)
- [ ] 플랫폼별 호환성 확인 (macOS, Linux, Windows)
- [ ] 네트워크 에러 시나리오 검증

## 개발 중

- [ ] 매 기능마다 사용성 테스트
- [ ] 명령어 자동완성 검증
- [ ] 에러 메시지 명확성 확인
- [ ] UI 응답 시간 (<100ms)

## Post-MVP

- [ ] 실제 사용자 피드백 (100명 이상)
- [ ] 완료율 메트릭 추적
- [ ] 중단 지점 분석
- [ ] NPS 조사 (목표: 8/10)

---

# 📈 성공 기준

| 메트릭 | 현재 | 목표 | 검증 방법 |
|--------|------|------|----------|
| **셋업 완료율** | 47% | 72% | 로그 분석 |
| **평균 소요시간** | 70분 | 30분 | 타이머 기록 |
| **Step 7 중단율** | 45% | 15% | 사용자 추적 |
| **사용자 만족도** | - | 8/10 | NPS 조사 |
| **설치 성공율** | - | 95% | 오류 로그 |

---

# 🔄 정기 리뷰

## 주간 리뷰 (월요일)
- [ ] 구현 진도 확인
- [ ] 블로킹 이슈 해결
- [ ] 우선순위 조정

## 기능별 리뷰
- [ ] 각 기능 완료 후 사용성 테스트
- [ ] QA 체크리스트 검증
- [ ] 문서 업데이트

## Post-MVP 리뷰
- [ ] 실제 사용자 피드백 분석
- [ ] 메트릭 대시보드 확인
- [ ] 다음 개선 항목 선정

---

**작성일**: 2026년 2월
**상태**: 검토 대기
**담당자**: 개발팀 리더
**마지막 업데이트**: TBD
