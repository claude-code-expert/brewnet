# 📁 Brewnet 파일 서버 완전 구현 가이드

> **상태**: 부분적으로 계획됨 (확장 필요)  
> **난이도**: ⭐⭐⭐ (상)  
> **예상 시간**: 1-2주  
> **팀**: Backend 1-2명 + DevOps 1명

---

## 📋 목차
1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [Phase 1: Nextcloud 최적화](#phase-1-nextcloud-최적화)
4. [Phase 2: MinIO 추가](#phase-2-minio-추가)
5. [Phase 3: 동영상 스트리밍](#phase-3-동영상-스트리밍)
6. [Phase 4: SFTP 지원](#phase-4-sftp-지원)
7. [CLI 명령어](#cli-명령어)
8. [Docker 통합](#docker-통합)

---

## 개요

### 현재 계획의 문제점
```
❌ SFTP 미계획
❌ 대용량 파일 미최적화
❌ 동영상 스트리밍 없음
❌ 이미지 썸네일 자동화 없음
❌ 저장소 모니터링 없음
```

### 목표: 완전한 파일 서버

```
brewnet storage init              # 파일 서버 초기화
brewnet storage add /media        # 저장소 추가
brewnet storage list              # 저장소 목록
brewnet storage quota set 1TB     # 용량 제한
brewnet storage monitor           # 모니터링 시작

↓ 사용자 접근 방법
├─ 웹 UI (Nextcloud)    - 일반 파일 관리
├─ SFTP                 - 프로그래밍 방식
├─ S3 API (MinIO)       - 애플리케이션 통합
└─ 동영상 스트리밍      - 대용량 미디어
```

---

## 아키텍처

### 다층 파일 서버 구조

```
┌─────────────────────────────────────────────────┐
│              사용자 접근 방법                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Web UI        SFTP          API       Stream   │
│ Nextcloud    OpenSSH       MinIO      Jellyfin │
│   :80        :2222        :9000       :8096    │
│                                                 │
├─────────────────────────────────────────────────┤
│           통합 저장소 관리 계층                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Nextcloud    MinIO        Monitoring  Backup   │
│ (메타데이터) (객체)      (용량/성능) (복제)     │
│                                                 │
├─────────────────────────────────────────────────┤
│           로컬 파일시스템 계층                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  /data/files (일반)  /data/media (대용량)       │
│  /data/archive       /data/temp                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 데이터 구조

```typescript
interface StorageVolume {
  name: string;
  path: string;
  capacity: number;      // 바이트
  usedSpace: number;
  quota?: number;
  type: 'general' | 'media' | 'archive' | 'backup';
  encrypted: boolean;
  compression: boolean;
  monitoring: boolean;
}

interface StorageConfig {
  volumes: StorageVolume[];
  defaultVolume: string;
  autoCleanup: {
    enabled: boolean;
    tempFilesAge: number;     // 일수
    backupRetention: number;  // 일수
  };
  quotas: {
    perUser?: number;
    perApp?: number;
  };
  backupSchedule: {
    enabled: boolean;
    time: string;             // HH:MM
    frequency: 'daily' | 'weekly' | 'monthly';
  };
}
```

---

## Phase 1: Nextcloud 최적화 (3일)

### 1️⃣ Nextcloud 설치 & 설정 자동화

```bash
# src/storage/nextcloud-setup.ts

interface NextcloudConfig {
  domain: string;
  adminUser: string;
  adminPassword: string;
  dataPath: string;
  dbType: 'postgres' | 'mysql';
  maxUploadSize: number;    // MB
  enableSharing: boolean;
}

class NextcloudManager {
  async setupNextcloud(config: NextcloudConfig): Promise<void> {
    console.log('🎯 Nextcloud 설정 시작...');

    // 1. 디렉토리 생성
    fs.mkdirSync(config.dataPath, { recursive: true });
    
    // 2. Docker 이미지 풀
    await this.pullDockerImage('nextcloud:latest');
    
    // 3. docker-compose.yml 생성
    const compose = this.generateDockerCompose(config);
    fs.writeFileSync('docker-compose.nextcloud.yml', compose);
    
    // 4. 환경 변수 설정
    this.generateEnvFile(config);
    
    // 5. 컨테이너 시작
    await this.exec('docker-compose -f docker-compose.nextcloud.yml up -d');
    
    // 6. 초기화 대기
    await this.waitForHealthy();
    
    // 7. 기본 설정
    await this.initialConfiguration(config);
    
    console.log('✅ Nextcloud 설치 완료');
  }

  private generateDockerCompose(config: NextcloudConfig): string {
    return `version: '3.9'

services:
  nextcloud:
    image: nextcloud:latest
    container_name: brewnet-nextcloud
    restart: unless-stopped
    
    ports:
      - "8080:80"
    
    volumes:
      - ${config.dataPath}:/var/www/html/data
      - ./nextcloud-config:/var/www/html/config
    
    environment:
      NEXTCLOUD_ADMIN_USER: ${config.adminUser}
      NEXTCLOUD_ADMIN_PASSWORD: ${config.adminPassword}
      NEXTCLOUD_TRUSTED_DOMAINS: ${config.domain}
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: \${DB_PASSWORD}
      MYSQL_HOST: nextcloud-db
    
    depends_on:
      - nextcloud-db
    
    networks:
      - brewnet-network

  nextcloud-db:
    image: mariadb:latest
    container_name: brewnet-nextcloud-db
    restart: unless-stopped
    
    volumes:
      - ./nextcloud-db:/var/lib/mysql
    
    environment:
      MYSQL_ROOT_PASSWORD: \${ROOT_PASSWORD}
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: \${DB_PASSWORD}
    
    networks:
      - brewnet-network

networks:
  brewnet-network:
    name: brewnet-network
`;
  }

  private async initialConfiguration(config: NextcloudConfig): Promise<void> {
    // Nextcloud REST API를 통한 초기 설정
    const api = new NextcloudAPI(config.domain);
    
    // 1. 2FA 활성화
    await api.enableTwoFactorAuth();
    
    // 2. HTTPS 강제
    await api.enforceHttps();
    
    // 3. 파일 업로드 크기 제한 설정
    await api.setMaxUploadSize(config.maxUploadSize);
    
    // 4. 파일 공유 정책 설정
    if (config.enableSharing) {
      await api.enablePublicSharing();
      await api.setShareDefaults({
        expireDate: 30,       // 30일 후 만료
        requirePassword: true,
        allowDownload: true
      });
    }
    
    // 5. 접근 로그 활성화
    await api.enableAccessLogs();
  }
}
```

### 2️⃣ Nextcloud 성능 최적화

```bash
# src/storage/nextcloud-optimization.ts

class NextcloudOptimizer {
  
  async optimizePerformance(): Promise<void> {
    console.log('⚡ Nextcloud 성능 최적화 중...');

    // 1. Redis 캐시 추가
    await this.setupRedisCache();
    
    // 2. APCu 로컬 메모리 캐시
    await this.setupAPCuCache();
    
    // 3. 데이터베이스 최적화
    await this.optimizeDatabase();
    
    // 4. PHP 설정 최적화
    await this.optimizePHPConfig();
    
    // 5. HTTP/2 활성화
    await this.enableHTTP2();
    
    // 6. 압축 활성화
    await this.enableCompression();
  }

  private async setupRedisCache(): Promise<void> {
    // Redis 컨테이너 추가
    const redisCompose = `
  redis:
    image: redis:latest
    container_name: brewnet-redis
    restart: unless-stopped
    volumes:
      - ./redis:/data
    networks:
      - brewnet-network
`;
    
    // Nextcloud config.php 수정
    const redisConfig = `
$CONFIG = array(
  'memcache.distributed' => '\\\\OC\\\\Memcache\\\\Redis',
  'redis' => array(
    'host' => 'redis',
    'port' => 6379,
  ),
  'memcache.locking' => '\\\\OC\\\\Memcache\\\\Redis',
);
`;
  }

  private async optimizeDatabase(): Promise<void> {
    // MariaDB 최적화
    const optimizedConfig = `
[mysqld]
# 성능 튜닝
innodb_buffer_pool_size = 2G
innodb_log_file_size = 512M
innodb_flush_method = O_DIRECT
query_cache_type = 1
query_cache_size = 128M

# 동시성
max_connections = 500
max_allowed_packet = 512M

# 색인화
innodb_autoinc_lock_mode = 2
`;
  }

  private async optimizePHPConfig(): Promise<void> {
    const phpOptimization = `
; PHP 성능 최적화
opcache.enable = 1
opcache.memory_consumption = 256
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 10000
opcache.revalidate_freq = 60
opcache.jit = 1235
opcache.jit_buffer_size = 256M

; Nextcloud 권장 설정
upload_max_filesize = 10G
post_max_size = 10G
memory_limit = 512M
max_execution_time = 3600
`;
  }

  private async enableHTTP2(): Promise<void> {
    // Nginx에서 HTTP/2 활성화
    const nginxConfig = `
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  
  # SSL 설정...
  
  # HTTP/2 서버 푸시
  http2_push_preload on;
}
`;
  }

  private async enableCompression(): Promise<void> {
    // Gzip 압축 활성화
    const nginxCompression = `
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript 
           application/json application/javascript application/xml+rss 
           image/svg+xml;
gzip_min_length 1000;
`;
  }
}
```

---

## Phase 2: MinIO 추가 (3일)

### 3️⃣ MinIO S3 호환 저장소

```bash
# src/storage/minio-setup.ts

interface MinIOConfig {
  rootUser: string;
  rootPassword: string;
  dataPath: string;
  buckets: string[];        // 버킷 이름
  enableVersioning: boolean;
  enableReplication: boolean;
}

class MinIOManager {
  async setupMinIO(config: MinIOConfig): Promise<void> {
    console.log('📦 MinIO 설정 시작...');

    // 1. 데이터 디렉토리 생성
    fs.mkdirSync(config.dataPath, { recursive: true });
    
    // 2. docker-compose.yml 생성
    const compose = this.generateDockerCompose(config);
    fs.writeFileSync('docker-compose.minio.yml', compose);
    
    // 3. 컨테이너 시작
    await this.exec('docker-compose -f docker-compose.minio.yml up -d');
    
    // 4. 초기화 대기
    await this.waitForHealthy();
    
    // 5. 버킷 생성
    await this.createBuckets(config);
    
    // 6. 정책 설정
    await this.configurePolicies(config);
    
    console.log('✅ MinIO 설정 완료');
  }

  private generateDockerCompose(config: MinIOConfig): string {
    return `version: '3.9'

services:
  minio:
    image: minio/minio:latest
    container_name: brewnet-minio
    restart: unless-stopped
    
    command: minio server /data --console-address :9001
    
    ports:
      - "9000:9000"    # S3 API
      - "9001:9001"    # Web Console
    
    volumes:
      - ${config.dataPath}:/data
    
    environment:
      MINIO_ROOT_USER: ${config.rootUser}
      MINIO_ROOT_PASSWORD: ${config.rootPassword}
      MINIO_REGION_NAME: us-east-1
    
    networks:
      - brewnet-network
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

networks:
  brewnet-network:
    name: brewnet-network
`;
  }

  private async createBuckets(config: MinIOConfig): Promise<void> {
    const minio = new MinIO({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: config.rootUser,
      secretKey: config.rootPassword
    });

    for (const bucket of config.buckets) {
      try {
        const exists = await minio.bucketExists(bucket);
        if (!exists) {
          await minio.makeBucket(bucket, 'us-east-1');
          console.log(`✓ 버킷 생성됨: ${bucket}`);
        }
      } catch (error) {
        console.error(`✗ 버킷 생성 실패: ${bucket}`, error);
      }
    }
  }

  private async configurePolicies(config: MinIOConfig): Promise<void> {
    const minio = new MinIO({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: config.rootUser,
      secretKey: config.rootPassword
    });

    // 버전 관리 활성화
    if (config.enableVersioning) {
      for (const bucket of config.buckets) {
        await minio.setVersioningConfig(bucket, {
          Status: 'Enabled'
        });
      }
    }

    // 라이프사이클 정책 설정 (자동 정리)
    const lifecyclePolicy = {
      Rules: [
        {
          ID: 'delete-temp-files',
          Filter: { Prefix: 'temp/' },
          Expiration: { Days: 7 },
          Status: 'Enabled'
        },
        {
          ID: 'archive-old-files',
          Filter: { Prefix: 'archive/' },
          Transitions: [
            {
              Days: 30,
              StorageClass: 'GLACIER'
            }
          ],
          Status: 'Enabled'
        }
      ]
    };
  }
}
```

### 4️⃣ Nextcloud - MinIO 통합

```bash
# src/storage/nextcloud-minio-integration.ts

class NextcloudMinIOIntegration {
  async connectNextcloudToMinIO(
    nextcloudUrl: string,
    minioUrl: string,
    credentials: { accessKey: string; secretKey: string }
  ): Promise<void> {
    console.log('🔗 Nextcloud-MinIO 통합 중...');

    const nc = new NextcloudAPI(nextcloudUrl);
    
    // Nextcloud 외부 저장소 설정
    const externalStorage = {
      name: 'MinIO Object Storage',
      type: 's3',
      mount_point: '/minio',
      configuration: {
        host: minioUrl,
        key: credentials.accessKey,
        secret: credentials.secretKey,
        bucket: 'nextcloud-data',
        region: 'us-east-1',
        use_ssl: true,
        use_path_style: true,
        enable_version_id: true
      },
      applicable_users: ['all'],
      priority: 1,
      readonly: false
    };

    await nc.addExternalStorage(externalStorage);
    
    console.log('✅ Nextcloud-MinIO 통합 완료');
  }
}
```

---

## Phase 3: 동영상 스트리밍 (4일)

### 5️⃣ Jellyfin 통합

```bash
# src/storage/jellyfin-setup.ts

interface JellyfinConfig {
  libraryPath: string;
  domain: string;
  adminPassword: string;
  transcodingEnabled: boolean;
}

class JellyfinManager {
  async setupJellyfin(config: JellyfinConfig): Promise<void> {
    console.log('🎬 Jellyfin 설정 시작...');

    // 1. 라이브러리 디렉토리 구조 생성
    this.createLibraryStructure(config.libraryPath);
    
    // 2. docker-compose에 Jellyfin 추가
    const compose = this.generateDockerCompose(config);
    
    // 3. 컨테이너 시작
    await this.exec('docker-compose -f docker-compose.jellyfin.yml up -d');
    
    // 4. 초기 설정
    await this.initialConfiguration(config);
    
    console.log('✅ Jellyfin 설정 완료');
  }

  private generateDockerCompose(config: JellyfinConfig): string {
    return `version: '3.9'

services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: brewnet-jellyfin
    restart: unless-stopped
    
    ports:
      - "8096:8096"     # HTTP
      - "8920:8920"     # HTTPS
    
    volumes:
      # 라이브러리 데이터
      - ${config.libraryPath}:/media
      
      # 설정 데이터
      - ./jellyfin-config:/config
      
      # 캐시
      - ./jellyfin-cache:/cache
    
    environment:
      JELLYFIN_PublishedServerUrl: https://${config.domain}
      JELLYFIN_FFmpeg_Threads: 4
    
    devices:
      # GPU 트랜스코딩 (선택사항)
      # - /dev/dri:/dev/dri
    
    networks:
      - brewnet-network
    
    # 성능 설정
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
        reservations:
          cpus: '2'
          memory: 2G

networks:
  brewnet-network:
    name: brewnet-network
`;
  }

  private createLibraryStructure(basePath: string): void {
    const directories = [
      'movies',
      'tv-shows',
      'music',
      'photos',
      'home-videos'
    ];

    for (const dir of directories) {
      fs.mkdirSync(path.join(basePath, dir), { recursive: true });
    }
  }

  private async initialConfiguration(config: JellyfinConfig): Promise<void> {
    // Jellyfin 초기 설정 (API 호출)
    const api = new JellyfinAPI(`http://localhost:8096`);
    
    // 1. 관리자 암호 설정
    await api.setAdminPassword(config.adminPassword);
    
    // 2. 라이브러리 추가
    await api.addLibrary({
      name: 'Movies',
      path: `${config.libraryPath}/movies`,
      type: 'movies'
    });

    await api.addLibrary({
      name: 'TV Shows',
      path: `${config.libraryPath}/tv-shows`,
      type: 'tvshows'
    });

    // 3. 트랜스코딩 설정
    if (config.transcodingEnabled) {
      await api.configureTranscoding({
        enableFFMpegProbeFormat: true,
        enableFFMpeg: true,
        transcodingTempPath: './jellyfin-transcode'
      });
    }
    
    // 4. HTTPS 설정
    await api.configureSecurity({
      enableHttps: true,
      domain: config.domain
    });
  }
}
```

---

## Phase 4: SFTP 지원 (2일)

### 6️⃣ SFTP 자동 설정

```bash
# src/storage/sftp-setup.ts

class SFTPManager {
  async setupSFTP(): Promise<void> {
    console.log('📤 SFTP 설정 중...');

    // SSH 서버가 이미 활성화되어 있다고 가정
    // OpenSSH SFTP 서브시스템만 활성화

    // 1. sftp-server 확인
    const hasSftpServer = await this.checkSFTPServer();
    if (!hasSftpServer) {
      await this.installSFTPServer();
    }

    // 2. chroot 환경 설정 (보안)
    await this.configureChrootJail();

    // 3. SFTP 접근 로그 활성화
    await this.enableSFTPLogging();

    console.log('✅ SFTP 설정 완료');
  }

  private async configureChrootJail(): Promise<void> {
    // SSH 사용자를 ~/data로 제한
    const sshConfig = `
Match User sftp-users
  ChrootDirectory /home/%u
  X11Forwarding no
  AllowTcpForwarding no
  ForceCommand internal-sftp -u 0077 -f LOCAL5 -l VERBOSE
`;
    // /etc/ssh/sshd_config.d/50-sftp.conf에 추가
  }

  private async enableSFTPLogging(): Promise<void> {
    // syslog에 SFTP 활동 기록
    const config = `
# syslog에 SFTP 활동 기록
Subsystem sftp /usr/lib/openssh/sftp-server -f LOCAL5 -l VERBOSE
`;
  }
}
```

---

## CLI 명령어

### 저장소 관리

```bash
# 저장소 초기화
brewnet storage init
  └─ 모든 저장소 설정 (Nextcloud, MinIO, Jellyfin)

# 저장소 추가
brewnet storage add /mnt/external
  └─ 새로운 저장소 경로 추가
brewnet storage add /mnt/media --type media
  └─ 미디어 전용 저장소 추가

# 저장소 목록
brewnet storage list
  └─ 모든 활성 저장소 표시

# 저장소 설정
brewnet storage quota set 1TB
  └─ 전체 저장소 용량 제한
brewnet storage quota set myapp 100GB --user
  └─ 사용자당 할당량 설정

# 저장소 정리
brewnet storage cleanup
  └─ 임시 파일 & 오래된 버전 삭제

# 모니터링
brewnet storage monitor
  └─ 저장소 사용량 실시간 모니터링
brewnet storage monitor --history 30d
  └─ 30일 사용량 추이 표시

# SFTP 관리
brewnet storage sftp enable
brewnet storage sftp add-user alice
brewnet storage sftp remove-user alice

# 백업
brewnet storage backup create
  └─ 현재 저장소 백업
brewnet storage backup restore backup-id
  └─ 백업에서 복구
brewnet storage backup schedule daily 02:00
  └─ 자동 백업 스케줄 설정
```

---

## Docker 통합

### 통합 docker-compose.yml

```yaml
version: '3.9'

services:
  # Nextcloud (웹 UI + 파일 관리)
  nextcloud:
    image: nextcloud:latest
    container_name: brewnet-nextcloud
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ~/.brewnet/storage/nextcloud:/var/www/html/data
    depends_on:
      - nextcloud-db
    networks:
      - brewnet-network

  nextcloud-db:
    image: mariadb:latest
    container_name: brewnet-nextcloud-db
    restart: unless-stopped
    volumes:
      - ~/.brewnet/storage/nextcloud-db:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: nextcloud
    networks:
      - brewnet-network

  # MinIO (S3 호환 객체 저장소)
  minio:
    image: minio/minio:latest
    container_name: brewnet-minio
    restart: unless-stopped
    command: minio server /data
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - ~/.brewnet/storage/minio:/data
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    networks:
      - brewnet-network

  # Jellyfin (동영상 스트리밍)
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: brewnet-jellyfin
    restart: unless-stopped
    ports:
      - "8096:8096"
    volumes:
      - ~/.brewnet/storage/media:/media:ro
      - ~/.brewnet/storage/jellyfin-config:/config
    networks:
      - brewnet-network

  # Redis 캐시 (성능 향상)
  redis:
    image: redis:latest
    container_name: brewnet-redis
    restart: unless-stopped
    volumes:
      - ~/.brewnet/storage/redis:/data
    networks:
      - brewnet-network

networks:
  brewnet-network:
    name: brewnet-network
```

---

## 모니터링 & 유지보수

### 저장소 모니터링 대시보드

```typescript
// src/storage/monitoring.ts

interface StorageMetrics {
  timestamp: Date;
  totalCapacity: number;
  usedSpace: number;
  availableSpace: number;
  usagePercentage: number;
  fileCount: number;
  directoryCount: number;
  largestFiles: Array<{ path: string; size: number }>;
  growthRate: number;        // 일일 증가량
  estimatedFullDate?: Date;  // 언제 가득 찰지 예상
}

class StorageMonitor {
  async getMetrics(): Promise<StorageMetrics> {
    // 저장소 사용량 계산
    const stats = await this.calculateStorageStats();
    
    // 성장률 계산 (지난 7일 기반)
    const growthRate = await this.calculateGrowthRate();
    
    // 저장소 만료 예상일 계산
    const estimatedFullDate = this.estimateFullDate(
      stats.availableSpace,
      growthRate
    );

    return {
      timestamp: new Date(),
      totalCapacity: stats.totalCapacity,
      usedSpace: stats.usedSpace,
      availableSpace: stats.availableSpace,
      usagePercentage: (stats.usedSpace / stats.totalCapacity) * 100,
      fileCount: stats.fileCount,
      directoryCount: stats.directoryCount,
      largestFiles: await this.findLargestFiles(),
      growthRate,
      estimatedFullDate
    };
  }

  async setupAlerts(): Promise<void> {
    const metrics = await this.getMetrics();

    // 80% 이상 사용 시 경고
    if (metrics.usagePercentage > 80) {
      console.warn('⚠️ 저장소 용량 경고: 80% 이상 사용');
    }

    // 1주일 내에 가득 찰 예상 시 심각 경고
    if (metrics.estimatedFullDate) {
      const daysUntilFull = Math.floor(
        (metrics.estimatedFullDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysUntilFull < 7) {
        console.error(`🚨 심각: 저장소가 ${daysUntilFull}일 내에 가득 찰 예상`);
      }
    }
  }

  private estimateFullDate(availableSpace: number, dailyGrowth: number): Date | undefined {
    if (dailyGrowth <= 0) return undefined;
    
    const daysUntilFull = availableSpace / dailyGrowth;
    const fullDate = new Date();
    fullDate.setDate(fullDate.getDate() + daysUntilFull);
    
    return fullDate;
  }
}
```

---

## 구현 일정

```
Week 1:
  Day 1-2: Nextcloud 설치 & 최적화
  Day 3: MinIO 설정 및 통합
  Day 4: SFTP 활성화
  Day 5: 모니터링 구현

Week 2:
  Day 1-2: Jellyfin 통합
  Day 3-4: CLI 명령어 구현
  Day 5: 통합 테스트 & 문서화
```

---

## 요약

### 구현으로 얻는 것
✅ 웹 UI 파일 관리 (Nextcloud)  
✅ S3 호환 API (MinIO)  
✅ SFTP 원격 접근  
✅ 동영상 스트리밍 (Jellyfin)  
✅ 자동 캐싱 & 압축  
✅ 용량 모니터링 & 알림  
✅ 자동 백업  

### 복잡도
- 기술 난이도: ⭐⭐⭐ (상)
- 예상 시간: 1-2주

---

**다음 단계**: Phase 1부터 순차적으로 구현
