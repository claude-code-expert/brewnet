// features/domain/hooks/useAppDomain.ts — Per-app domain connect/disconnect state

import { useState, useEffect, useCallback } from 'react';
import type { ApiFetch, DomainConnectionEntry } from '../types.js';
import { listDomains, connectDomain, disconnectDomain } from '../api/domain-api.js';
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
    // Client-side validation first
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
    try {
      const result = await connectDomain(apiFetch, appName, subdomain, zoneName);
      if (result.success) {
        showToast('Domain connected');
        await load();
      } else {
        const errorCode = (result as { error?: string }).error;
        const errorMsg = (result as { message?: string }).message ?? errorCode ?? 'Failed to connect domain';
        console.error(`[domain-connect] FAIL — error=${errorCode} message=${errorMsg}`, result);
        showPersistentToast(mapError(errorCode, errorMsg));
      }
    } catch (e) {
      console.error('[domain-connect] exception:', e);
      showPersistentToast(e instanceof Error ? e.message : 'Failed to connect domain');
    } finally {
      setConnecting(false);
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
    disconnecting,
    connect,
    disconnect,
    reload: load,
  };
}
