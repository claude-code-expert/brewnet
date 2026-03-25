// features/domain/api/domain-api.ts — Typed fetch wrappers for domain API endpoints
// No business logic — each function is a thin typed wrapper over apiFetch.

import type {
  ApiFetch,
  CloudflareSetupStatus,
  TokenSaveResult,
  ZoneSaveResult,
  ZonesListResult,
  TunnelCreateResult,
  DomainConnectResult,
  DomainListResult,
} from '../types.js';

export async function getCloudflareSettings(apiFetch: ApiFetch): Promise<CloudflareSetupStatus> {
  const res = await apiFetch('/api/settings/cloudflare');
  return res.json() as Promise<CloudflareSetupStatus>;
}

export async function saveToken(apiFetch: ApiFetch, token: string): Promise<TokenSaveResult> {
  const res = await apiFetch('/api/settings/cloudflare', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiToken: token }),
  });
  return res.json() as Promise<TokenSaveResult>;
}

export async function saveZone(
  apiFetch: ApiFetch,
  token: string,
  zoneId: string,
): Promise<ZoneSaveResult> {
  const res = await apiFetch('/api/settings/cloudflare', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiToken: token, zoneId }),
  });
  return res.json() as Promise<ZoneSaveResult>;
}

export async function listZones(apiFetch: ApiFetch): Promise<ZonesListResult> {
  const res = await apiFetch('/api/cloudflare/zones');
  return res.json() as Promise<ZonesListResult>;
}

export async function createTunnel(
  apiFetch: ApiFetch,
  tunnelName: string,
): Promise<TunnelCreateResult> {
  const res = await apiFetch('/api/cloudflare/tunnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tunnelName }),
  });
  return res.json() as Promise<TunnelCreateResult>;
}

export async function connectDomain(
  apiFetch: ApiFetch,
  appName: string,
  subdomain: string,
  domain: string,
): Promise<DomainConnectResult> {
  const res = await apiFetch('/api/domain/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appName, subdomain, domain }),
  });
  return res.json() as Promise<DomainConnectResult>;
}

export async function disconnectDomain(apiFetch: ApiFetch, appName: string): Promise<void> {
  const res = await apiFetch(`/api/domain/disconnect/${encodeURIComponent(appName)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.message ?? body.error ?? `Disconnect failed (${res.status})`);
  }
}

export async function listDomains(apiFetch: ApiFetch): Promise<DomainListResult> {
  const res = await apiFetch('/api/domain/list');
  return res.json() as Promise<DomainListResult>;
}
