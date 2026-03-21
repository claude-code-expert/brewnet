// features/domain/index.ts — Barrel exports for the domain feature module
// Updated as each component/hook is created.

export type {
  SetupStep,
  CloudflareSetupStatus,
  CloudflareZone,
  SetupStepState,
  AppDomainState,
  DomainConnectionEntry,
  DomainConnectResult,
  TunnelCreateResult,
  ApiFetch,
} from './types.js';

export { toSubdomainSlug, validateSubdomainLabel } from './utils/subdomain.js';

export {
  getCloudflareSettings,
  saveToken,
  saveZone,
  listZones,
  createTunnel,
  connectDomain,
  disconnectDomain,
  listDomains,
} from './api/domain-api.js';

// Components and hooks
export { CloudflareTunnelModal } from './components/CloudflareTunnelModal.js';
export { AppDomainTab } from './components/AppDomainTab.js';
