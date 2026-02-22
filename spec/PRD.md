# HomeHub - Product Requirements Document (PRD)

> Complete specification for HomeHub - Home Server Management Platform

## Document Info
- **Version**: 2.0
- **Status**: Draft
- **Last Updated**: 2024

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [User Journey](#3-user-journey)
4. [Business Model](#4-business-model)
5. [Feature Specifications](#5-feature-specifications) → See PRD_FEATURES.md
6. [Technical Architecture](#6-technical-architecture) → See PRD_TECHNICAL.md
7. [Database Schema](#7-database-schema) → See PRD_TECHNICAL.md
8. [API Specification](#8-api-specification) → See PRD_API.md
9. [Development Roadmap](#9-development-roadmap)

---

# 1. Executive Summary

## 1.1 Problem Statement

홈서버 구축에 필요한 작업들:

| 영역 | 필요 작업 | 어려움 |
|------|----------|--------|
| 네트워크 | 포트포워딩, DDNS, 방화벽 | CLI 명령어, 라우터 설정 |
| 개발환경 | Node/Python/Java 설치 | 버전 관리, 충돌 |
| Docker | 컨테이너 관리, Compose | 명령어 암기, 문법 |
| 배포 | Git clone, 빌드, 실행 | 프로세스 관리, 로그 |
| 도메인 | DNS, SSL, 리버스 프록시 | nginx 설정 |
| 보안 | 방화벽, IP 차단, 로그 | iptables, 설정 파일 |

**문제점**: 각 단계마다 다른 도구, 다른 문법, 다른 학습 곡선

## 1.2 Solution

**HomeHub** = 원커맨드 설치 + CLI 도구 + 웹 대시보드

```bash
curl -fsSL https://get.homehub.io | bash
```

## 1.3 Value Proposition

| Before | After |
|--------|-------|
| 서버 설정 2-3일 | 30분 내 완료 |
| CLI 수십 개 암기 | GUI 클릭 |
| 설정 파일 직접 편집 | 자동 생성 |
| 수동 SSL 갱신 | 자동 갱신 |
| 분산된 도구들 | 통합 대시보드 |

---

# 2. Product Vision

## 2.1 Vision Statement

> "누구나 자신만의 클라우드를 소유할 수 있는 세상"

## 2.2 Core Principles

1. **Zero Config** - 기본값으로 바로 동작
2. **Secure by Default** - 보안은 기본
3. **Transparent** - 모든 동작이 명확히 보임
4. **Reversible** - 실수해도 복구 가능
5. **Offline First** - 핵심 기능은 오프라인 동작

## 2.3 Target Users

### Primary: 사이드 프로젝트 개발자
- 개인 프로젝트 셀프호스팅
- 클라우드 비용 절감 원함
- Docker는 알지만 네트워크 설정에서 막힘

### Secondary: 홈랩 입문자
- Synology NAS 사용 중, 확장 원함
- 백엔드/인프라 경험 부족
- GUI 선호

### Tertiary: 소규모 팀 리드
- 내부 도구 셀프호스팅
- 팀원 접근 권한 관리 필요
- 비용과 보안 모두 중요

---

# 3. User Journey

## 3.1 Complete Flow

```
[발견] → [설치] → [초기설정] → [런타임] → [배포] → [도메인] → [보안] → [Pro 업그레이드] → [대시보드]
```

### Phase 1: Installation

```bash
$ curl -fsSL https://get.homehub.io | bash

🏠 HomeHub Installer v1.0.0

[1/5] Checking system...          ✓
[2/5] Installing dependencies...  ✓
[3/5] Setting up Docker...        ✓
[4/5] Configuring network...      ✓
[5/5] Initializing database...    ✓

✅ HomeHub installed successfully!
```

### Phase 2: Initial Setup

```bash
$ homehub init

🔍 System Check
─────────────────────────────────
OS:        macOS 14.0 (Apple Silicon)
Docker:    ✓ Running (24.0.5)
Git:       ✓ Installed (2.42.0)

📡 Network
Public IP:  123.45.67.89
Local IP:   192.168.1.100
⚠️  Dynamic IP detected → DDNS 권장
```

### Phase 3: Runtime Setup

```bash
$ homehub runtime install node 20
$ homehub runtime install python 3.12

✓ Node.js 20.10.0 installed
✓ Python 3.12.0 installed
```

### Phase 4: First Deployment

```bash
$ cd my-nextjs-app
$ homehub deploy

🚀 Deploying my-nextjs-app
─────────────────────────────────
[1/6] Detecting project... → Next.js 14
[2/6] Building Docker image... ✓
[3/6] Starting container... ✓
[4/6] Health check... ✓

✅ Deployed: http://localhost:3001
```

### Phase 5: Domain + SSL

```bash
$ homehub domain add app.example.com --app my-nextjs-app

🌐 Adding domain
─────────────────────────────────
[1/4] Verifying DNS... ✓
[2/4] Issuing SSL... ✓ (Let's Encrypt)
[3/4] Configuring nginx... ✓
[4/4] Testing... ✓

✅ Live at: https://app.example.com
```

### Phase 6: Security

```bash
$ homehub acl allow ip 192.168.1.0/24 --description "Home"
$ homehub acl deny country CN,RU --description "High-risk"

✓ 2 rules added
```

### Phase 7: Pro Upgrade

```bash
$ homehub activate HH-PRO-XXXX-XXXX

💎 HomeHub Pro Activated!
─────────────────────────────────
✓ Web Dashboard
✓ Auto-deployment
✓ Advanced Security
✓ Access Logs

$ homehub dashboard
→ Opening http://localhost:3000
```

---

# 4. Business Model

## 4.1 Pricing Tiers

| | 🆓 Free | 💎 Pro | 🏢 Team |
|---|:---:|:---:|:---:|
| **가격** | $0/월 | $9/월 | $29/월/서버 |
| **대상** | 개인 학습 | 개인 운영 | 팀 운영 |
| CLI 전체 기능 | ✅ | ✅ | ✅ |
| 웹 대시보드 | ❌ | ✅ | ✅ |
| 자동 배포 | ❌ | ✅ | ✅ |
| Rate Limiting | ❌ | ✅ | ✅ |
| Geo Blocking | ❌ | ✅ | ✅ |
| 접근 로그 | ❌ | ✅ | ✅ |
| 팀 멤버 관리 | ❌ | ❌ | ✅ |
| 멀티 서버 | ❌ | ❌ | ✅ |
| 감사 로그 | ❌ | ❌ | ✅ |

## 4.2 Feature Matrix

### 4.2.1 Installation & Setup

| Feature | Free | Pro | Team |
|---------|:----:|:---:|:----:|
| One-line 설치 | ✅ | ✅ | ✅ |
| Docker 자동 설치 | ✅ | ✅ | ✅ |
| 시스템 진단 | ✅ | ✅ | ✅ |
| 자동 업데이트 | ❌ | ✅ | ✅ |

### 4.2.2 Runtime Management

| Feature | Free | Pro | Team |
|---------|:----:|:---:|:----:|
| Node.js (nvm) | ✅ | ✅ | ✅ |
| Python (pyenv) | ✅ | ✅ | ✅ |
| Java (SDKMAN) | ✅ | ✅ | ✅ |
| Go, Ruby, Rust | ✅ | ✅ | ✅ |
| 버전 자동 감지 | ✅ | ✅ | ✅ |

### 4.2.3 Docker Management

| Feature | Free | Pro | Team |
|---------|:----:|:---:|:----:|
| 컨테이너 관리 | CLI | GUI | GUI |
| 실시간 로그 | CLI | GUI | GUI |
| 리소스 모니터링 | ❌ | ✅ | ✅ |
| Compose GUI | ❌ | ✅ | ✅ |

### 4.2.4 Deployment

| Feature | Free | Pro | Team |
|---------|:----:|:---:|:----:|
| Git 배포 | ✅ | ✅ | ✅ |
| 자동 감지 | ✅ | ✅ | ✅ |
| Dockerfile 생성 | ✅ | ✅ | ✅ |
| Webhook 자동 배포 | ❌ | ✅ | ✅ |
| 롤백 | ❌ | ✅ | ✅ |
| Blue-Green | ❌ | ❌ | ✅ |

### 4.2.5 Domain & SSL

| Feature | Free | Pro | Team |
|---------|:----:|:---:|:----:|
| DDNS 설정 | 수동 | 자동 | 자동 |
| 커스텀 도메인 | 1개 | 무제한 | 무제한 |
| SSL 자동 발급 | ❌ | ✅ | ✅ |
| SSL 자동 갱신 | ❌ | ✅ | ✅ |
| 와일드카드 SSL | ❌ | ✅ | ✅ |
| 리버스 프록시 | ❌ | ✅ | ✅ |

### 4.2.6 Security & ACL

| Feature | Free | Pro | Team |
|---------|:----:|:---:|:----:|
| IP 화이트/블랙리스트 | CLI | GUI | GUI |
| Rate Limiting | ❌ | ✅ | ✅ |
| Geo Blocking | ❌ | ✅ | ✅ |
| 접근 로그 | ❌ | ✅ | ✅ |
| 실시간 알림 | ❌ | ✅ | ✅ |
| 2FA | ❌ | ✅ | ✅ |

### 4.2.7 Team Features

| Feature | Free | Pro | Team |
|---------|:----:|:---:|:----:|
| 팀 멤버 초대 | ❌ | ❌ | ✅ |
| 역할 기반 권한 | ❌ | ❌ | ✅ |
| 감사 로그 | ❌ | ❌ | ✅ |
| API 키 관리 | ❌ | ❌ | ✅ |

## 4.3 License System

### Device Fingerprint

```typescript
interface DeviceFingerprint {
  macAddress: string;
  hardwareUUID: string;
  hostname: string;
  platform: string;
  arch: string;
}

// SHA-256 해시로 deviceId 생성
const deviceId = sha256(JSON.stringify(fingerprint));
```

### Validation Flow

```
Client                    License Server
  │                            │
  │ 1. Activate Request        │
  │ {licenseKey, deviceId}     │
  │ ──────────────────────────>│
  │                            │
  │ 2. Validation              │
  │    - Key valid?            │
  │    - Device limit?         │
  │    - Expired?              │
  │                            │
  │ 3. License Token           │
  │ {valid, plan, features,    │
  │  expiresAt, token}         │
  │<────────────────────────── │
  │                            │
  │ 4. Store locally           │
  │ ~/.homehub/license.json    │
  │                            │
```

### Offline Support

- 7일 오프라인 grace period
- JWT 토큰 로컬 저장
- 만료 전 온라인 체크 필요

---

# 9. Development Roadmap

## Phase 1: Foundation (4 weeks)
- CLI scaffold
- Docker integration
- Basic deployment
- System monitoring

## Phase 2: Networking (3 weeks)
- Domain management
- SSL automation
- Reverse proxy
- DDNS integration

## Phase 3: Security (3 weeks)
- ACL system
- Firewall integration
- Rate limiting
- Access logging

## Phase 4: Dashboard (4 weeks)
- Next.js setup
- License system
- UI components
- Real-time updates

## Phase 5: Polish (2 weeks)
- Testing
- Documentation
- Performance
- Beta release

---

# Related Documents

- **PRD_FEATURES.md** - Detailed feature specifications
- **PRD_TECHNICAL.md** - Technical architecture & database
- **PRD_API.md** - CLI commands & API reference
- **SPEC.md** - Complete technical specification
