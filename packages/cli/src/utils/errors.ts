/**
 * Brewnet CLI — Structured Error System (T014)
 *
 * All Brewnet errors carry a machine-readable code (BN001-BN010),
 * an HTTP-equivalent status, and a human-readable remediation hint.
 *
 * @module utils/errors
 */

export type BrewnetErrorCode =
  | 'BN001'
  | 'BN002'
  | 'BN003'
  | 'BN004'
  | 'BN005'
  | 'BN006'
  | 'BN007'
  | 'BN008'
  | 'BN009'
  | 'BN010';

export class BrewnetError extends Error {
  readonly code: BrewnetErrorCode;
  readonly httpStatus: number;
  readonly remediation: string;

  constructor(
    code: BrewnetErrorCode,
    message: string,
    httpStatus: number,
    remediation: string,
  ) {
    super(message);
    this.name = 'BrewnetError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.remediation = remediation;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Format the error for terminal display.
   *
   * Example output:
   *
   *   Error [BN001]: Docker daemon is not running
   *
   *     Docker is required to manage services. Please start Docker and try again.
   *
   *     Fix:
   *       macOS:  Open Docker Desktop
   *       Linux:  sudo systemctl start docker
   */
  format(): string {
    const lines: string[] = [
      `Error [${this.code}]: ${this.message}`,
      '',
      `  ${this.remediation}`,
    ];
    return lines.join('\n');
  }

  /**
   * Serialize the error for structured logging (JSONL).
   */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      remediation: this.remediation,
    };
  }

  // ---------------------------------------------------------------------------
  // Factory methods for every Brewnet error code
  // ---------------------------------------------------------------------------

  /**
   * BN001 — Docker daemon is not running (503 Service Unavailable).
   */
  static dockerNotRunning(): BrewnetError {
    return new BrewnetError(
      'BN001',
      'Docker daemon is not running',
      503,
      [
        'Docker is required to manage services. Please start Docker and try again.',
        '',
        '  Fix:',
        '    macOS:  Open Docker Desktop',
        '    Linux:  sudo systemctl start docker',
      ].join('\n'),
    );
  }

  /**
   * BN002 — Project directory already exists (409 Conflict).
   */
  static directoryConflict(name: string): BrewnetError {
    return new BrewnetError(
      'BN002',
      `Directory "${name}" already exists`,
      409,
      [
        'The project directory already exists. Choose a different project name or remove it first.',
        '',
        '  Fix:',
        `    rm -rf ${name}          # remove existing directory`,
        `    brewnet create-app ${name}-v2   # use a different name`,
      ].join('\n'),
    );
  }

  /**
   * BN002 — Port already in use (409 Conflict).
   */
  static portConflict(port: number, processInfo?: string): BrewnetError {
    const detail = processInfo
      ? ` (in use by ${processInfo})`
      : '';
    return new BrewnetError(
      'BN002',
      `Port ${port} is already in use${detail}`,
      409,
      [
        `Port ${port} is required by one of your selected services.`,
        '',
        '  Fix:',
        `    1. Find the process:  lsof -i :${port}`,
        `    2. Stop it:           kill <PID>`,
        '    3. Or choose a different port in your configuration.',
      ].join('\n'),
    );
  }

  /**
   * BN003 — SSL certificate issuance failed (500 Internal Server Error).
   */
  static sslFailed(domain: string): BrewnetError {
    return new BrewnetError(
      'BN003',
      `SSL certificate issuance failed for ${domain}`,
      500,
      [
        'Let\'s Encrypt could not issue a certificate. Common causes:',
        '',
        '  - DNS records not yet propagated (wait a few minutes and retry)',
        '  - Domain does not resolve to this server\'s public IP',
        '  - Rate limit reached (max 5 duplicates per week)',
        '',
        '  Fix:',
        `    1. Verify DNS:   dig +short ${domain}`,
        '    2. Retry:        brewnet domain ssl ' + domain,
        '    3. Use Cloudflare Tunnel for automatic SSL instead.',
      ].join('\n'),
    );
  }

  /**
   * BN004 — Invalid license key (401 Unauthorized).
   */
  static invalidLicense(): BrewnetError {
    return new BrewnetError(
      'BN004',
      'Invalid or expired license key',
      401,
      [
        'Your Brewnet Pro/Team license key is invalid or has expired.',
        '',
        '  Fix:',
        '    1. Check your key at https://brewnet.dev/account',
        '    2. Update it:  brewnet config set license <KEY>',
        '    3. Contact support if the issue persists.',
      ].join('\n'),
    );
  }

  /**
   * BN005 — Rate limit exceeded (429 Too Many Requests).
   */
  static rateLimited(): BrewnetError {
    return new BrewnetError(
      'BN005',
      'Rate limit exceeded',
      429,
      [
        'Too many requests in a short period. Please wait and try again.',
        '',
        '  Fix:',
        '    Wait a few minutes before retrying.',
        '    If using CI, consider adding a delay between requests.',
      ].join('\n'),
    );
  }

  /**
   * BN006 — Boilerplate clone failed (500 Internal Server Error).
   */
  static cloneFailed(stackId: string): BrewnetError {
    return new BrewnetError(
      'BN006',
      `Failed to clone boilerplate stack "${stackId}"`,
      500,
      [
        'Could not download the boilerplate from GitHub. Common causes:',
        '',
        '  - No internet connection',
        '  - GitHub is temporarily unavailable',
        '  - The stack branch does not exist on the remote',
        '',
        '  Fix:',
        '    1. Check your internet connection',
        '    2. Verify connectivity:  curl -I https://github.com',
        '    3. Retry:  brewnet create-app <name> --stack ' + stackId,
      ].join('\n'),
    );
  }

  /**
   * BN006 — Health check timed out after scaffolding (500 Internal Server Error).
   */
  static healthCheckTimeout(timeoutSec: number): BrewnetError {
    return new BrewnetError(
      'BN006',
      `Application health check timed out after ${timeoutSec}s`,
      500,
      [
        'The application container started but did not respond to health checks in time.',
        '',
        '  Containers are still running. To diagnose:',
        '    docker compose logs backend   # check for startup errors',
        '    docker compose logs           # check all services',
        '',
        '  Fix:',
        '    1. Check logs for errors (missing env vars, port conflicts, build errors)',
        '    2. Run "make down" to stop containers',
        '    3. Retry:  brewnet create-app <name> --stack <STACK_ID>',
      ].join('\n'),
    );
  }

  /**
   * BN006 — Build failed (500 Internal Server Error).
   */
  static buildFailed(logs?: string): BrewnetError {
    const logSnippet = logs
      ? `\n\n  Build output (last lines):\n    ${logs.split('\n').slice(-5).join('\n    ')}`
      : '';
    return new BrewnetError(
      'BN006',
      'Application build failed',
      500,
      [
        'The build process exited with a non-zero status.',
        '',
        '  Fix:',
        '    1. Check your build command in brewnet.yml',
        '    2. Run the build locally to reproduce the error',
        '    3. Review logs:  brewnet logs --build',
        logSnippet,
      ].join('\n'),
    );
  }

  /**
   * BN007 — Invalid Git repository (400 Bad Request).
   */
  static invalidGitRepo(path: string): BrewnetError {
    return new BrewnetError(
      'BN007',
      `Not a valid Git repository: ${path}`,
      400,
      [
        'The specified path is not a Git repository or is inaccessible.',
        '',
        '  Fix:',
        `    1. Verify the path exists:  ls -la ${path}`,
        `    2. Initialize if needed:    git init ${path}`,
        '    3. Or clone an existing repo:  git clone <url>',
      ].join('\n'),
    );
  }

  /**
   * BN008 — Resource not found (404 Not Found).
   */
  static resourceNotFound(resource: string): BrewnetError {
    return new BrewnetError(
      'BN008',
      `Resource not found: ${resource}`,
      404,
      [
        `The requested resource "${resource}" could not be found.`,
        '',
        '  Fix:',
        '    1. Check the name or ID for typos',
        '    2. List available resources:  brewnet status',
        '    3. The resource may have been removed or renamed.',
      ].join('\n'),
    );
  }

  /**
   * BN009 — Database error (500 Internal Server Error).
   */
  static databaseError(detail: string): BrewnetError {
    return new BrewnetError(
      'BN009',
      `Database error: ${detail}`,
      500,
      [
        'An internal database operation failed.',
        '',
        '  Fix:',
        '    1. Check disk space:  df -h',
        '    2. Verify DB file permissions:  ls -la ~/.brewnet/db/',
        '    3. Try resetting the local DB:  brewnet config reset-db',
        '    4. If the issue persists, file a bug report.',
      ].join('\n'),
    );
  }

  /**
   * BN010 — Feature requires Pro plan (403 Forbidden).
   */
  static proRequired(feature: string): BrewnetError {
    return new BrewnetError(
      'BN010',
      `"${feature}" requires a Brewnet Pro subscription`,
      403,
      [
        'This feature is available on the Pro plan ($9/mo) or Team plan ($29/mo/server).',
        '',
        '  Upgrade:',
        '    https://brewnet.dev/pricing',
        '',
        '  Activate:',
        '    brewnet config set license <KEY>',
      ].join('\n'),
    );
  }
}

/**
 * Type-guard to check if an unknown value is a BrewnetError.
 */
export function isBrewnetError(err: unknown): err is BrewnetError {
  return err instanceof BrewnetError;
}
