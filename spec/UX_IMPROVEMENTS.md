# 🎨 Brewnet UX 개선사항 & 구현 가이드

> **사용자 워크플로우 분석 기반 UX 개선 항목 및 구현 방안**

---

## 📋 문서 정보

| 항목 | 내용 |
|------|------|
| **작성일** | 2026년 2월 |
| **기반** | brewnet_user_workflow_simulation.md |
| **대상** | 개발팀, 프로덕트 매니저 |
| **상태** | MVP 개발 전 검증 완료 |

---

# 🔴 심각 (필수 구현)

## [UX-01] 설치 옵션 자동 감지

### 문제
```
사용자가 마주친 상황:
  curl -fsSL https://get.brewnet.io/install | bash
  npx brewnet init
  brew install brewnet
  
→ 어느 것을 선택해야 하나? (혼동)
```

### 현상
- 3개 이상의 설치 옵션 제시
- 각 옵션의 장단점 불명확
- 플랫폼별 최적 옵션 제시 없음

### 목표
- 플랫폼 자동 감지 → 추천 옵션 1개 제시
- 대체 옵션은 "고급" 섹션에 숨김

### 구현 방안

#### 1. 설치 스크립트 개선 (`install.sh`)

```bash
#!/bin/bash
# install.sh - 플랫폼별 자동 감지

detect_platform() {
  OS=$(uname -s)
  ARCH=$(uname -m)
  
  case "$OS" in
    Darwin)  # macOS
      if command -v brew &> /dev/null; then
        echo "homebrew"  # Homebrew 설치되어 있음
      else
        echo "curl"      # npm 설치하는 것보다 curl이 낫음
      fi
      ;;
    Linux)
      echo "curl"        # curl이 가장 호환성 좋음
      ;;
    *)
      echo "npm"         # 기본값
      ;;
  esac
}

show_recommendation() {
  local METHOD=$(detect_platform)
  
  case "$METHOD" in
    homebrew)
      cat << 'EOF'
╔════════════════════════════════════════════════════════════════╗
║                   🍺 Brewnet 설치                               ║
╚════════════════════════════════════════════════════════════════╝

✅ 추천: Homebrew (macOS에서 가장 편함)

  $ brew install brewnet

─────────────────────────────────────────────────────────────────
💡 다른 방법으로 설치하시겠어요?

  1. npm 사용
     $ npx brewnet init
     
  2. 또는 URL로 직접
     $ curl -fsSL https://get.brewnet.io/install | bash
     
선택 (1-2, 또는 Enter로 Homebrew 진행): 
EOF
      ;;
    *)
      cat << 'EOF'
╔════════════════════════════════════════════════════════════════╗
║                   🍺 Brewnet 설치                               ║
╚════════════════════════════════════════════════════════════════╝

✅ 추천: 한 줄 설치

  $ curl -fsSL https://get.brewnet.io/install | bash

─────────────────────────────────────────────────────────────────
💡 다른 방법으로 설치하시겠어요?

  1. npm 사용 (Node.js 필요)
     $ npx brewnet init
     
선택 (1, 또는 Enter로 curl 진행): 
EOF
      ;;
  esac
}

show_recommendation
```

#### 2. 코드 구조

```
brewnet-cli/
├── scripts/
│   ├── install.sh              # 플랫폼 감지 & 설치
│   ├── install-macos.sh        # macOS 특화 설치
│   ├── install-linux.sh        # Linux 특화 설치
│   └── detect-docker.sh        # Docker 설치 상태 확인
├── src/
│   └── installer/
│       ├── requirement-checker.ts   # 시스템 요구사항 체크
│       ├── auto-installer.ts        # Docker 자동 설치 시도
│       └── guide-generator.ts       # 수동 설치 가이드
```

#### 3. 검사 로직 개선

```typescript
// src/installer/requirement-checker.ts

class RequirementChecker {
  async check() {
    const results = {
      docker: await this.checkDocker(),
      dockerCompose: await this.checkDockerCompose(),
      git: await this.checkGit(),
      memory: await this.checkMemory(),
      storage: await this.checkStorage(),
    };
    
    // 결과 분석
    const missing = Object.entries(results)
      .filter(([_, status]) => !status.installed)
      .map(([name, _]) => name);
    
    if (missing.length === 0) {
      return { status: 'ok', message: '모든 요구사항 만족' };
    }
    
    // 필수 vs 선택
    const required = ['docker'];
    const optional = ['git'];
    
    if (missing.some(m => required.includes(m))) {
      return {
        status: 'error',
        message: `필수 프로그램 없음: ${missing.join(', ')}`,
        action: 'auto-install',
        installer: await this.getAutoInstaller(missing[0])
      };
    }
    
    if (missing.some(m => optional.includes(m))) {
      return {
        status: 'warning',
        message: `선택 프로그램 없음: ${missing.join(', ')}`,
        action: 'provide-guide',
        guide: await this.getGuide(missing)
      };
    }
  }
  
  private async getAutoInstaller(program: string) {
    // Docker 자동 설치 스크립트 반환
    // macOS: brew install docker
    // Linux: apt-get / yum 스크립트
    // Windows: 링크 제공
  }
}
```

### 예상 영향
- ✅ 설치 실패율 20% 감소
- ✅ 첫 사용자 만족도 ↑30%
- ✅ 설치 시간 3분 → 1분

### 체크리스트
- [ ] 플랫폼 감지 로직 구현
- [ ] 각 플랫폼별 자동 설치 스크립트
- [ ] Docker 자동 설치 테스트 (macOS, Linux, Windows)
- [ ] 에러 메시지 UI 개선

---

## [UX-02] Cloudflare/도메인 설정 자동화

### 문제
```
brewnet tunnel setup 실행 후 사용자가 해야 할 일:

1. Cloudflare 계정 생성 (링크 복사하여 브라우저에서 직접 방문)
2. 이메일 확인 (받은편지함 확인)
3. DigitalPlat에서 도메인 등록 (또 다시 링크 복사)
4. Cloudflare DNS 설정 (수동)

→ 총 20분, 중단율 높음
```

### 현상
- 모든 단계가 수동
- 각 단계마다 링크 복사/붙여넣기
- 사용자가 어느 탭에서 뭘 해야 하는지 혼동

### 목표
- "1클릭" 완료를 목표
- 또는 최소 "3단계 이하"로 단순화
- 각 단계마다 자동 검증

### 구현 방안

#### 1. OAuth 기반 자동 로그인

```typescript
// src/tunnel/cloudflare-auth.ts

class CloudflareAuth {
  async setupWithOAuth() {
    // 1단계: Local callback server 시작 (port 7777)
    const callbackServer = this.startCallbackServer();
    
    // 2단계: 브라우저 자동으로 열기
    const authUrl = 'https://dash.cloudflare.com/oauth_authorize?' +
      new URLSearchParams({
        client_id: CLOUDFLARE_CLIENT_ID,
        redirect_uri: 'http://localhost:7777/callback',
        response_type: 'code',
        scope: 'account:read zone:read'
      });
    
    await open(authUrl); // OS 기본 브라우저에서 자동 열기
    
    // 3단계: Callback 기다리기
    const code = await callbackServer.waitForCallback();
    
    // 4단계: 토큰 교환
    const token = await this.exchangeCodeForToken(code);
    
    // 5단계: 계정 정보 저장
    this.saveToken(token);
    
    return {
      status: 'success',
      message: 'Cloudflare 계정 연동 완료!',
      account: token.account
    };
  }
}
```

#### 2. 도메인 자동 등록 (API 이용)

```typescript
// src/tunnel/domain-auto-register.ts

class DomainAutoRegister {
  async registerFreeeDomain(desiredName: string) {
    // DigitalPlat API를 통한 자동 등록
    
    // 1단계: 가용성 확인
    const available = await this.checkAvailability(
      `${desiredName}.dpdns.org`
    );
    
    if (!available) {
      return {
        status: 'error',
        message: '도메인이 이미 사용 중입니다',
        suggestions: this.generateAlternatives(desiredName)
      };
    }
    
    // 2단계: API로 등록
    const result = await this.digitalPlatAPI.register({
      domain: `${desiredName}.dpdns.org`,
      cloudflareNS: token.nameservers  // 자동으로 Cloudflare NS 설정
    });
    
    // 3단계: DNS 전파 대기 및 확인
    const propagated = await this.waitForDNSPropagation(
      `${desiredName}.dpdns.org`,
      300000  // 5분 타임아웃
    );
    
    return {
      status: 'success',
      domain: result.domain,
      propagated: propagated,
      timeToLive: propagated ? '수 분' : '최대 24시간'
    };
  }
  
  async waitForDNSPropagation(domain: string, timeout: number) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const ns = await this.checkDNS(domain);
      if (ns && ns.includes('cloudflare')) {
        return true;
      }
      await sleep(5000); // 5초마다 확인
    }
    
    return false; // 타임아웃
  }
}
```

#### 3. 자동 Tunnel 생성

```typescript
// src/tunnel/tunnel-auto-setup.ts

class TunnelAutoSetup {
  async setupTunnel(domain: string) {
    // 1단계: Tunnel 생성 (API)
    const tunnel = await cloudflareAPI.createTunnel({
      name: `brewnet-${Date.now()}`,
      type: 'cfd_tunnel'
    });
    
    // 2단계: 토큰 저장
    this.saveToken(tunnel.token);
    
    // 3단계: cloudflared 컨테이너 자동 설정
    this.updateDockerCompose({
      'cloudflared': {
        environment: {
          TUNNEL_TOKEN: tunnel.token
        }
      }
    });
    
    // 4단계: Public Hostname 자동 설정
    await cloudflareAPI.setPublicHostname({
      tunnel: tunnel.id,
      hostname: domain,
      service: 'http://localhost:80',
      corsHeaders: ['*']
    });
    
    return {
      status: 'success',
      tunnel: tunnel.id,
      domain: domain
    };
  }
}
```

#### 4. 통합 플로우

```bash
# 현재 (20분)
$ brewnet tunnel setup
→ "브라우저를 열어서 계정 만들고..."
→ "DigitalPlat에 가서..."
→ "Cloudflare에서..."

# 개선 후 (2분)
$ brewnet tunnel setup

✓ Cloudflare 자동 로그인 (브라우저 열림)
✓ DigitalPlat 도메인 자동 등록
✓ Tunnel 자동 생성 및 설정
✓ 모든 것 완료!

준비 완료!
  도메인: myserver.dpdns.org
  상태: DNS 전파 중... (약 5분)
```

### 예상 영향
- ✅ 설정 시간 20분 → 2분 (10배 단축)
- ✅ 중단율 45% → 15%
- ✅ 사용자 만족도 ↑50%

### 체크리스트
- [ ] Cloudflare OAuth 앱 등록
- [ ] DigitalPlat API 키 발급
- [ ] OAuth 콜백 서버 구현
- [ ] 도메인 자동 등록 API 연동
- [ ] DNS 전파 확인 로직
- [ ] 에러 처리 및 복구 절차

---

## [UX-03] 셋업 완료 후 "다음 단계" 대화형 가이드

### 문제
```
✅ 모든 서비스 시작 완료!

그 다음에?
Q: FastAPI에 코드를 어떻게 올리지?
Q: Nextcloud는 어떻게 사용하지?
Q: 데이터는 어디에 저장되나?
Q: 영화를 어떻게 추가하지?
```

### 현상
- 셋업 후 사용자가 혼동
- 각 서비스의 초기 설정 방법 불명확
- README 파일을 찾아 읽어야 함 (번거로움)

### 목표
- 셋업 직후 대화형 "다음 단계" 제공
- 각 서비스별 초기 설정 자동 제시
- 필요시 웹 관리자 자동으로 열기

### 구현 방안

#### 1. 셋업 완료 후 가이드

```typescript
// src/cli/post-setup-guide.ts

class PostSetupGuide {
  async showNextSteps(config: ProjectConfig) {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  🎉 Brewnet 셋업 완료!                                         ║
╚════════════════════════════════════════════════════════════════╝
    `);
    
    // Step 1: 서비스 목록 표시
    this.showRunningServices(config);
    
    // Step 2: 대화형 다음 단계 선택
    const choice = await this.askNextAction();
    
    switch (choice) {
      case 'quickstart':
        await this.showQuickStart(config);
        break;
      case 'service-setup':
        await this.showServiceSetup(config);
        break;
      case 'file-management':
        await this.showFileManagement(config);
        break;
      case 'development':
        await this.showDevelopmentGuide(config);
        break;
      case 'external-access':
        await this.showExternalAccessGuide(config);
        break;
      case 'security':
        await this.showSecurityGuide(config);
        break;
    }
  }
  
  private showRunningServices(config: ProjectConfig) {
    console.log(`
📊 현재 실행 중인 서비스:

  • Jellyfin (영화 스트리밍)
    → http://localhost:8096
    
  • Nextcloud (파일 동기화)
    → http://localhost:80
    
  • FastAPI (API 개발)
    → http://localhost:8000/docs
    
  • PostgreSQL (데이터베이스)
    → 포트: 5432
    
  • pgAdmin (DB 관리)
    → http://localhost:5050
    `);
  }
  
  private async askNextAction(): Promise<string> {
    return await ask('다음으로 뭘 하시겠어요?', {
      choices: [
        {
          title: '⚡ 빠른 시작 (추천)',
          value: 'quickstart',
          description: '각 서비스를 한번 둘러보기'
        },
        {
          title: '🔧 서비스별 설정',
          value: 'service-setup',
          description: 'Nextcloud, Jellyfin 초기 설정'
        },
        {
          title: '📁 파일 관리',
          value: 'file-management',
          description: '데이터 폴더 구조 이해'
        },
        {
          title: '💻 개발 (API 작성)',
          value: 'development',
          description: 'FastAPI로 코드 작성하기'
        },
        {
          title: '🌐 외부 접근',
          value: 'external-access',
          description: 'Cloudflare Tunnel 설정'
        },
        {
          title: '🔒 보안 설정',
          value: 'security',
          description: '방화벽, 비밀번호 변경 등'
        }
      ]
    });
  }
  
  private async showQuickStart(config: ProjectConfig) {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ⚡ 빠른 시작                                                   ║
╚════════════════════════════════════════════════════════════════╝

1️⃣ Nextcloud에 파일 업로드하기

  브라우저 열기: http://localhost/
  
  로그인 (초기값):
    • 사용자명: admin
    • 비밀번호: ${config.initialPassword.nextcloud}
  
  📁 파일 업로드:
    1. 왼쪽 "+" 버튼 클릭
    2. "파일 업로드" 선택
    3. 원하는 파일 선택

2️⃣ Jellyfin에 영화 추가하기

  브라우저 열기: http://localhost:8096
  
  📺 첫 설정:
    1. 언어: 한국어 선택
    2. "라이브러리 추가" 클릭
    3. 폴더 선택: ~/brewnet/my-homeserver/media/movies
    4. "스캔" 클릭 (1-5분)
  
  💾 영화 파일 추가:
    $ cp /path/to/movie.mkv ~/brewnet/my-homeserver/media/movies/
    # Jellyfin이 자동으로 스캔합니다

3️⃣ FastAPI 문서 확인하기

  브라우저 열기: http://localhost:8000/docs
  
  📖 현재 API:
    • GET  /api/v1/items (모든 항목 조회)
    • POST /api/v1/items (항목 추가)
  
  ✏️ 수정하기:
    파일: apps/fastapi-app/main.py
    저장 후 자동 재시작됨 (hot-reload)

4️⃣ 데이터베이스 관리 (pgAdmin)

  브라우저 열기: http://localhost:5050
  
  로그인 (초기값):
    • 이메일: admin@example.com
    • 비밀번호: admin
  
  💡 팁: 초기 비밀번호는 꼭 변경하세요!
    `);
    
    // 자동으로 브라우저 열기 (사용자 동의 필수)
    const openBrowser = await ask(
      '브라우저에서 Nextcloud를 열까요?',
      { default: true }
    );
    
    if (openBrowser) {
      await open('http://localhost/');
    }
  }
}
```

#### 2. 서비스별 초기 설정 가이드

```typescript
// src/cli/service-setup-guide.ts

const SERVICE_GUIDES = {
  nextcloud: {
    name: 'Nextcloud (파일 동기화)',
    description: '클라우드 스토리지 및 협업 도구',
    steps: [
      {
        title: '초기 설정 완료',
        action: 'open-browser',
        url: 'http://localhost/',
        instructions: `
          1. 사용자명: admin
          2. 비밀번호: [위에서 생성됨]
          3. "설치 완료" 클릭
        `
      },
      {
        title: '외부 스토리지 연결 (선택)',
        instructions: `
          관리자 → 외부 스토리지 → S3
          (대용량 미디어 저장용)
        `
      },
      {
        title: '모바일 앱 설치',
        instructions: `
          iOS: App Store에서 Nextcloud 검색
          Android: Google Play에서 Nextcloud 검색
          
          앱 → 설정:
            주소: https://myserver.dpdns.org (외부 접근 시)
            사용자명: admin
            비밀번호: [위의 비밀번호]
        `
      }
    ]
  },
  
  jellyfin: {
    name: 'Jellyfin (영화 스트리밍)',
    description: '개인 미디어 서버',
    steps: [
      {
        title: '라이브러리 추가',
        action: 'open-browser',
        url: 'http://localhost:8096/web/index.html#!/dashboard.html',
        instructions: `
          1. 관리자 → 라이브러리
          2. "추가" 클릭
          3. 타입 선택: 영화, TV, 음악 등
          4. 폴더 경로:
             영화: ~/brewnet/my-homeserver/media/movies
             TV: ~/brewnet/my-homeserver/media/tv
             음악: ~/brewnet/my-homeserver/media/music
          5. "스캔" 클릭
        `
      },
      {
        title: '파일 추가 방법',
        instructions: `
          방법 1: 직접 복사
          $ cp /path/to/movie.mkv ~/brewnet/my-homeserver/media/movies/
          
          방법 2: Nextcloud 경유
          → Nextcloud에 파일 업로드
          → Jellyfin이 자동 감지
        `
      }
    ]
  },
  
  fastapi: {
    name: 'FastAPI (API 개발)',
    description: '백엔드 API 서버',
    steps: [
      {
        title: 'API 문서 확인',
        action: 'open-browser',
        url: 'http://localhost:8000/docs',
        instructions: `
          Swagger UI에서 현재 API를 확인할 수 있습니다.
          각 엔드포인트에서 "Try it out" 클릭하여 테스트 가능
        `
      },
      {
        title: '코드 수정하기',
        instructions: `
          파일: ~/brewnet/my-homeserver/apps/fastapi-app/main.py
          
          수정 후 저장하면 자동으로 재시작됩니다.
          (hot-reload 모드)
          
          예시 - 새 엔드포인트 추가:
          
          @app.get("/api/v1/hello")
          async def hello(name: str = "World"):
              return {"message": f"Hello {name}!"}
        `
      },
      {
        title: '데이터베이스 연결',
        instructions: `
          PostgreSQL 연결 정보:
            host: postgres
            port: 5432
            database: ${config.dbName}
            user: ${config.dbUser}
            password: [.env 파일에서 확인]
          
          ORM 추천: SQLAlchemy + Alembic
        `
      }
    ]
  }
};
```

#### 3. 명령어 통합

```bash
# 새로운 명령어들
$ brewnet next-step          # 셋업 완료 후 대화형 가이드
$ brewnet setup nextcloud    # Nextcloud 초기 설정 안내
$ brewnet setup jellyfin     # Jellyfin 초기 설정 안내
$ brewnet setup fastapi      # FastAPI 개발 가이드
$ brewnet open nextcloud     # 브라우저에서 자동 열기
$ brewnet open pgadmin
$ brewnet open api-docs
```

### 예상 영향
- ✅ 완료율 55% → 80%
- ✅ 사용자 혼동 감소 60%
- ✅ 평균 완료 시간 70분 → 50분

### 체크리스트
- [ ] 대화형 메뉴 UI 구현 (Inquirer.js 이용)
- [ ] 각 서비스별 가이드 작성
- [ ] 자동 브라우저 열기 기능
- [ ] 초기 비밀번호 자동 생성 및 표시
- [ ] 서비스별 문제 해결 가이드

---

# 🟡 중간 (개선 권장)

## [UX-04] 프리셋 시스템 추가

### 문제
```
Step 2에서 사용자가 마주친 상황:

8개 카테고리 × 4-5개 옵션 = 약 40개 선택지

→ "뭘 고르지?" (선택 마비)
```

### 목표
- 3-4개 인기 조합 프리셋 제공
- 초보자가 1개 선택 → 완료 (5분)
- 고급 사용자는 "커스텀" 옵션으로 세밀한 선택

### 구현 방안

#### 1. 프리셋 정의

```typescript
// src/cli/presets.ts

export const PRESETS = {
  'media': {
    name: '📱 미디어 스트리밍 스택',
    description: '영화, 음악, TV 시리즈 스트리밍',
    services: [
      'jellyfin',      // 영화/TV
      'navidrome',     // 음악
      'nextcloud',     // 파일 관리
      'traefik'        // 리버스 프록시
    ],
    databases: ['postgresql'],
    cache: false,
    estimatedResources: {
      memory: '6-8GB',
      storage: '100GB (+ 미디어)',
      containers: 5
    },
    targetUsers: ['미디어 중심 사용자', 'NAS 업그레이드'],
    popular: true
  },
  
  'development': {
    name: '🛠️ 개발자 스택',
    description: '백엔드 개발 및 로컬 Git 호스팅',
    services: [
      'gitea',         // 로컬 Git
      'portainer',     // Docker 관리
      'uptime-kuma',   // 모니터링
      'traefik'
    ],
    databases: ['postgresql'],
    cache: 'redis',
    appFramework: 'fastapi',  // 기본값
    estimatedResources: {
      memory: '8-12GB',
      storage: '50GB',
      containers: 8
    },
    targetUsers: ['백엔드 개발자', 'DevOps'],
    popular: true
  },
  
  'home-automation': {
    name: '🏠 홈 자동화 스택',
    description: '스마트홈 자동화 및 IoT 통합',
    services: [
      'home-assistant',
      'node-red',
      'mosquitto',
      'uptime-kuma',
      'traefik'
    ],
    databases: false,
    cache: false,
    estimatedResources: {
      memory: '4-6GB',
      storage: '20GB',
      containers: 5
    },
    targetUsers: ['홈 자동화 애호가'],
    popular: false
  },
  
  'privacy-focused': {
    name: '🔒 프라이버시 중심 스택',
    description: '보안 및 프라이버시 강화',
    services: [
      'vaultwarden',   // 비밀번호 관리
      'authelia',      // SSO/2FA
      'adguard-home',  // DNS 광고 차단
      'nextcloud',     // 암호화된 파일
      'traefik'
    ],
    databases: ['postgresql'],
    cache: false,
    estimatedResources: {
      memory: '6-8GB',
      storage: '30GB',
      containers: 6
    },
    targetUsers: ['프라이버시 중심 사용자', '회사 IT'],
    popular: false
  },
  
  'full-stack': {
    name: '🎓 학습용 풀스택',
    description: '모든 기능을 한번에 배우기',
    services: ['모든 서비스 (선택 가능)'],
    databases: ['postgresql', 'redis'],
    cache: true,
    estimatedResources: {
      memory: '32GB (필수!)',
      storage: '200GB',
      containers: 20
    },
    warning: '고사양 시스템 필수 (메모리 32GB)',
    targetUsers: ['기술 학습자', '엔지니어'],
    popular: false
  },
  
  'custom': {
    name: '⚙️ 커스텀 설정',
    description: '원하는 서비스 직접 선택',
    isCustom: true
  }
};
```

#### 2. UI 개선

```typescript
// src/cli/preset-selector.ts

async function selectPreset() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  STEP 2/6: 프로젝트 유형 선택                                  ║
╚════════════════════════════════════════════════════════════════╝
  `);
  
  const presets = [
    {
      title: '📱 미디어 스트리밍 (가장 인기)',
      description: 'Jellyfin, Nextcloud, Navidrome...',
      value: 'media',
      hint: '초보자 추천'
    },
    {
      title: '🛠️ 개발자 스택',
      description: 'Gitea, FastAPI, PostgreSQL...',
      value: 'development',
      hint: '백엔드 개발자'
    },
    {
      title: '🏠 홈 자동화',
      description: 'Home Assistant, Node-RED...',
      value: 'home-automation',
      hint: '스마트홈'
    },
    {
      title: '🔒 프라이버시 중심',
      description: 'Vaultwarden, Authelia, AdGuard...',
      value: 'privacy',
      hint: '보안 중심'
    },
    {
      title: '⚙️ 커스텀 설정',
      description: '원하는 서비스 직접 선택',
      value: 'custom',
      hint: '고급 사용자'
    }
  ];
  
  const selected = await select('프리셋을 선택하세요:', presets);
  
  // 선택된 프리셋 표시
  const preset = PRESETS[selected];
  console.log(`
✅ 선택됨: ${preset.name}

📋 포함되는 서비스:
${preset.services.map(s => `  • ${s}`).join('\n')}

📊 예상 리소스:
  • 메모리: ${preset.estimatedResources.memory}
  • 스토리지: ${preset.estimatedResources.storage}
  • 컨테이너: ${preset.estimatedResources.containers}개

계속하시겠습니까? (Y/n): 
  `);
  
  return selected;
}
```

### 예상 영향
- ✅ 선택 시간 15분 → 2분 (7배 단축)
- ✅ 잘못된 선택 30% 감소
- ✅ 초보자 만족도 ↑40%

### 체크리스트
- [ ] 4-5개 프리셋 정의
- [ ] 각 프리셋별 리소스 검증
- [ ] UI 개선
- [ ] 프리셋 커스터마이징 옵션

---

## [UX-05] 선택지별 상세 설명 강화

### 문제

```
현재:
? 프레임워크를 선택하세요:
  ○ FastAPI
  ○ Django
  ○ Flask

사용자 질문:
  "이게 뭔 차이지?"
  "난 뭘 선택해야 하는데?"
  "나중에 바꿀 수 있나?"
```

### 목표
- 각 옵션에 난이도, 특징, 메모리, 커뮤니티 크기 표시
- 선택 후 영향 설명
- 변경 가능성 명시

### 구현 방안

```typescript
// src/cli/enhanced-choices.ts

interface Choice {
  title: string;
  value: string;
  hint?: string;
  description: string;
  difficulty: '⭐' | '⭐⭐' | '⭐⭐⭐' | '⭐⭐⭐⭐';
  features: string[];
  memory: string;
  community: '매우 큼' | '큼' | '중간' | '작음';
  recommended?: boolean;
  changeable?: boolean;
  learnTime?: string;
}

const FRAMEWORK_CHOICES: Choice[] = [
  {
    title: 'FastAPI ⭐⭐ (추천)',
    value: 'fastapi',
    hint: '최신식, 빠름, 초보자 친화',
    description: 'Python 최신 비동기 프레임워크',
    difficulty: '⭐⭐',
    features: [
      '자동 API 문서 (Swagger)',
      '타입 힌트 지원',
      '비동기 지원',
      '데이터 검증'
    ],
    memory: '300MB - 1GB',
    community: '중간',
    recommended: true,
    changeable: true,
    learnTime: '3-7일'
  },
  
  {
    title: 'Django ⭐⭐⭐ (풀스택)',
    value: 'django',
    hint: '배터리 포함, 학습 곡선 있음',
    description: '완전한 웹 프레임워크 (ORM, 관리자, 인증)',
    difficulty: '⭐⭐⭐',
    features: [
      'ORM (데이터베이스)',
      '자동 관리 패널',
      '인증 & 권한',
      'Form 검증',
      'Caching'
    ],
    memory: '500MB - 2GB',
    community: '매우 큼',
    recommended: false,
    changeable: true,
    learnTime: '1-2주'
  },
  
  {
    title: 'Flask ⭐ (고급)',
    value: 'flask',
    hint: '매우 간단, 선택 자유도 높음',
    description: '경량 마이크로 프레임워크 (~500줄)',
    difficulty: '⭐⭐⭐⭐',
    features: [
      '최소 코드',
      '완전한 커스터마이징',
      '많은 선택지',
      '학습 목적에 좋음'
    ],
    memory: '100MB - 500MB',
    community: '큼',
    recommended: false,
    changeable: true,
    learnTime: '2-3주'
  }
];

// 향상된 선택 UI
async function selectFramework() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  프레임워크 선택                                               ║
╚════════════════════════════════════════════════════════════════╝

💡 팁: 처음이면 FastAPI를 추천합니다!
      (빠르고, 배우기 쉽고, 최신식입니다)
  `);
  
  const choice = await select('프레임워크를 선택하세요:', 
    FRAMEWORK_CHOICES.map(c => ({
      title: c.title,
      description: c.hint,
      value: c.value
    }))
  );
  
  // 선택 후 상세 정보 표시
  const selected = FRAMEWORK_CHOICES.find(c => c.value === choice);
  
  console.log(`
✅ ${selected.title}을(를) 선택하셨습니다!

📝 특징:
${selected.features.map(f => `  • ${f}`).join('\n')}

📊 성능:
  • 메모리 사용량: ${selected.memory}
  • 학습 시간: ${selected.learnTime}
  • 커뮤니티: ${selected.community}

💡 정보:
  • 나중에 변경: ${selected.changeable ? '✅ 가능' : '❌ 어려움'}
    (docker-compose.yml 수정 필요)
  • 라이선스: MIT
  • 공식 문서: https://fastapi.tiangolo.com

계속하시겠습니까? (Y/n): 
  `);
  
  return choice;
}
```

### 예상 영향
- ✅ 잘못된 선택 20% 감소
- ✅ 사용자 신뢰도 ↑25%
- ✅ 이후 만족도 개선 30%

### 체크리스트
- [ ] 모든 선택지에 난이도 표시
- [ ] 특징/장점/단점 정리
- [ ] 메모리/리소스 정보 추가
- [ ] 변경 가능성 명시
- [ ] 공식 문서 링크 추가

---

## [UX-06] 리소스 예상치 정확화

### 문제

```
현재 메시지:
  예상 메모리: 6-8GB

사용자 질문:
  "8GB가 정말 맞나?"
  "스토리지는 실제로 얼마나 필요해?"
  "컨테이너들이 서로 간섭하지 않나?"
```

### 목표
- 각 서비스별 상세한 리소스 테이블
- 시간이 지남에 따른 변화 명시
- 부족할 경우 경고 및 최적화 팁

### 구현 방안

```typescript
// src/cli/resource-calculator.ts

interface ResourceEstimate {
  service: string;
  memory: {
    base: number;      // MB - 부팅 시
    working: number;   // MB - 일반 사용
    peak: number;      // MB - 피크 시간
  };
  storage: {
    fixed: number;     // MB - 애플리케이션
    dynamic: number;   // MB/일 - 로그, 데이터
  };
  cpu: {
    idle: string;      // 유휴 시
    active: string;    // 활성 사용
  };
  notes: string;
}

const RESOURCE_MAP: Map<string, ResourceEstimate> = new Map([
  ['jellyfin', {
    service: 'Jellyfin',
    memory: {
      base: 300,      // 부팅 시
      working: 800,   // 일반 사용
      peak: 2000      // 4K 영상 2개 동시 스트리밍
    },
    storage: {
      fixed: 500,          // 애플리케이션
      dynamic: 0           // 파일은 별도 (media 폴더)
    },
    cpu: {
      idle: '2-5%',
      active: '30-60%'
    },
    notes: '스토리지는 영상 크기에 따라 다름 (외부 드라이브 권장)'
  }],
  
  ['nextcloud', {
    service: 'Nextcloud',
    memory: {
      base: 200,
      working: 600,
      peak: 1200
    },
    storage: {
      fixed: 300,
      dynamic: 10 * 1024  // 10GB/일 (보통 사용자)
    },
    cpu: {
      idle: '1-3%',
      active: '20-50%'
    },
    notes: '사용자 수, 동시 접속에 따라 증가'
  }],
  
  // ... 더 많은 서비스
]);

class ResourceCalculator {
  calculateTotal(services: string[]): ResourceReport {
    let totalMemory = {
      base: 500,      // OS + Docker 오버헤드
      working: 500,
      peak: 500
    };
    
    let totalStorage = {
      fixed: 0,
      dynamic: 0
    };
    
    services.forEach(service => {
      const estimate = RESOURCE_MAP.get(service);
      if (estimate) {
        totalMemory.base += estimate.memory.base;
        totalMemory.working += estimate.memory.working;
        totalMemory.peak += estimate.memory.peak;
        totalStorage.fixed += estimate.storage.fixed;
        totalStorage.dynamic += estimate.storage.dynamic;
      }
    });
    
    return {
      memory: totalMemory,
      storage: totalStorage,
      warning: this.generateWarnings(totalMemory),
      optimization: this.suggestOptimization(services)
    };
  }
  
  displayReport(report: ResourceReport, systemMemory: number) {
    console.log(`
📊 예상 리소스 사용량 (1년 운영 기준)

┌─────────────────────────────────────────────────────┐
│ 메모리 (RAM)                                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 부팅 시:        ${report.memory.base}MB            │
│ 일반 사용:      ${report.memory.working}MB         │
│ 피크 시간:      ${report.memory.peak}MB            │
│                                                     │
│ 시스템 메모리:  ${systemMemory}GB                  │
│                                                     │
${this.getMemoryVisualization(report, systemMemory)}│
│                                                     │
${report.warning.memory ? `│ ⚠️ ${report.warning.memory}` : '│ ✅ 메모리 충분'}
│                                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 스토리지                                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 애플리케이션:   ${report.storage.fixed}MB         │
│ 일일 증가:      ${report.storage.dynamic}MB/일    │
│                                                     │
│ 1개월:          ~${(report.storage.fixed + report.storage.dynamic * 30) / 1024}GB
│ 1년:            ~${(report.storage.fixed + report.storage.dynamic * 365) / 1024}GB
│                                                     │
└─────────────────────────────────────────────────────┘

💡 최적화 팁:
${report.optimization.map(t => `  • ${t}`).join('\n')}
    `);
  }
  
  private getMemoryVisualization(
    report: ResourceReport, 
    systemMemory: number
  ): string {
    const barLength = 40;
    const workingPercent = (report.memory.working / (systemMemory * 1024)) * 100;
    const filledLength = Math.floor((workingPercent / 100) * barLength);
    
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    const percentage = workingPercent.toFixed(0);
    
    return `│ 사용률: [${bar}] ${percentage}%`;
  }
  
  private generateWarnings(memory: { working: number; peak: number }): {
    memory?: string;
  } {
    const warnings: { memory?: string } = {};
    
    if (memory.working > 6000) {
      warnings.memory = '메모리 사용량이 많습니다. 일부 서비스 제거 권장';
    }
    
    if (memory.peak > 8000) {
      warnings.memory = '피크 시간에 시스템이 느려질 수 있습니다';
    }
    
    return warnings;
  }
  
  private suggestOptimization(services: string[]): string[] {
    const tips: string[] = [];
    
    if (services.includes('jellyfin') && services.includes('navidrome')) {
      tips.push('Jellyfin과 Navidrome이 모두 메모리를 많이 씁니다. 필요없으면 하나만 선택하세요.');
    }
    
    if (services.length > 10) {
      tips.push('서비스가 많으면 시스템 부하가 증가합니다. 필수 서비스만 선택하세요.');
    }
    
    tips.push('외부 스토리지(NAS, USB)에서 미디어를 제공하면 메인 시스템 부하 감소');
    tips.push('Redis 캐싱을 활성화하면 응답 속도 2-3배 향상 가능');
    
    return tips;
  }
}
```

### 예상 영향
- ✅ 잘못된 설정으로 인한 시스템 과부하 70% 감소
- ✅ 사용자 신뢰도 ↑40%

### 체크리스트
- [ ] 모든 서비스의 메모리 프로파일 측정
- [ ] 시간대별 리소스 변화 모니터링
- [ ] 경고 시스템 구현
- [ ] 최적화 팁 데이터베이스

---

## [UX-07~09] 프레임워크 난이도, 버전 지원, 개발 모드 설명

(자세한 내용은 시뮬레이션 문서 참조)

### 공통 개선안

```typescript
// 모든 선택에 정보 추가
interface EnhancedChoice {
  title: string;
  value: string;
  hint: string;
  details: {
    difficulty: string;
    features: string[];
    learnTime: string;
    community: string;
    changeable: boolean;
    warnings?: string[];
  };
}

// 선택 후 확인 플로우
async function confirmChoice(choice: EnhancedChoice) {
  console.log(`
✅ ${choice.title}

📝 특징: ${choice.details.features.join(', ')}
⭐ 난이도: ${choice.details.difficulty}
📚 학습 시간: ${choice.details.learnTime}
👥 커뮤니티: ${choice.details.community}
🔄 나중에 변경: ${choice.details.changeable ? '✅ 가능' : '❌ 어려움'}

${choice.details.warnings ? `⚠️ 주의:\n${choice.details.warnings.join('\n')}` : ''}

계속하시겠습니까? (Y/n):
  `);
}
```

---

# 🟢 경미 (선택적 개선)

## [UX-10] Docker 없을 때 자동 설치

```typescript
// src/installer/docker-auto-installer.ts

async function ensureDocker() {
  const hasDocker = await checkDocker();
  
  if (hasDocker) {
    return true;
  }
  
  console.log('Docker가 설치되지 않았습니다.');
  
  const choice = await ask('자동으로 설치할까요?', {
    choices: [
      { title: '자동 설치', value: 'auto' },
      { title: '수동 설치 가이드 보기', value: 'guide' },
      { title: '건너뛰기', value: 'skip' }
    ]
  });
  
  if (choice === 'auto') {
    return await autoInstallDocker();
  } else if (choice === 'guide') {
    showDockerInstallGuide();
    return false;
  }
  
  return false;
}
```

---

## [UX-13] 처음 사용자 가이드

```bash
$ brewnet init --help

brewnet init - Brewnet 프로젝트 초기화

사용법:
  brewnet init                      # 대화형 설정 (추천)
  brewnet init --preset media       # 프리셋 사용
  brewnet init --config config.json # 저장된 설정 로드
  
옵션:
  --preset <name>     인기 프리셋 사용 (media, development, home-automation)
  --config <file>     이전 설정 파일 로드
  --skip-docker       Docker 체크 건너뛰기
  --advanced          고급 옵션 표시
  
예시:
  # 미디어 스트리밍 스택 빠른 설치
  $ brewnet init --preset media
  
  # 저장된 설정으로 재설치
  $ brewnet init --config my-setup.json
```

---

# 📊 구현 우선순위 및 일정

## Phase 1: MVP 이전 (필수)

| # | 항목 | 난이도 | 예상 시간 | 담당 |
|---|------|--------|----------|------|
| 1 | 자동 설치 감지 | 중간 | 3일 | CLI |
| 2 | Cloudflare OAuth 연동 | 높음 | 5일 | Backend |
| 3 | 셋업 후 가이드 | 중간 | 3일 | CLI |
| 4 | 프리셋 시스템 | 낮음 | 2일 | CLI |
| 5 | 선택지 설명 강화 | 낮음 | 2일 | Content |

**소계**: 15일

## Phase 2: Post-MVP (개선)

| # | 항목 | 난이도 | 예상 시간 | 담당 |
|---|------|--------|----------|------|
| 6 | 리소스 계산기 | 중간 | 4일 | Backend |
| 7 | 난이도 표시 | 낮음 | 1일 | Content |
| 8 | 버전 지원 정보 | 낮음 | 1일 | Content |
| 9 | 개발 모드 설명 | 낮음 | 1일 | Content |
| 10 | Docker 자동 설치 | 중간 | 3일 | CLI |
| 11 | 프로젝트 템플릿 | 중간 | 3일 | Backend |

**소계**: 13일

---

# ✅ 검증 체크리스트

## 개발 전

- [ ] 3명 이상의 초보 사용자로 프로토타입 테스트
- [ ] 각 단계별 중단 지점 분석
- [ ] 플랫폼별 (macOS, Linux, Windows) 호환성 확인
- [ ] 네트워크 오류 시 복구 절차 검증

## 개발 중

- [ ] 매 단계마다 사용성 테스트
- [ ] 에러 메시지 명확성 확인
- [ ] 명령어 자동완성 테스트
- [ ] 대화형 UI 응답 시간 검증 (<100ms)

## Post-MVP

- [ ] 실제 사용자 피드백 수집
- [ ] 메트릭 기반 개선 (완료율, 소요 시간)
- [ ] A/B 테스트 (프리셋 vs 커스텀)
- [ ] 사용자 만족도 조사 (NPS)

---

# 📋 측정 메트릭

| 메트릭 | 현재 | 목표 | 측정 방법 |
|--------|------|------|----------|
| **셋업 완료율** | 47% | 72% | 사용자 추적 |
| **평균 소요시간** | 70분 | 30분 | 타이머 기록 |
| **중단율 (Step 7)** | 45% | 15% | 로그 분석 |
| **사용자 만족도** | - | 8/10 | NPS 조사 |
| **재방문율** | - | 60% | 사용자 재귀 |

---

작성: 2026년 2월
대상: Brewnet 개발팀
상태: MVP 개발 전 검증 완료
