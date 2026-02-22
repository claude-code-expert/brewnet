# 🧪 Brewnet 종합 테스트 전략 및 구현 가이드

> **상태**: 새로운 기능 (미계획 → 완전 구현)  
> **난이도**: ⭐⭐⭐ (상)  
> **예상 시간**: 2주  
> **팀**: Backend 1명 + QA 1명

---

## 📋 목차
1. [개요](#개요)
2. [테스트 전략](#테스트-전략)
3. [단위 테스트](#단위-테스트)
4. [통합 테스트](#통합-테스트)
5. [e2e 테스트](#e2e-테스트)
6. [성능 테스트](#성능-테스트)
7. [CI/CD 파이프라인](#cicd-파이프라인)

---

## 개요

### 현재 문제점
```
❌ 단위 테스트 계획 없음
❌ e2e 테스트 없음
❌ CI/CD 파이프라인 미정의
❌ 성능/부하 테스트 없음
❌ 보안 테스트 없음
```

### 테스트 금자탑 (Testing Pyramid)

```
        △
       /|\         E2E 테스트 (5%)
      / | \        └─ 실제 환경과 동일한 테스트
     /  |  \
    /   |   \      통합 테스트 (15%)
   /    |    \     └─ 여러 모듈 간 상호작용
  /     |     \
 /______|______\   단위 테스트 (80%)
                   └─ 개별 함수/메서드
```

### 목표

```
테스트 커버리지: 80% 이상
- 핵심 기능: 100%
- 일반 기능: 80%
- 엣지 케이스: 60%

문제 발견:
- 버그 감소: 50% 이상
- 배포 전 감지율: 90% 이상
- 회귀 버그: 거의 0%

속도:
- 전체 테스트: < 10분
- 단위 테스트: < 2분
- PR 체크: < 5분
```

---

## 테스트 전략

### 테스트 계획서

```
┌─────────────────────────────────────────────┐
│         테스트 전략 및 계획                    │
├─────────────────────────────────────────────┤
│                                             │
│ 1. 단위 테스트                                │
│    대상: CLI, 보일러플레이트 생성, 배포 로직  │
│    도구: Jest (TypeScript)                  │
│    커버리지: 80%+                           │
│    실행: 모든 commit                        │
│                                             │
│ 2. 통합 테스트                                │
│    대상: Docker, Cloudflare, 저장소         │
│    도구: Jest, Docker Compose               │
│    환경: 로컬 + CI                          │
│    실행: PR 체크                            │
│                                             │
│ 3. E2E 테스트                                │
│    대상: 완전한 워크플로우                    │
│    도구: Playwright                         │
│    환경: 통합 테스트 환경                     │
│    실행: 배포 전                            │
│                                             │
│ 4. 성능 테스트                                │
│    대상: 배포, 저장소 관리                     │
│    도구: K6, Artillery                      │
│    기준: 95% 지연시간 < 2초                 │
│                                             │
│ 5. 보안 테스트                                │
│    대상: SSH, ACL, 인증                      │
│    도구: OWASP ZAP, 수동 검사                │
│    실행: 매월                               │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 단위 테스트

### Jest 설정

```bash
# jest.config.js

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/cli/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testTimeout: 30000,
  coverageReporters: ['text', 'lcov', 'html']
};
```

### 예제 테스트 케이스

#### 1️⃣ CLI 명령어 테스트

```typescript
// src/cli/__tests__/install.test.ts

import { CLIInstall } from '../install';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

jest.mock('child_process');

describe('CLIInstall', () => {
  let install: CLIInstall;
  const tempDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    install = new CLIInstall();
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  describe('detectOS', () => {
    it('should detect macOS', () => {
      jest.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      const os = install.detectOS();
      expect(os).toBe('darwin');
    });

    it('should detect Linux', () => {
      jest.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      const os = install.detectOS();
      expect(os).toBe('linux');
    });

    it('should throw for unsupported OS', () => {
      jest.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      expect(() => install.detectOS()).toThrow('Unsupported OS');
    });
  });

  describe('installDocker', () => {
    it('should detect installed Docker', async () => {
      (exec as jest.Mock).mockImplementation((cmd, cb) => {
        if (cmd.includes('docker --version')) {
          cb(null, 'Docker version 24.0.0\n', '');
        }
      });

      const installed = await install.checkDockerInstalled();
      expect(installed).toBe(true);
    });

    it('should install Docker on macOS', async () => {
      jest.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      
      await install.installDocker();
      
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('brew install docker'),
        expect.any(Function)
      );
    });

    it('should install Docker on Linux', async () => {
      jest.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      
      await install.installDocker();
      
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('sudo apt install docker.io'),
        expect.any(Function)
      );
    });
  });

  describe('initializeBrewnet', () => {
    it('should create .brewnet directory', async () => {
      await install.initialize(tempDir);
      
      const brewnetDir = path.join(tempDir, '.brewnet');
      expect(fs.existsSync(brewnetDir)).toBe(true);
    });

    it('should create config.json', async () => {
      await install.initialize(tempDir);
      
      const configPath = path.join(tempDir, '.brewnet/config.json');
      expect(fs.existsSync(configPath)).toBe(true);
      
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config).toHaveProperty('version');
      expect(config).toHaveProperty('createdAt');
    });

    it('should handle permission errors', async () => {
      fs.mkdirSync = jest.fn().mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      await expect(install.initialize(tempDir)).rejects.toThrow(
        'Permission denied'
      );
    });
  });
});
```

#### 2️⃣ SSH 사용자 관리 테스트

```typescript
// src/ssh/__tests__/user-manager.test.ts

import { SSHUserManager } from '../user-manager';
import * as fs from 'fs';

describe('SSHUserManager', () => {
  let manager: SSHUserManager;
  const testDir = '/tmp/test-ssh';

  beforeEach(() => {
    manager = new SSHUserManager(testDir);
    fs.mkdirSync(`${testDir}/users`, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true });
  });

  describe('addUser', () => {
    it('should add a new user', async () => {
      const publicKey = 'ssh-ed25519 AAAAC3NzaC1...';
      
      await manager.addUser('alice', publicKey);
      
      const user = await manager.getUser('alice');
      expect(user).toBeDefined();
      expect(user?.username).toBe('alice');
      expect(user?.publicKey).toBe(publicKey);
    });

    it('should reject invalid username', async () => {
      const invalidNames = ['user@invalid', '123', 'user with space', ''];
      
      for (const name of invalidNames) {
        await expect(
          manager.addUser(name, 'ssh-ed25519 ...')
        ).rejects.toThrow('Invalid username');
      }
    });

    it('should reject invalid public key', async () => {
      const invalidKeys = [
        'invalid-key',
        'ssh-rsa INVALID',
        'ssh-ed25519',
        ''
      ];
      
      for (const key of invalidKeys) {
        await expect(
          manager.addUser('alice', key)
        ).rejects.toThrow('Invalid public key');
      }
    });

    it('should prevent duplicate users', async () => {
      await manager.addUser('alice', 'ssh-ed25519 ...');
      
      await expect(
        manager.addUser('alice', 'ssh-ed25519 ...')
      ).rejects.toThrow('User already exists');
    });

    it('should update authorized_keys', async () => {
      await manager.addUser('alice', 'ssh-ed25519 AAAAC3NzaC1...');
      
      const authorizedKeys = fs.readFileSync(
        `${testDir}/authorized_keys`,
        'utf-8'
      );
      
      expect(authorizedKeys).toContain('ssh-ed25519 AAAAC3NzaC1...');
      expect(authorizedKeys).toContain('# alice');
    });
  });

  describe('removeUser', () => {
    it('should remove user', async () => {
      await manager.addUser('alice', 'ssh-ed25519 ...');
      await manager.removeUser('alice');
      
      const user = await manager.getUser('alice');
      expect(user).toBeNull();
    });

    it('should handle non-existent user', async () => {
      await expect(
        manager.removeUser('nonexistent')
      ).rejects.toThrow('User not found');
    });
  });

  describe('listUsers', () => {
    it('should return empty list', async () => {
      const users = await manager.listUsers();
      expect(users).toEqual([]);
    });

    it('should list all users', async () => {
      await manager.addUser('alice', 'ssh-ed25519 ...');
      await manager.addUser('bob', 'ssh-rsa ...');
      
      const users = await manager.listUsers();
      expect(users.length).toBe(2);
      expect(users[0].username).toBe('alice');
      expect(users[1].username).toBe('bob');
    });
  });
});
```

#### 3️⃣ 보일러플레이트 생성 테스트

```typescript
// src/boilerplate/__tests__/generator.test.ts

import { BoilerplateGenerator } from '../generator';
import * as fs from 'fs';
import * as path from 'path';

describe('BoilerplateGenerator', () => {
  let generator: BoilerplateGenerator;
  const testDir = '/tmp/test-boilerplate';

  beforeEach(() => {
    generator = new BoilerplateGenerator();
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true });
  });

  describe('generateBackend', () => {
    it('should generate Python FastAPI project', async () => {
      await generator.generate({
        name: 'myapp',
        type: 'backend',
        language: 'python',
        framework: 'fastapi',
        outputDir: testDir
      });

      const projectDir = path.join(testDir, 'myapp');
      expect(fs.existsSync(projectDir)).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'main.py'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'requirements.txt'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'Dockerfile'))).toBe(true);
    });

    it('should generate Node.js NestJS project', async () => {
      await generator.generate({
        name: 'myapp',
        type: 'backend',
        language: 'nodejs',
        framework: 'nest',
        outputDir: testDir
      });

      const projectDir = path.join(testDir, 'myapp');
      expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'tsconfig.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'Dockerfile'))).toBe(true);
    });

    it('should include docker-compose.yml', async () => {
      await generator.generate({
        name: 'myapp',
        type: 'backend',
        language: 'python',
        framework: 'fastapi',
        database: 'postgresql',
        outputDir: testDir
      });

      const compose = path.join(testDir, 'myapp', 'docker-compose.yml');
      expect(fs.existsSync(compose)).toBe(true);
      
      const content = fs.readFileSync(compose, 'utf-8');
      expect(content).toContain('postgres');
      expect(content).toContain('fastapi');
    });

    it('should replace template variables', async () => {
      await generator.generate({
        name: 'myawesomeapp',
        type: 'backend',
        language: 'python',
        framework: 'fastapi',
        outputDir: testDir
      });

      const main = fs.readFileSync(
        path.join(testDir, 'myawesomeapp/main.py'),
        'utf-8'
      );
      
      expect(main).not.toContain('{{PROJECT_NAME}}');
      expect(main).toContain('myawesomeapp');
    });
  });

  describe('generateFrontend', () => {
    it('should generate React Next.js project', async () => {
      await generator.generate({
        name: 'myapp',
        type: 'frontend',
        framework: 'next',
        outputDir: testDir
      });

      const projectDir = path.join(testDir, 'myapp');
      expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'next.config.js'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'Dockerfile'))).toBe(true);
    });
  });

  describe('validateOutput', () => {
    it('should validate generated project structure', async () => {
      await generator.generate({
        name: 'myapp',
        type: 'backend',
        language: 'python',
        framework: 'fastapi',
        outputDir: testDir
      });

      const isValid = await generator.validateProject(
        path.join(testDir, 'myapp')
      );

      expect(isValid).toBe(true);
    });
  });
});
```

---

## 통합 테스트

### Docker 통합 테스트

```typescript
// tests/integration/docker.test.ts

import { DockerManager } from '../../src/docker/manager';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Docker Integration Tests', () => {
  let docker: DockerManager;

  beforeAll(async () => {
    docker = new DockerManager();
    // Docker 가용성 확인
    try {
      await docker.checkHealth();
    } catch (error) {
      jest.skip('Docker not available');
    }
  });

  describe('container management', () => {
    it('should start and stop container', async () => {
      const containerId = await docker.startContainer({
        image: 'hello-world:latest',
        name: 'test-container'
      });

      expect(containerId).toBeDefined();
      expect(containerId.length).toBeGreaterThan(0);

      const isRunning = await docker.isContainerRunning(containerId);
      expect(isRunning).toBe(true);

      await docker.stopContainer(containerId);
      const isRunningAfter = await docker.isContainerRunning(containerId);
      expect(isRunningAfter).toBe(false);
    });

    it('should build image from Dockerfile', async () => {
      const imageName = 'test-image:latest';
      
      await docker.buildImage({
        dockerfile: 'tests/fixtures/Dockerfile',
        tag: imageName
      });

      const images = await docker.listImages();
      expect(images.some(img => img.includes(imageName))).toBe(true);
    });

    it('should handle docker-compose', async () => {
      const composePath = 'tests/fixtures/docker-compose.yml';
      
      await docker.upCompose(composePath);
      
      const containers = await docker.listContainers();
      expect(containers.length).toBeGreaterThan(0);

      await docker.downCompose(composePath);
    });
  });

  describe('network management', () => {
    it('should create and delete network', async () => {
      const networkName = 'test-network';
      
      const network = await docker.createNetwork(networkName);
      expect(network).toBeDefined();

      const networks = await docker.listNetworks();
      expect(networks.some(n => n.includes(networkName))).toBe(true);

      await docker.deleteNetwork(networkName);
    });

    it('should connect container to network', async () => {
      const networkName = 'test-network';
      await docker.createNetwork(networkName);

      const containerId = await docker.startContainer({
        image: 'alpine:latest',
        networks: [networkName]
      });

      const containerInfo = await docker.inspectContainer(containerId);
      expect(containerInfo.NetworkSettings.Networks).toHaveProperty(networkName);

      await docker.stopContainer(containerId);
      await docker.deleteNetwork(networkName);
    });
  });
});
```

---

## E2E 테스트

### Playwright로 CLI 테스트

```typescript
// tests/e2e/cli-workflow.test.ts

import { test, expect } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

test.describe('CLI End-to-End Workflow', () => {
  test('should complete full setup flow', async () => {
    // 1. Brewnet 설치
    const { stdout: installOutput } = await execAsync('npm install -g brewnet-cli');
    expect(installOutput).toContain('added');

    // 2. 버전 확인
    const { stdout: version } = await execAsync('brewnet --version');
    expect(version).toMatch(/\d+\.\d+\.\d+/);

    // 3. 초기화
    const { stdout: initOutput } = await execAsync('brewnet init --non-interactive');
    expect(initOutput).toContain('✅');
    expect(initOutput).toContain('SSH');
    expect(initOutput).toContain('Docker');

    // 4. 상태 확인
    const { stdout: statusOutput } = await execAsync('brewnet status');
    expect(statusOutput).toContain('Running');
  });

  test('should create and deploy app', async () => {
    // 1. 앱 생성
    const { stdout: createOutput } = await execAsync(
      'brewnet create-app testapp --type backend --lang python --non-interactive'
    );
    expect(createOutput).toContain('testapp');

    // 2. 앱 배포
    const { stdout: deployOutput } = await execAsync('brewnet deploy ./testapp');
    expect(deployOutput).toContain('✅');
    expect(deployOutput).toContain('deployed');

    // 3. 앱 상태 확인
    const { stdout: appStatus } = await execAsync('brewnet app status testapp');
    expect(appStatus).toContain('running');

    // 4. 로그 확인
    const { stdout: logs } = await execAsync('brewnet logs testapp --tail 10');
    expect(logs.length).toBeGreaterThan(0);

    // 5. 앱 중지
    await execAsync('brewnet app stop testapp');
  });

  test('should manage SSH users', async () => {
    // 1. SSH 사용자 추가
    const { stdout: addOutput } = await execAsync(
      'brewnet ssh add-user testuser --key ~/.ssh/id_ed25519.pub'
    );
    expect(addOutput).toContain('✅');

    // 2. 사용자 목록
    const { stdout: listOutput } = await execAsync('brewnet ssh list');
    expect(listOutput).toContain('testuser');

    // 3. SSH 접속 테스트
    const { stdout: connectOutput } = await execAsync(
      'ssh -p 2222 testuser@localhost "echo test"'
    );
    expect(connectOutput).toContain('test');

    // 4. 사용자 제거
    await execAsync('brewnet ssh remove testuser');
  });

  test('should handle storage operations', async () => {
    // 1. 저장소 초기화
    const { stdout: initOutput } = await execAsync('brewnet storage init');
    expect(initOutput).toContain('✅');

    // 2. 저장소 목록
    const { stdout: listOutput } = await execAsync('brewnet storage list');
    expect(listOutput).toContain('Nextcloud');

    // 3. 모니터링
    const { stdout: monitorOutput } = await execAsync('brewnet storage monitor');
    expect(monitorOutput).toMatch(/\d+GB/);

    // 4. 백업 생성
    const { stdout: backupOutput } = await execAsync('brewnet storage backup create');
    expect(backupOutput).toContain('backup');
  });
});
```

---

## 성능 테스트

### K6 성능 테스트

```typescript
// tests/performance/load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,        // 동시 사용자 10명
  duration: '30s', // 30초 동안 실행

  thresholds: {
    // API 응답 시간이 2초 이하 (95%)
    http_req_duration: ['p(95)<2000'],
    // 오류율이 5% 이하
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  // Nextcloud 파일 목록 조회
  const res1 = http.get('http://localhost:8080/remote.php/dav/files/admin/');
  check(res1, {
    'Nextcloud status is 200': (r) => r.status === 200,
    'Nextcloud response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);

  // MinIO 객체 목록 조회
  const res2 = http.get('http://localhost:9000/');
  check(res2, {
    'MinIO status is 200': (r) => r.status === 200,
    'MinIO response time < 1s': (r) => r.timings.duration < 1000,
  });

  sleep(1);

  // API 엔드포인트
  const res3 = http.get('http://localhost:8000/api/health');
  check(res3, {
    'API status is 200': (r) => r.status === 200,
    'API response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

---

## CI/CD 파이프라인

### GitHub Actions 설정

```yaml
# .github/workflows/test.yml

name: Test & Quality Checks

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ ubuntu-latest, macos-latest ]
        node-version: [ 18.x, 20.x ]

    steps:
      - uses: actions/checkout@v3

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run unit tests
        run: npm test -- --coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

      - name: Build
        run: npm run build

  integration:
    runs-on: ubuntu-latest
    services:
      docker:
        image: docker:dind
        options: --privileged

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20.x
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm run test:integration
        env:
          DOCKER_HOST: unix:///var/run/docker.sock

  e2e:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20.x

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install

      - name: Start test server
        run: npm run dev &
        
      - name: Wait for server
        run: npx wait-on http://localhost:3000

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-results
          path: test-results/

  security:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3

      - name: Run security scan
        run: npm run audit

      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'Brewnet'
          path: '.'
```

---

## 테스트 체크리스트

### Pre-Commit
- [ ] 리더기 규칙 통과 (eslint)
- [ ] 포맷 규칙 통과 (prettier)
- [ ] 단위 테스트 통과
- [ ] 타입 체크 통과 (tsc)

### PR 체크
- [ ] 모든 단위 테스트 통과
- [ ] 커버리지 80% 이상
- [ ] 통합 테스트 통과
- [ ] 코드 리뷰 승인

### 배포 전
- [ ] e2e 테스트 통과
- [ ] 성능 테스트 통과
- [ ] 보안 스캔 완료
- [ ] QA 승인

---

## 구현 일정

```
Week 1:
  Day 1-2: 단위 테스트 프레임워크 & CLI 테스트
  Day 3-4: SSH/저장소/보일러플레이트 테스트
  Day 5: 테스트 커버리지 분석 & 개선

Week 2:
  Day 1-2: 통합 테스트 (Docker, Cloudflare)
  Day 3-4: E2E 테스트 (Playwright)
  Day 5: 성능 테스트 & CI/CD 파이프라인
```

---

## 요약

### 구현으로 얻는 것
✅ 80% 이상 테스트 커버리지  
✅ 자동 품질 검사 (lint, format, type)  
✅ 자동 통합 테스트  
✅ 자동 e2e 테스트  
✅ 성능 모니터링  
✅ 보안 스캔  
✅ 배포 자동화  

### 복잡도
- 기술 난이도: ⭐⭐⭐ (상)
- 예상 시간: 2주

---

**다음 단계**: Week 1 Day 1부터 테스트 프레임워크 구축 시작
