/**
 * T085-T089 — Step 4: Domain & Network
 *
 * Pure functions and interactive wizard step for configuring domain provider,
 * SSL mode, Cloudflare Tunnel, and optional Mail Server.
 *
 * Pure functions:
 *   - applyDomainDefaults  — Apply provider-specific defaults to wizard state
 *   - isMailServerAllowed  — Check if mail server is available (non-local only)
 *   - buildDomainConfig    — Clean / normalize a DomainConfig object
 *
 * Interactive:
 *   - runDomainNetworkStep — Step 4 wizard UI
 *
 * @module wizard/steps/domain-network
 */

import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type {
  WizardState,
  DomainConfig,
  DomainProvider,
  SslMode,
  FreeDomainTld,
} from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Apply provider-specific defaults to the wizard state's domain configuration.
 *
 * Uses `structuredClone` to avoid mutating the input state.
 *
 * Behaviour per provider:
 *   - `'local'`:      ssl='self-signed', cloudflare disabled, preserves existing name
 *   - `'freedomain'`: ssl='cloudflare', cloudflare forced ON,
 *                      appends freeDomainTld to name if not already present
 *   - `'custom'`:     ssl='letsencrypt' (default, preserves existing valid ssl),
 *                      cloudflare enabled by default
 *
 * @param state    - Current wizard state
 * @param provider - The domain provider to apply
 * @returns A new WizardState with provider-specific defaults applied
 */
export function applyDomainDefaults(
  state: WizardState,
  provider: DomainProvider,
): WizardState {
  const next = structuredClone(state);
  next.domain.provider = provider;

  switch (provider) {
    case 'local': {
      next.domain.ssl = 'self-signed';
      next.domain.cloudflare.enabled = false;
      next.domain.cloudflare.tunnelToken = '';
      next.domain.cloudflare.tunnelName = '';
      // Preserve existing name — caller sets .local suffix in interactive step
      break;
    }

    case 'freedomain': {
      next.domain.ssl = 'cloudflare';
      next.domain.cloudflare.enabled = true; // forced ON for freedomain

      // Append freeDomainTld if not already present
      const tld = next.domain.freeDomainTld || '.dpdns.org';
      if (next.domain.name && !next.domain.name.endsWith(tld)) {
        next.domain.name = next.domain.name + tld;
      }
      break;
    }

    case 'custom': {
      // Default SSL to letsencrypt for custom domains
      next.domain.ssl = 'letsencrypt';
      // Cloudflare Tunnel default ON for custom domains
      next.domain.cloudflare.enabled = true;
      break;
    }
  }

  return next;
}

/**
 * Check whether the mail server option should be available.
 * Mail requires a real domain (not 'local').
 *
 * @param state - Current wizard state
 * @returns true if mail server can be enabled
 */
export function isMailServerAllowed(state: WizardState): boolean {
  return state.domain.provider !== 'local';
}

/**
 * Build a clean DomainConfig from raw selections.
 *
 * Enforces provider-specific invariants:
 *   - `'local'`:      forces cloudflare off, clears tunnel fields
 *   - `'freedomain'`: forces cloudflare ON
 *   - `'custom'`:     preserves cloudflare settings as-is
 *
 * Always returns a new object — never mutates the input.
 *
 * @param selections - A full DomainConfig
 * @returns A clean DomainConfig copy
 */
export function buildDomainConfig(selections: DomainConfig): DomainConfig {
  const config: DomainConfig = {
    ...selections,
    cloudflare: { ...selections.cloudflare },
  };

  switch (config.provider) {
    case 'local': {
      config.cloudflare.enabled = false;
      config.cloudflare.tunnelToken = '';
      config.cloudflare.tunnelName = '';
      break;
    }

    case 'freedomain': {
      config.cloudflare.enabled = true;
      break;
    }

    case 'custom': {
      // Preserve cloudflare settings as-is
      break;
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Interactive Step Function (T085-T088)
// ---------------------------------------------------------------------------

/**
 * FreeDomain TLD choices for the select prompt.
 */
const FREE_DOMAIN_TLD_CHOICES: Array<{ name: string; value: FreeDomainTld }> = [
  { name: '.dpdns.org', value: '.dpdns.org' },
  { name: '.qzz.io', value: '.qzz.io' },
  { name: '.us.kg', value: '.us.kg' },
];

/**
 * Display the 8-step FreeDomain (DigitalPlat) setup guide.
 * Purely informational — no user input collected.
 */
function displayFreeDomainGuide(): void {
  console.log();
  console.log(chalk.bold('  FreeDomain Setup Guide (DigitalPlat)'));
  console.log(chalk.dim('  Follow these steps to register your free domain:'));
  console.log();
  console.log(chalk.dim('    1. Visit https://digitalplat.org and create an account'));
  console.log(chalk.dim('    2. Verify your email address'));
  console.log(chalk.dim('    3. Navigate to the domain registration page'));
  console.log(chalk.dim('    4. Search for your desired subdomain'));
  console.log(chalk.dim('    5. Select your preferred TLD (.dpdns.org, .qzz.io, .us.kg)'));
  console.log(chalk.dim('    6. Complete the registration'));
  console.log(chalk.dim('    7. Configure DNS to point to your server IP'));
  console.log(chalk.dim('    8. Set up Cloudflare Tunnel for secure access'));
  console.log();
}

/**
 * Run Step 4: Domain & Network.
 *
 * Interactively collects domain provider, name, SSL mode, Cloudflare Tunnel
 * configuration, and optional Mail Server settings.
 *
 * Flow:
 *   1. Display header "Step 4/7 — Domain & Network"
 *   2. Domain provider selection (local / freedomain / custom)
 *   3. Provider-specific configuration:
 *      - local:      set name to <projectName>.local, apply defaults
 *      - freedomain: TLD select, setup guide, domain name, tunnel token
 *      - custom:     domain name, SSL method, cloudflare toggle + token
 *   4. Conditional Mail Server (if non-local provider)
 *   5. Apply applyDomainDefaults and buildDomainConfig
 *   6. Show summary
 *   7. Return updated state
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with domain & network configuration
 */
export async function runDomainNetworkStep(
  state: WizardState,
): Promise<WizardState> {
  const next = structuredClone(state);

  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 4/7') + chalk.bold(' — Domain & Network'),
  );
  console.log(
    chalk.dim(
      '  Configure domain provider, SSL, and network access',
    ),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. Domain provider selection
  // -------------------------------------------------------------------------
  const provider = await select<DomainProvider>({
    message: 'Domain provider',
    choices: [
      {
        name: 'Local — access via .local hostname (LAN only)',
        value: 'local',
      },
      {
        name: 'FreeDomain — free subdomain via DigitalPlat (.dpdns.org, .qzz.io, .us.kg)',
        value: 'freedomain',
      },
      {
        name: 'Custom — use your own domain',
        value: 'custom',
      },
    ],
    default: next.domain.provider,
  });

  console.log();

  // -------------------------------------------------------------------------
  // 3. Provider-specific configuration
  // -------------------------------------------------------------------------

  if (provider === 'local') {
    // -----------------------------------------------------------------------
    // Local: set name to <projectName>.local
    // -----------------------------------------------------------------------
    const localName = `${next.projectName}.local`;
    next.domain.name = localName;
    next.domain.provider = provider;

    console.log(chalk.dim(`  Domain: ${localName}`));
    console.log(chalk.dim('  SSL: self-signed certificate'));
    console.log(chalk.dim('  Cloudflare Tunnel: disabled (local network only)'));
    console.log();

  } else if (provider === 'freedomain') {
    // -----------------------------------------------------------------------
    // FreeDomain: TLD select, guide, name input, tunnel token
    // -----------------------------------------------------------------------

    // TLD selection
    const tld = await select<FreeDomainTld>({
      message: 'FreeDomain TLD',
      choices: FREE_DOMAIN_TLD_CHOICES,
      default: next.domain.freeDomainTld || '.dpdns.org',
    });
    next.domain.freeDomainTld = tld;

    // Display 8-step setup guide
    displayFreeDomainGuide();

    // Domain name input (without TLD — appended automatically)
    const subdomainName = await input({
      message: `Domain name (without ${tld})`,
      default: next.domain.name
        ? next.domain.name.replace(new RegExp(`\\${tld.replace('.', '\\.')}$`), '')
        : next.projectName,
      validate: (value: string) => {
        if (!value.trim()) return 'Domain name is required';
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(value.trim())) {
          return 'Domain name must contain only letters, numbers, and hyphens';
        }
        return true;
      },
    });
    next.domain.name = subdomainName.trim() + tld;
    next.domain.provider = provider;

    console.log();

    // Cloudflare Tunnel token (required for freedomain)
    console.log(chalk.bold('  Cloudflare Tunnel'));
    console.log(chalk.dim('  Required for FreeDomain — enables secure external access'));
    console.log();

    const tunnelToken = await input({
      message: 'Cloudflare Tunnel token',
      default: next.domain.cloudflare.tunnelToken || '',
      validate: (value: string) => {
        if (!value.trim()) return 'Tunnel token is required for FreeDomain';
        return true;
      },
    });
    next.domain.cloudflare.tunnelToken = tunnelToken.trim();

    const tunnelName = await input({
      message: 'Cloudflare Tunnel name',
      default: next.domain.cloudflare.tunnelName || next.projectName,
    });
    next.domain.cloudflare.tunnelName = tunnelName.trim();

    console.log();

  } else {
    // -----------------------------------------------------------------------
    // Custom: domain name, SSL method, cloudflare toggle + token
    // -----------------------------------------------------------------------

    // Domain name input
    const domainName = await input({
      message: 'Custom domain name (e.g., example.com)',
      default: next.domain.name || '',
      validate: (value: string) => {
        if (!value.trim()) return 'Domain name is required';
        if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(value.trim())) {
          return 'Invalid domain name format';
        }
        return true;
      },
    });
    next.domain.name = domainName.trim();
    next.domain.provider = provider;

    console.log();

    // SSL method selection
    const sslMode = await select<SslMode>({
      message: 'SSL certificate method',
      choices: [
        {
          name: 'Self-signed — local development only',
          value: 'self-signed',
        },
        {
          name: "Let's Encrypt — free, auto-renewed certificates (recommended)",
          value: 'letsencrypt',
        },
        {
          name: 'Cloudflare — managed via Cloudflare proxy',
          value: 'cloudflare',
        },
      ],
      default: next.domain.ssl || 'letsencrypt',
    });
    next.domain.ssl = sslMode;

    console.log();

    // Cloudflare Tunnel toggle
    console.log(chalk.bold('  Cloudflare Tunnel'));
    console.log(chalk.dim('  Enables secure external access without port forwarding'));
    console.log();

    const tunnelEnabled = await confirm({
      message: 'Enable Cloudflare Tunnel?',
      default: next.domain.cloudflare.enabled ?? true,
    });
    next.domain.cloudflare.enabled = tunnelEnabled;

    if (tunnelEnabled) {
      const tunnelToken = await input({
        message: 'Cloudflare Tunnel token',
        default: next.domain.cloudflare.tunnelToken || '',
        validate: (value: string) => {
          if (!value.trim()) return 'Tunnel token is required when Cloudflare Tunnel is enabled';
          return true;
        },
      });
      next.domain.cloudflare.tunnelToken = tunnelToken.trim();

      const tunnelName = await input({
        message: 'Cloudflare Tunnel name',
        default: next.domain.cloudflare.tunnelName || next.projectName,
      });
      next.domain.cloudflare.tunnelName = tunnelName.trim();
    } else {
      next.domain.cloudflare.tunnelToken = '';
      next.domain.cloudflare.tunnelName = '';
    }

    console.log();
  }

  // -------------------------------------------------------------------------
  // 4. Apply domain defaults (provider-specific invariants)
  // -------------------------------------------------------------------------
  const withDefaults = applyDomainDefaults(next, provider);

  // -------------------------------------------------------------------------
  // 5. Build clean domain config
  // -------------------------------------------------------------------------
  withDefaults.domain = buildDomainConfig(withDefaults.domain);

  // -------------------------------------------------------------------------
  // 6. Conditional Mail Server
  // -------------------------------------------------------------------------
  if (isMailServerAllowed(withDefaults)) {
    console.log(chalk.bold('  Mail Server'));
    console.log(chalk.dim('  docker-mailserver (SMTP/IMAP) — requires a real domain'));
    console.log();

    const enableMail = await confirm({
      message: 'Enable Mail Server (docker-mailserver)?',
      default: withDefaults.servers.mailServer.enabled,
    });
    withDefaults.servers.mailServer.enabled = enableMail;
    console.log();
  } else {
    // Local domain — mail server not available
    withDefaults.servers.mailServer.enabled = false;
  }

  // -------------------------------------------------------------------------
  // 7. Summary
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Domain & Network Summary'));
  console.log(chalk.dim(`    Provider:    ${withDefaults.domain.provider}`));
  console.log(chalk.dim(`    Domain:      ${withDefaults.domain.name}`));
  console.log(chalk.dim(`    SSL:         ${withDefaults.domain.ssl}`));

  if (withDefaults.domain.cloudflare.enabled) {
    console.log(chalk.dim(`    Tunnel:      enabled (${withDefaults.domain.cloudflare.tunnelName})`));
  } else {
    console.log(chalk.dim('    Tunnel:      disabled'));
  }

  if (withDefaults.domain.provider === 'freedomain') {
    console.log(chalk.dim(`    TLD:         ${withDefaults.domain.freeDomainTld}`));
  }

  if (withDefaults.servers.mailServer.enabled) {
    console.log(chalk.dim('    Mail Server: enabled (docker-mailserver)'));
  } else {
    console.log(chalk.dim('    Mail Server: disabled'));
  }

  console.log();
  console.log(chalk.green('  Domain & Network configured.'));
  console.log();

  return withDefaults;
}
