// features/domain/types.ts — Domain Settings Feature type definitions

export type SetupStep = 'token' | 'zone' | 'tunnel' | 'complete';

export interface CloudflareSetupStatus {
  configured: boolean;
  apiTokenSet: boolean;
  accountId?: string;
  zoneId?: string;
  zoneName: string;
  tunnelId?: string;
  tunnelName: string;
  projectName?: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

export interface SetupStepState {
  currentStep: SetupStep;
  completedSteps: string[];

  token: string;
  tokenValidating: boolean;
  tokenError: string | null;
  tokenEmail: string | null;

  zones: CloudflareZone[];
  zonesLoading: boolean;
  zonesError: string | null;
  selectedZoneId: string;

  tunnelName: string;
  tunnelCreating: boolean;
  tunnelError: string | null;

  summary: CloudflareSetupStatus | null;
}

export interface AppDomainState {
  connections: DomainConnectionEntry[];
  loading: boolean;
  subdomain: string;
  subdomainError: string | null;
  connecting: boolean;
  disconnecting: boolean;
  cfConfigured: boolean;
  zoneName: string;
}

export interface DomainConnectionEntry {
  appName: string;
  hostname: string;
  /** Subdomain label, or "@" for apex/root domain connections */
  subdomain?: string;
  /** Base domain (e.g. "yourdomain.com") */
  domain?: string;
  connectedAt?: string;
  externalUrl?: string;
}

export interface DomainConnectResult {
  success: boolean;
  hostname: string;
  externalUrl: string;
  steps?: Array<{ label: string; status: string }>;
}

export interface TunnelCreateResult {
  success: boolean;
  tunnelId: string;
  tunnelName: string;
  /** docker-compose.yml cloudflared service was patched to named-tunnel mode */
  composeUpdated?: boolean;
  /** cloudflared container was recreated to apply the new tunnel token */
  containerRestarted?: boolean;
}

export interface TokenSaveResult {
  success: boolean;
  verified: boolean;
  email?: string;
  zoneName?: string;
  error?: string;
  message?: string;
}

export interface ZoneSaveResult {
  success: boolean;
  verified?: boolean;
  zoneName?: string;
  error?: string;
  message?: string;
}

export interface ZonesListResult {
  success: boolean;
  zones: CloudflareZone[];
  warning?: string;
  error?: string;
  message?: string;
}

export interface DomainListResult {
  connections: DomainConnectionEntry[];
  tunnel?: {
    status: string;
    tunnelName: string;
    tunnelId: string;
  };
  credentialsConfigured: boolean;
}

export type ApiFetch = (url: string, init?: RequestInit) => Promise<Response>;
