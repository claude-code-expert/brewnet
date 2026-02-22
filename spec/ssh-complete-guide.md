# 🔐 Brewnet SSH 서버 완전 구현 가이드

> **상태**: 새로운 기능 (미계획 → 완전 구현)  
> **난이도**: ⭐⭐ (중상)  
> **예상 시간**: 3-5일  
> **팀**: DevOps 1명

---

## 📋 목차
1. [개요 & 목표](#개요--목표)
2. [아키텍처 설계](#아키텍처-설계)
3. [구현 체크리스트](#구현-체크리스트)
4. [CLI 명령어](#cli-명령어)
5. [Docker 통합](#docker-통합)
6. [보안 설정](#보안-설정)
7. [테스트 계획](#테스트-계획)

---

## 개요 & 목표

### 문제점
- SSH 서버 설정이 복잡함
- 수동 설정 필요
- 보안 설정이 어려움
- 여러 사용자 관리 불편

### 목표
```
brewnet ssh enable           # SSH 자동 활성화
brewnet ssh add-user alice   # 사용자 추가
brewnet ssh connect          # 연결 방법 안내
ssh -i ~/.ssh/brewnet alice@myserver.com
```

### 완성 후 모습
```
[SSH Server]
├─ OpenSSH (포트 2222)
├─ 키 기반 인증 (권장)
├─ 패스워드 비활성화 (보안)
├─ 사용자별 권한 관리
├─ 접근 로깅
└─ 자동 방화벽 설정
```

---

## 아키텍처 설계

### 1. SSH 설정 구조

```
~/.brewnet/
├─ ssh/
│  ├─ config.json          # SSH 설정 저장
│  ├─ authorized_keys      # 허가된 공개키
│  ├─ ssh_host_rsa_key     # 호스트 개인키 (자동 생성)
│  ├─ ssh_host_rsa_key.pub # 호스트 공개키
│  └─ users/
│     ├─ alice.json
│     ├─ bob.json
│     └─ ...
│
└─ logs/
   └─ ssh-access.log       # 접근 로그
```

### 2. SSH 사용자 데이터 구조

```typescript
interface SSHUser {
  username: string;
  publicKey: string;        // SSH 공개키
  addedAt: Date;
  lastLogin?: Date;
  enabled: boolean;
  permissions: {
    canDeployApps: boolean;
    canManageUsers: boolean;
    canViewLogs: boolean;
    canModifySystem: boolean;
  };
  allowedIPs?: string[];    // IP 화이트리스트
  createdBy: string;        // 생성한 관리자
}

interface SSHConfig {
  port: number;             // 기본: 2222
  passwordAuth: boolean;    // 기본: false (비활성화)
  pubkeyAuth: boolean;      // 기본: true (활성화)
  rootLogin: boolean;       // 기본: false (비활성화)
  x11Forwarding: boolean;   // 기본: false
  tcpForwarding: boolean;   // 기본: false (보안)
}
```

### 3. CLI 플로우

```
brewnet ssh enable
  │
  ├─ OpenSSH 설치 확인
  │  └─ 없으면 자동 설치 (apt/brew)
  │
  ├─ SSH 키 생성
  │  ├─ 호스트 키 (rsa, ecdsa)
  │  └─ ~/.brewnet/ssh_host_key 저장
  │
  ├─ sshd_config 생성/수정
  │  ├─ 포트: 2222
  │  ├─ 공개키 인증만 활성화
  │  ├─ 루트 로그인 비활성화
  │  └─ 보안 옵션 설정
  │
  ├─ SSH 서비스 시작
  │  └─ systemctl start ssh (또는 launchd on macOS)
  │
  ├─ 방화벽 규칙 추가
  │  └─ 포트 2222 인바운드 허용
  │
  └─ 설정 저장 & 로깅
     └─ ~/.brewnet/ssh/config.json
```

---

## 구현 체크리스트

### Phase 1: 기본 SSH 설정 (2일)

#### 1️⃣ OpenSSH 설치 & 구성

```bash
# src/ssh/install.ts

interface SSHInstallOptions {
  port?: number;           // 기본: 2222
  passwordAuth?: boolean;  // 기본: false
}

class SSHManager {
  async installSSH(options: SSHInstallOptions = {}): Promise<void> {
    const port = options.port || 2222;
    const passwordAuth = options.passwordAuth || false;

    console.log('🔐 OpenSSH 설치 시작...');

    // 1. 설치 상태 확인
    const isInstalled = await this.checkSSHInstalled();
    if (!isInstalled) {
      await this.installOpenSSH();
    }

    // 2. SSH 디렉토리 생성
    const sshDir = path.join(os.homedir(), '.brewnet', 'ssh');
    fs.mkdirSync(sshDir, { recursive: true });

    // 3. 호스트 키 생성 (없으면)
    await this.generateHostKeys(sshDir);

    // 4. sshd_config 생성
    await this.generateSSHdConfig(port, passwordAuth);

    // 5. SSH 서비스 시작
    await this.startSSHService();

    // 6. 방화벽 규칙 추가
    await this.configureFirewall(port);

    // 7. 설정 저장
    const config: SSHConfig = {
      port,
      passwordAuth,
      pubkeyAuth: true,
      rootLogin: false,
      x11Forwarding: false,
      tcpForwarding: false
    };
    fs.writeFileSync(
      path.join(sshDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );

    console.log(`✅ SSH 설정 완료 (포트: ${port})`);
  }

  private async installOpenSSH(): Promise<void> {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS: OpenSSH는 이미 설치됨
      console.log('✓ macOS에 OpenSSH가 설치되어 있습니다');
    } else if (platform === 'linux') {
      // Linux: apt 또는 yum으로 설치
      const hasApt = await this.commandExists('apt');
      const hasYum = await this.commandExists('yum');

      if (hasApt) {
        await this.exec('sudo apt update && sudo apt install -y openssh-server openssh-client');
      } else if (hasYum) {
        await this.exec('sudo yum install -y openssh-server openssh-clients');
      } else {
        throw new Error('지원하는 패키지 매니저를 찾을 수 없습니다');
      }
    }
  }

  private async generateHostKeys(sshDir: string): Promise<void> {
    const keyTypes = ['rsa', 'ecdsa', 'ed25519'];

    for (const keyType of keyTypes) {
      const privateKey = path.join(sshDir, `ssh_host_${keyType}_key`);
      const publicKey = path.join(sshDir, `ssh_host_${keyType}_key.pub`);

      if (!fs.existsSync(privateKey)) {
        console.log(`생성 중: ${keyType} 호스트 키...`);
        await this.exec(
          `ssh-keygen -t ${keyType} -f ${privateKey} -N ""`
        );
        // 권한 설정 (600: 소유자만 읽기/쓰기)
        fs.chmodSync(privateKey, 0o600);
      }
    }
  }

  private async generateSSHdConfig(port: number, passwordAuth: boolean): Promise<void> {
    const config = `# Brewnet SSH Server Configuration
# 자동 생성됨 - 수동 편집은 권장하지 않음

Port ${port}

# 호스트 키
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key

# 인증 설정
PubkeyAuthentication yes
PasswordAuthentication ${passwordAuth ? 'yes' : 'no'}
PermitEmptyPasswords no
ChallengeResponseAuthentication no

# 보안 설정
PermitRootLogin no
X11Forwarding no
PrintMotd no
PrintLastLog yes
TCPKeepAlive yes
UseLogin no
UsePrivilegeSeparation sandbox
PermitUserEnvironment no

# 프로토콜
Protocol 2

# 로깅
SyslogFacility AUTH
LogLevel INFO

# 접근 제한
MaxAuthTries 3
MaxSessions 10
ClientAliveInterval 300
ClientAliveCountMax 2

# Brewnet 커스텀 설정
AuthorizedKeysFile ~/.brewnet/ssh/authorized_keys

# 성능 최적화
Compression yes
ClientAliveInterval 60
`;

    const configPath = '/etc/ssh/sshd_config.d/50-brewnet.conf';
    try {
      fs.writeFileSync(configPath, config);
      fs.chmodSync(configPath, 0o644);
    } catch (error) {
      // /etc 접근 권한 없으면 로컬 경로에 저장
      const localPath = path.join(os.homedir(), '.brewnet/ssh/sshd_config');
      fs.writeFileSync(localPath, config);
      console.warn(`⚠️ /etc/ssh에 접근 권한이 없어 로컬 경로에 저장되었습니다: ${localPath}`);
    }
  }

  private async startSSHService(): Promise<void> {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS: launchd
      await this.exec('sudo launchctl start ssh');
      console.log('✓ SSH 서비스 시작됨 (macOS)');
    } else if (platform === 'linux') {
      // Linux: systemd
      await this.exec('sudo systemctl start ssh || sudo systemctl start sshd');
      await this.exec('sudo systemctl enable ssh || sudo systemctl enable sshd');
      console.log('✓ SSH 서비스 시작됨 (Linux)');
    }
  }

  private async configureFirewall(port: number): Promise<void> {
    const platform = process.platform;

    if (platform === 'linux') {
      // ufw가 있으면 사용
      const hasUfw = await this.commandExists('ufw');
      if (hasUfw) {
        await this.exec(`sudo ufw allow ${port}/tcp`);
        console.log(`✓ 방화벽에서 포트 ${port} 허용됨`);
      }

      // iptables 설정
      const hasIptables = await this.commandExists('iptables');
      if (hasIptables) {
        await this.exec(
          `sudo iptables -A INPUT -p tcp --dport ${port} -j ACCEPT`
        );
        console.log(`✓ iptables에서 포트 ${port} 허용됨`);
      }
    } else if (platform === 'darwin') {
      // macOS: 방화벽 설정 (선택사항)
      console.log(`⚠️ macOS 방화벽: 시스템 환경설정에서 수동 설정 권장`);
    }
  }

  private async checkSSHInstalled(): Promise<boolean> {
    try {
      await this.exec('which ssh');
      return true;
    } catch {
      return false;
    }
  }

  private async commandExists(command: string): Promise<boolean> {
    try {
      await this.exec(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  private async exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }
}
```

#### 2️⃣ SSH 사용자 관리

```bash
# src/ssh/user-manager.ts

interface SSHUserManager {
  addUser(username: string, publicKey: string): Promise<void>;
  removeUser(username: string): Promise<void>;
  listUsers(): Promise<SSHUser[]>;
  updatePermissions(username: string, permissions: object): Promise<void>;
  getUser(username: string): Promise<SSHUser | null>;
}

class SSHUserManager implements SSHUserManager {
  private sshDir: string;
  private usersDir: string;
  private authorizedKeysPath: string;

  constructor() {
    this.sshDir = path.join(os.homedir(), '.brewnet', 'ssh');
    this.usersDir = path.join(this.sshDir, 'users');
    this.authorizedKeysPath = path.join(this.sshDir, 'authorized_keys');
    fs.mkdirSync(this.usersDir, { recursive: true });
  }

  async addUser(username: string, publicKey: string): Promise<void> {
    // 1. 유효성 검사
    if (!this.isValidUsername(username)) {
      throw new Error(`유효하지 않은 사용자명: ${username}`);
    }

    if (!this.isValidPublicKey(publicKey)) {
      throw new Error('유효하지 않은 SSH 공개키');
    }

    // 2. 중복 확인
    const existing = await this.getUser(username);
    if (existing) {
      throw new Error(`사용자가 이미 존재함: ${username}`);
    }

    // 3. 사용자 정보 저장
    const user: SSHUser = {
      username,
      publicKey,
      addedAt: new Date(),
      enabled: true,
      permissions: {
        canDeployApps: false,
        canManageUsers: false,
        canViewLogs: false,
        canModifySystem: false
      },
      createdBy: 'admin'
    };

    const userPath = path.join(this.usersDir, `${username}.json`);
    fs.writeFileSync(userPath, JSON.stringify(user, null, 2));

    // 4. authorized_keys 업데이트
    await this.updateAuthorizedKeys();

    console.log(`✅ SSH 사용자 추가됨: ${username}`);
  }

  async removeUser(username: string): Promise<void> {
    const userPath = path.join(this.usersDir, `${username}.json`);

    if (!fs.existsSync(userPath)) {
      throw new Error(`사용자를 찾을 수 없음: ${username}`);
    }

    // 1. 사용자 파일 삭제
    fs.unlinkSync(userPath);

    // 2. authorized_keys 업데이트
    await this.updateAuthorizedKeys();

    console.log(`✅ SSH 사용자 제거됨: ${username}`);
  }

  async listUsers(): Promise<SSHUser[]> {
    const files = fs.readdirSync(this.usersDir);
    const users: SSHUser[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(this.usersDir, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        users.push(JSON.parse(data));
      }
    }

    return users;
  }

  async updatePermissions(username: string, permissions: object): Promise<void> {
    const user = await this.getUser(username);
    if (!user) {
      throw new Error(`사용자를 찾을 수 없음: ${username}`);
    }

    user.permissions = { ...user.permissions, ...permissions };
    const userPath = path.join(this.usersDir, `${username}.json`);
    fs.writeFileSync(userPath, JSON.stringify(user, null, 2));

    console.log(`✅ 권한 업데이트됨: ${username}`);
  }

  async getUser(username: string): Promise<SSHUser | null> {
    const userPath = path.join(this.usersDir, `${username}.json`);
    if (!fs.existsSync(userPath)) {
      return null;
    }

    const data = fs.readFileSync(userPath, 'utf-8');
    return JSON.parse(data);
  }

  private async updateAuthorizedKeys(): Promise<void> {
    const users = await this.listUsers();
    const keys = users
      .filter(u => u.enabled)
      .map(u => `${u.publicKey} # ${u.username}`)
      .join('\n');

    fs.writeFileSync(this.authorizedKeysPath, keys);
    fs.chmodSync(this.authorizedKeysPath, 0o600);
  }

  private isValidUsername(username: string): boolean {
    // 영문, 숫자, 언더스코어, 하이픈만 허용
    return /^[a-zA-Z0-9_-]{3,32}$/.test(username);
  }

  private isValidPublicKey(key: string): boolean {
    // SSH 공개키 형식 검사 (ssh-rsa, ssh-ed25519, ecdsa-sha2-*)
    return /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-)\s+[A-Za-z0-9+\/]+={0,2}\s*/.test(key);
  }
}
```

---

### Phase 2: CLI 명령어 구현 (2일)

#### 3️⃣ SSH CLI 명령어

```bash
# src/commands/ssh/enable.ts
export default class SSHEnable extends Command {
  static description = 'SSH 서버 활성화';
  
  static flags = {
    port: Flags.integer({ description: 'SSH 포트 (기본: 2222)' }),
    'password-auth': Flags.boolean({
      description: '패스워드 인증 활성화 (기본: 비활성화)',
      default: false
    })
  };

  async run() {
    const { flags } = await this.parse(SSHEnable);
    const manager = new SSHManager();
    
    await manager.installSSH({
      port: flags.port,
      passwordAuth: flags['password-auth']
    });
  }
}

// src/commands/ssh/add-user.ts
export default class SSHAddUser extends Command {
  static description = 'SSH 사용자 추가';
  
  static args = [
    { name: 'username', required: true, description: '사용자명' }
  ];

  static flags = {
    key: Flags.string({
      char: 'k',
      description: 'SSH 공개키 파일 또는 직접 입력'
    }),
    'no-deploy': Flags.boolean({
      description: '앱 배포 권한 비활성화'
    })
  };

  async run() {
    const { args, flags } = await this.parse(SSHAddUser);
    const userManager = new SSHUserManager();
    
    // 1. 공개키 읽기
    let publicKey = flags.key;
    if (!publicKey) {
      publicKey = await this.prompt('SSH 공개키를 입력하세요:', {
        type: 'password'
      });
    } else if (fs.existsSync(publicKey)) {
      publicKey = fs.readFileSync(publicKey, 'utf-8').trim();
    }
    
    // 2. 사용자 추가
    await userManager.addUser(args.username, publicKey);
    
    // 3. 권한 설정
    if (flags['no-deploy']) {
      await userManager.updatePermissions(args.username, {
        canDeployApps: false
      });
    }
  }
}

// src/commands/ssh/list.ts
export default class SSHList extends Command {
  static description = 'SSH 사용자 목록 조회';

  async run() {
    const userManager = new SSHUserManager();
    const users = await userManager.listUsers();

    if (users.length === 0) {
      console.log('등록된 SSH 사용자가 없습니다');
      return;
    }

    console.log('\n🔐 SSH 사용자 목록\n');
    const table = users.map(u => ({
      사용자명: u.username,
      상태: u.enabled ? '✓ 활성' : '✗ 비활성',
      추가일: new Date(u.addedAt).toLocaleDateString('ko-KR'),
      배포: u.permissions.canDeployApps ? '✓' : '✗',
      로그보기: u.permissions.canViewLogs ? '✓' : '✗'
    }));

    console.table(table);
  }
}

// src/commands/ssh/remove.ts
export default class SSHRemove extends Command {
  static description = 'SSH 사용자 제거';
  
  static args = [
    { name: 'username', required: true }
  ];

  async run() {
    const { args } = await this.parse(SSHRemove);
    const userManager = new SSHUserManager();
    
    // 확인
    const confirmed = await this.confirm(
      `사용자 '${args.username}'을(를) 제거하시겠습니까?`
    );
    
    if (confirmed) {
      await userManager.removeUser(args.username);
    }
  }
}

// src/commands/ssh/status.ts
export default class SSHStatus extends Command {
  static description = 'SSH 서버 상태 확인';

  async run() {
    const sshDir = path.join(os.homedir(), '.brewnet', 'ssh');
    const configPath = path.join(sshDir, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      console.log('❌ SSH 서버가 설정되지 않았습니다');
      console.log('실행: brewnet ssh enable');
      return;
    }

    const config: SSHConfig = JSON.parse(
      fs.readFileSync(configPath, 'utf-8')
    );
    
    const isRunning = await this.checkSSHRunning(config.port);
    const userManager = new SSHUserManager();
    const users = await userManager.listUsers();
    
    console.log('\n🔐 SSH 서버 상태\n');
    console.log(`포트:              ${config.port}`);
    console.log(`상태:              ${isRunning ? '✓ 실행 중' : '✗ 중지됨'}`);
    console.log(`공개키 인증:        ${config.pubkeyAuth ? '✓ 활성' : '✗ 비활성'}`);
    console.log(`패스워드 인증:      ${config.passwordAuth ? '✓ 활성' : '✗ 비활성'}`);
    console.log(`루트 로그인:        ${config.rootLogin ? '✓ 활성' : '✗ 비활성'}`);
    console.log(`등록된 사용자:      ${users.length}명\n`);
  }

  private async checkSSHRunning(port: number): Promise<boolean> {
    try {
      await exec(`lsof -i :${port}`);
      return true;
    } catch {
      return false;
    }
  }
}

// src/commands/ssh/connect.ts
export default class SSHConnect extends Command {
  static description = 'SSH 접속 방법 안내';

  async run() {
    const sshDir = path.join(os.homedir(), '.brewnet', 'ssh');
    const configPath = path.join(sshDir, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      console.log('❌ SSH 서버가 설정되지 않았습니다');
      return;
    }

    const config: SSHConfig = JSON.parse(
      fs.readFileSync(configPath, 'utf-8')
    );

    const hostname = os.hostname();
    const ip = this.getLocalIP();

    console.log(`
\n🔐 SSH 접속 방법\n

1️⃣  로컬 접속 (같은 네트워크):
   ssh -p ${config.port} alice@localhost
   ssh -p ${config.port} alice@${ip}

2️⃣  원격 접속 (외부 네트워크):
   # Cloudflare Tunnel을 통한 접속
   ssh -p ${config.port} alice@myserver.example.com

3️⃣  SSH 키 등록:
   # 클라이언트에서
   ssh-keygen -t ed25519 -f ~/.ssh/brewnet_key
   cat ~/.ssh/brewnet_key.pub  # 이 내용을 복사
   
   # 서버에서
   brewnet ssh add-user alice
   (공개키 입력)

4️⃣  SSH 설정 파일 (선택사항):
   ~/.ssh/config에 추가:
   Host brewnet
     HostName myserver.example.com
     User alice
     Port ${config.port}
     IdentityFile ~/.ssh/brewnet_key
   
   접속: ssh brewnet

`);
  }

  private getLocalIP(): string {
    const interfaces = require('os').networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
    return 'localhost';
  }
}
```

---

## CLI 명령어

### 사용자가 실행하는 명령어

```bash
# 1. SSH 활성화
brewnet ssh enable
brewnet ssh enable --port 2222
brewnet ssh enable --password-auth  # 패스워드 인증도 함께 활성화

# 2. SSH 사용자 추가
brewnet ssh add-user alice --key ~/.ssh/id_ed25519.pub
brewnet ssh add-user bob

# 3. SSH 사용자 목록
brewnet ssh list

# 4. SSH 사용자 제거
brewnet ssh remove alice

# 5. SSH 상태 확인
brewnet ssh status

# 6. SSH 접속 가이드
brewnet ssh connect

# 7. 권한 설정
brewnet ssh grant alice --deploy --manage-users
brewnet ssh revoke alice --deploy
```

---

## Docker 통합

### SSH를 포함한 docker-compose.yml

```yaml
version: '3.9'

services:
  brewnet-ssh:
    image: openssh/openssh-server:latest
    container_name: brewnet-ssh
    restart: unless-stopped
    
    ports:
      - "2222:22"
    
    volumes:
      # SSH 설정
      - ~/.brewnet/ssh:/etc/ssh/keys:ro
      - ~/.brewnet/ssh/authorized_keys:/root/.ssh/authorized_keys:ro
      
      # 데이터 디렉토리 (선택사항)
      - ~/.brewnet/data:/data
      
      # SSH 로그
      - ~/.brewnet/logs/ssh-access.log:/var/log/auth.log
    
    environment:
      # SSH 설정
      SSH_ENABLE_ROOT: "false"
      SSH_ENABLE_PASSWORD_AUTH: "false"
      SSH_ENABLE_PUBLIC_KEY_AUTH: "true"
      
      # 로깅
      LOG_STDOUT: "true"
    
    networks:
      - brewnet-network
    
    healthcheck:
      test: ["CMD", "ssh", "-o", "StrictHostKeyChecking=no", "localhost", "-p", "22", "true"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  brewnet-network:
    name: brewnet-network
```

또는 **로컬 호스트의 OpenSSH** 사용:

```yaml
version: '3.9'

services:
  brewnet-app:
    image: brewnet:latest
    container_name: brewnet-app
    
    # 호스트의 SSH를 사용하므로 포트 노출 안 함
    # 대신 호스트 SSH 접근으로 관리
    
    volumes:
      - ~/.brewnet:/root/.brewnet
      - /var/run/docker.sock:/var/run/docker.sock
    
    networks:
      - brewnet-network

networks:
  brewnet-network:
    name: brewnet-network
```

---

## 보안 설정

### SSH 보안 Best Practices

```bash
# 1. 강력한 호스트 키 생성 (이미 구현됨)
ssh-keygen -t ed25519 -f ssh_host_ed25519_key -N ""

# 2. 공개키만 사용 (패스워드 비활성화)
PasswordAuthentication no
PubkeyAuthentication yes

# 3. 루트 로그인 비활성화
PermitRootLogin no

# 4. 빈 패스워드 허용 안 함
PermitEmptyPasswords no

# 5. 포트포워딩 비활성화 (보안 강화)
AllowTcpForwarding no
AllowStreamLocalForwarding no
X11Forwarding no

# 6. 접근 제한
MaxAuthTries 3          # 실패 횟수 제한
MaxSessions 10          # 동시 세션 제한
ClientAliveInterval 300 # 유휴 연결 종료

# 7. 접근 로깅
SyslogFacility AUTH
LogLevel VERBOSE
```

### 접근 제어 (선택사항)

```typescript
// IP 화이트리스트 설정
interface SSHAccessPolicy {
  username: string;
  allowedIPs: string[];     // 접근 가능한 IP
  deniedIPs: string[];      // 차단된 IP
  timeRestriction?: {
    startHour: number;      // 접근 가능한 시간
    endHour: number;
  };
}

// 사용 예:
brewnet ssh access alice --allow 192.168.1.0/24
brewnet ssh access alice --deny 10.0.0.0/8
brewnet ssh access alice --time-restriction 09:00-18:00
```

---

## 테스트 계획

### 단위 테스트

```typescript
// tests/ssh/ssh-manager.test.ts

describe('SSHManager', () => {
  let manager: SSHManager;

  beforeEach(() => {
    manager = new SSHManager();
  });

  describe('installSSH', () => {
    it('should install SSH successfully', async () => {
      await manager.installSSH({ port: 2222 });
      // assertions...
    });

    it('should create host keys', async () => {
      await manager.installSSH();
      const keys = fs.readdirSync(sshDir);
      expect(keys).toContain('ssh_host_rsa_key');
      expect(keys).toContain('ssh_host_ed25519_key');
    });

    it('should start SSH service', async () => {
      await manager.installSSH();
      const isRunning = await manager.checkSSHRunning();
      expect(isRunning).toBe(true);
    });
  });
});

describe('SSHUserManager', () => {
  let manager: SSHUserManager;

  beforeEach(() => {
    manager = new SSHUserManager();
  });

  describe('addUser', () => {
    it('should add user with valid public key', async () => {
      const publicKey = 'ssh-ed25519 AAAAC3NzaC1...';
      await manager.addUser('alice', publicKey);
      const user = await manager.getUser('alice');
      expect(user?.username).toBe('alice');
    });

    it('should reject invalid usernames', async () => {
      expect(() => manager.addUser('user@invalid', 'key'))
        .toThrow();
    });

    it('should reject invalid public keys', async () => {
      expect(() => manager.addUser('alice', 'invalid-key'))
        .toThrow();
    });

    it('should prevent duplicate users', async () => {
      await manager.addUser('alice', 'ssh-ed25519 ...');
      expect(() => manager.addUser('alice', 'ssh-ed25519 ...'))
        .toThrow();
    });
  });

  describe('removeUser', () => {
    it('should remove user', async () => {
      await manager.addUser('alice', 'ssh-ed25519 ...');
      await manager.removeUser('alice');
      const user = await manager.getUser('alice');
      expect(user).toBeNull();
    });
  });

  describe('listUsers', () => {
    it('should list all users', async () => {
      await manager.addUser('alice', 'ssh-ed25519 ...');
      await manager.addUser('bob', 'ssh-rsa ...');
      const users = await manager.listUsers();
      expect(users.length).toBe(2);
    });
  });
});
```

### 통합 테스트

```bash
#!/bin/bash
# tests/ssh/integration.sh

set -e

echo "🧪 SSH 통합 테스트 시작..."

# 1. SSH 활성화
brewnet ssh enable --port 2222
sleep 2

# 2. SSH 상태 확인
brewnet ssh status | grep "✓ 실행 중"

# 3. 사용자 추가
brewnet ssh add-user testuser --key ~/.ssh/id_ed25519.pub

# 4. 사용자 목록 확인
users=$(brewnet ssh list | grep testuser)
[ -n "$users" ] || exit 1

# 5. SSH 로컬 접속 테스트
ssh -o StrictHostKeyChecking=no -p 2222 testuser@localhost whoami

# 6. 사용자 제거
brewnet ssh remove testuser

# 7. 사용자 확인
users=$(brewnet ssh list | grep testuser)
[ -z "$users" ] || exit 1

echo "✅ 모든 SSH 통합 테스트 통과"
```

---

## 구현 일정

```
Day 1: 기초 설정
  □ OpenSSH 설치 & 설정 모듈
  □ 호스트 키 생성
  □ sshd_config 자동 생성

Day 2: 사용자 관리
  □ SSHUserManager 구현
  □ authorized_keys 관리
  □ 권한 설정

Day 3: CLI 명령어
  □ ssh enable/disable
  □ ssh add-user/remove/list
  □ ssh status/connect

Day 4: 통합 & 테스트
  □ Docker 통합
  □ 단위 테스트
  □ 통합 테스트

Day 5: 문서 & 정리
  □ README 작성
  □ 보안 가이드
  □ 트러블슈팅 가이드
```

---

## 요약

### 구현으로 얻는 것
✅ 원격 관리 가능 (CLI/API)  
✅ 보안 강화 (공개키만 사용)  
✅ 다중 사용자 지원  
✅ 자동 설정 (기술 없이도 가능)  
✅ 접근 로깅 & 감시  

### 복잡도
- 기술 난이도: ⭐⭐ (중상)
- 보안 난이도: ⭐⭐⭐ (높음)
- 예상 시간: 3-5일

---

**다음 단계**: 이 문서를 팀과 공유하고 Day 1부터 구현 시작
