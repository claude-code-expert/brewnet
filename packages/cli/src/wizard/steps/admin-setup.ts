/**
 * Pre-Step: Admin Account Setup
 *
 * Collects admin username and password before any Docker installation.
 * The single credential set is propagated to all enabled services.
 *
 * @module wizard/steps/admin-setup
 */

import { input, password } from '@inquirer/prompts';
import chalk from 'chalk';
import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Credential propagation targets (informational display)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------

/**
 * Run Pre-Step: Admin Account Setup.
 *
 * Prompts for admin username and password.
 * Password is auto-generated (20 chars); user can accept or enter custom.
 * Shows which services will receive these credentials.
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with admin credentials set
 */
export async function runAdminSetupStep(state: WizardState): Promise<WizardState> {
  const next = structuredClone(state);

  // -------------------------------------------------------------------------
  // 1. Header
  // -------------------------------------------------------------------------
  console.log();
  console.log(chalk.bold.cyan('  Pre-Step') + chalk.bold(' — Admin Account'));
  console.log(chalk.dim('  Set credentials before Docker installation'));
  console.log(chalk.dim('  These credentials are propagated to all enabled services'));
  console.log();

  // -------------------------------------------------------------------------
  // 2. App overview
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  사용자 선택에 따라 다음의 앱이 자동으로 세팅됩니다'));
  console.log(chalk.dim('  모든 서비스는 Docker 컨테이너로 실행되며, 선택한 항목만 설치됩니다.'));
  console.log();

  const APP_LIST = [
    {
      name: 'Web Server',
      access: 'http://localhost/',
      info: 'Traefik (기본) · Nginx · Caddy 중 선택 — 리버스 프록시 및 서비스 라우팅',
    },
    {
      name: 'Traefik Dashboard',
      access: 'http://localhost/dashboard/',
      info: '로그인: <아이디> / <비밀번호> (BasicAuth)',
    },
    {
      name: 'Gitea (Git)',
      access: 'http://localhost/git/',
      info: '셀프 호스팅 Git 서버 — 초기 접속 시 관리자 계정 직접 생성',
    },
    {
      name: 'Nextcloud (File Server)',
      access: 'http://localhost/cloud',
      info: '로그인: <아이디> / <비밀번호>',
    },
    {
      name: 'MinIO Console (Object Storage)',
      access: 'http://localhost/minio',
      info: 'S3 호환 오브젝트 스토리지 — 로그인: <아이디> / <비밀번호>',
    },
    {
      name: 'FileBrowser',
      access: 'http://localhost/files',
      info: '웹 기반 파일 관리자 — 로그인: admin / <비밀번호>',
    },
    {
      name: 'PostgreSQL / MySQL',
      access: 'port 5432 / 3306 (내부 전용)',
      info: '관계형 DB — Docker 내부 네트워크 전용, 외부 포트 미노출',
    },
    {
      name: 'Redis · Valkey · KeyDB',
      access: 'port 6379 (내부 전용)',
      info: '캐시 서버 — Docker 내부 네트워크 전용',
    },
    {
      name: 'pgAdmin (DB Admin UI)',
      access: 'http://localhost/pgadmin',
      info: 'PostgreSQL 웹 관리 도구 — 로그인: <아이디>@brewnet.dev / <비밀번호>',
    },
    {
      name: 'Jellyfin (Media Server)',
      access: 'http://localhost:8096/jellyfin/',
      info: '미디어 스트리밍 서버 — 초기 접속 시 언어 및 관리자 계정 설정',
    },
    {
      name: 'SSH Server (OpenSSH)',
      access: 'ssh -p 2222 <아이디>@host',
      info: 'SSH 원격 접속 및 SFTP — 로그인: <아이디> / <비밀번호>',
    },
    {
      name: 'Mail Server',
      access: 'SMTP 25/587 · IMAP 143/993',
      info: '도메인 필요 — docker exec setup email add user@domain 으로 계정 생성',
    },
    {
      name: 'Cloudflare Tunnel',
      access: '자동 외부 URL 발급',
      info: '무료 공개 URL 터널링 — 포트 포워딩·공인 IP 없이 외부 접속 가능',
    },
  ] as const;

  const maxNameLen = Math.max(...APP_LIST.map((a) => a.name.length));
  for (const app of APP_LIST) {
    const namePadded = app.name.padEnd(maxNameLen);
    console.log(`  ${chalk.cyan(namePadded)}  ${chalk.dim(app.access)}`);
    console.log(`  ${chalk.dim('ℹ')}  ${chalk.dim(app.info)}`);
  }

  console.log(
    chalk.dim('  Java, Python, Go, Rust, Kotlin, Node.js 및 관련 프레임워크') +
    chalk.dim(' 보일러플레이트 세팅과 빌드 & 배포 제공'),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 3. Username
  // -------------------------------------------------------------------------
  const adminUsername = await input({
    message: 'Admin username',
    default: next.admin.username || 'admin',
  });
  next.admin.username = adminUsername;

  // -------------------------------------------------------------------------
  // 4. Password — direct input (masked)
  // -------------------------------------------------------------------------
  console.log();
  console.log(chalk.dim('  비밀번호는 모든 서비스에 동일하게 적용됩니다. 8자 이상.'));

  let adminPassword = '';
  while (true) {
    const pw = await password({
      message: 'Admin password',
      mask: '*',
      validate: (value: string) => {
        if (value.length < 8) return '8자 이상 입력하세요';
        return true;
      },
    });

    const pw2 = await password({
      message: 'Confirm password',
      mask: '*',
    });

    if (pw === pw2) {
      adminPassword = pw;
      break;
    }

    console.log(chalk.red('  비밀번호가 일치하지 않습니다. 다시 입력하세요.'));
    console.log();
  }

  next.admin.password = adminPassword;
  next.admin.storage = 'local';

  console.log();
  console.log(chalk.green('  Admin account configured.'));
  console.log();

  return next;
}
