// features/domain/hooks/useAppDomain.ts — Per-app domain connect/disconnect state

import { useState, useEffect, useCallback } from 'react';
import type { ApiFetch, DomainConnectionEntry } from '../types.js';
import { listDomains, disconnectDomain } from '../api/domain-api.js';
import { toSubdomainSlug, validateSubdomainLabel } from '../utils/subdomain.js';
import { showToast, showPersistentToast } from '../../../components/Toast.js';

const CF_ERROR_MESSAGES: Record<string, string> = {
  CNAME_CONFLICT: 'This subdomain is already in use. Choose a different one.',
  INVALID_SUBDOMAIN: 'Subdomain must be lowercase letters, numbers, and hyphens only.',
  NOT_CONNECTED: 'No domain connection found for this app.',
};

function mapError(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return CF_ERROR_MESSAGES[code] ?? fallback;
}

export interface AppDomainHook {
  loading: boolean;
  connectedDomain: DomainConnectionEntry | null;
  cfConfigured: boolean;
  zoneName: string;
  suggestedSubdomain: string;
  subdomain: string;
  setSubdomain: (v: string) => void;
  subdomainError: string | null;
  connecting: boolean;
  connectingMessage: string | null;
  disconnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useAppDomain(appName: string, apiFetch: ApiFetch): AppDomainHook {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<DomainConnectionEntry[]>([]);
  const [cfConfigured, setCfConfigured] = useState(false);
  const [zoneName, setZoneName] = useState('');

  const suggested = toSubdomainSlug(appName);
  const [subdomain, setSubdomain] = useState(suggested);
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectingMessage, setConnectingMessage] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, settingsRes] = await Promise.all([
        listDomains(apiFetch),
        apiFetch('/api/settings/cloudflare').catch((e: unknown) => {
          console.warn('[useAppDomain] Failed to fetch cloudflare settings:', e);
          return null;
        }),
      ]);
      setConnections(result.connections);
      setCfConfigured(result.credentialsConfigured);
      // Derive zoneName from connections hostname pattern
      if (result.connections.length > 0) {
        const first = result.connections[0].hostname;
        const parts = first.split('.');
        if (parts.length >= 2) {
          setZoneName(parts.slice(1).join('.'));
        }
      }
      // Override with zoneName from settings if available
      if (settingsRes?.ok) {
        try {
          const settings = await settingsRes.json() as { zoneName?: string };
          if (settings.zoneName) setZoneName(settings.zoneName);
        } catch (e) {
          console.warn('[useAppDomain] Failed to parse cloudflare settings:', e);
        }
      }
    } catch (e) {
      console.warn('[useAppDomain] Failed to load domain info:', e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedDomain = connections.find((c) => c.appName === appName) ?? null;

  const connect = useCallback(async () => {
    const validation = validateSubdomainLabel(subdomain);
    if (!validation.valid) {
      setSubdomainError(validation.error ?? 'Invalid subdomain');
      return;
    }
    setSubdomainError(null);

    if (!zoneName) {
      showToast('Zone name not available. Complete Cloudflare setup first.');
      return;
    }

    setConnecting(true);
    setConnectingMessage('Connecting...');

    const STEP_LABELS: Record<string, string> = {
      'health': 'Checking app health...',
      'ingress': 'Updating tunnel ingress...',
      'dns': 'Creating DNS record...',
      'traefik': 'Updating Traefik labels...',
      'persist': 'Saving connection...',
      'poll': 'Waiting for DNS propagation...',
    };

    try {
      const pw = sessionStorage.getItem('adminPassword') ?? '';
      const response = await fetch('/api/domain/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw },
        body: JSON.stringify({ appName, subdomain, domain: zoneName }),
      });

      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream')) {
        // SSE streaming response — read step-by-step progress
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let finalResult: { success?: boolean; error?: string; message?: string } | null = null;

        if (reader) {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const event = JSON.parse(line.slice(6)) as { type: string; step?: number; total?: number; message?: string; success?: boolean; error?: string };
                if (event.type === 'step') {
                  // Map step messages to user-friendly labels
                  const msg = event.message ?? '';
                  const label = Object.entries(STEP_LABELS).find(([k]) => msg.toLowerCase().includes(k))?.[1] ?? msg;
                  setConnectingMessage(`Step ${event.step}/${event.total}: ${label}`);
                } else if (event.type === 'step_done') {
                  const msg = event.message ?? '';
                  if (msg.includes('step 6')) setConnectingMessage('DNS propagation complete');
                } else if (event.type === 'result') {
                  finalResult = event;
                }
              } catch { /* skip malformed SSE */ }
            }
          }
        }

        if (finalResult?.success) {
          setConnectingMessage('Connected!');
          showToast('Domain connected');
          await load();
        } else {
          const errorCode = finalResult?.error;
          const errorMsg = finalResult?.message ?? errorCode ?? 'Failed to connect domain';
          showPersistentToast(mapError(errorCode, errorMsg));
        }
      } else {
        // Non-SSE fallback (error responses are still JSON)
        const result = await response.json() as { success?: boolean; error?: string; message?: string };
        if (result.success) {
          showToast('Domain connected');
          await load();
        } else {
          showPersistentToast(mapError(result.error, result.message ?? 'Failed to connect domain'));
        }
      }
    } catch (e) {
      console.error('[domain-connect] exception:', e);
      showPersistentToast(e instanceof Error ? e.message : 'Failed to connect domain');
    } finally {
      setConnecting(false);
      setConnectingMessage(null);
    }
  }, [apiFetch, appName, subdomain, zoneName, load]);

  const disconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      await disconnectDomain(apiFetch, appName);
      showToast('Domain disconnected');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to disconnect domain');
    } finally {
      setDisconnecting(false);
    }
  }, [apiFetch, appName, load]);

  const handleSetSubdomain = useCallback((v: string) => {
    setSubdomain(v);
    if (v) {
      const validation = validateSubdomainLabel(v);
      setSubdomainError(validation.valid ? null : (validation.error ?? null));
    } else {
      setSubdomainError(null);
    }
  }, []);

  return {
    loading,
    connectedDomain,
    cfConfigured,
    zoneName,
    suggestedSubdomain: suggested,
    subdomain,
    setSubdomain: handleSetSubdomain,
    subdomainError,
    connecting,
    connectingMessage,
    disconnecting,
    connect,
    disconnect,
    reload: load,
  };
}
