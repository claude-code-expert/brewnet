// features/domain/hooks/useCloudflareSetup.ts — Wizard step state machine

import { useState, useEffect, useCallback } from 'react';
import type { ApiFetch, CloudflareSetupStatus, CloudflareZone, SetupStep } from '../types.js';
import {
  getCloudflareSettings,
  saveToken,
  saveZone,
  listZones,
  createTunnel,
} from '../api/domain-api.js';
import { showToast } from '../../../components/Toast.js';

const CF_ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: 'API token invalid or expired. Check that it has Tunnel:Edit and DNS:Edit permissions.',
  NO_TOKEN: 'Complete Step 1 (API Token) before loading zones.',
  TOKEN_INVALID: 'Your saved API token is no longer valid. Re-enter it in Step 1.',
  TUNNEL_NAME_CONFLICT: 'A tunnel with this name already exists. Try a different name.',
  CREDENTIALS_INCOMPLETE: 'Complete Steps 1 and 2 before creating a tunnel.',
  CNAME_CONFLICT: 'This subdomain is already in use. Choose a different one.',
  INVALID_SUBDOMAIN: 'Subdomain must be lowercase letters, numbers, and hyphens only.',
};

function mapError(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return CF_ERROR_MESSAGES[code] ?? fallback;
}

function deriveCurrentStep(status: CloudflareSetupStatus): SetupStep {
  if (!status.apiTokenSet) return 'token';
  if (!status.zoneName) return 'zone';
  if (!status.tunnelName) return 'tunnel';
  return 'complete';
}

export interface CloudflareSetupHook {
  currentStep: SetupStep;
  completedSteps: string[];
  loading: boolean;
  summary: CloudflareSetupStatus | null;

  // Token step
  tokenValidating: boolean;
  tokenError: string | null;
  tokenEmail: string | null;
  adminPasswordRequired: boolean;
  saveTokenAction: (token: string) => Promise<void>;
  submitAdminPassword: (adminPw: string) => Promise<void>;

  // Zone step
  zones: CloudflareZone[];
  zonesLoading: boolean;
  zonesError: string | null;
  loadZones: (adminPassword?: string) => Promise<void>;
  selectZoneAction: (zoneId: string, token: string) => Promise<void>;

  // Tunnel step
  defaultTunnelName: string;
  tunnelCreating: boolean;
  tunnelError: string | null;
  tunnelComposeUpdated: boolean | undefined;
  tunnelContainerRestarted: boolean | undefined;
  createTunnelAction: (tunnelName: string) => Promise<void>;

  // Reset
  resetSetup: () => void;
}

export function useCloudflareSetup(apiFetch: ApiFetch): CloudflareSetupHook {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CloudflareSetupStatus | null>(null);
  const [currentStep, setCurrentStep] = useState<SetupStep>('token');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const [tokenValidating, setTokenValidating] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);
  const [adminPasswordRequired, setAdminPasswordRequired] = useState(false);
  const [pendingCfToken, setPendingCfToken] = useState<string | null>(null);

  const [zones, setZones] = useState<CloudflareZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesError, setZonesError] = useState<string | null>(null);

  const [tunnelCreating, setTunnelCreating] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [tunnelComposeUpdated, setTunnelComposeUpdated] = useState<boolean | undefined>(undefined);
  const [tunnelContainerRestarted, setTunnelContainerRestarted] = useState<boolean | undefined>(undefined);

  const loadZones = useCallback(async (adminPassword?: string) => {
    setZonesLoading(true);
    setZonesError(null);
    try {
      const result = adminPassword
        ? await fetch('/api/cloudflare/zones', { headers: { 'X-Admin-Password': adminPassword } })
            .then((r) => r.json() as Promise<import('../types.js').ZonesListResult>)
        : await listZones(apiFetch);
      if (result.success) {
        setZones(result.zones);
        if (result.zones.length === 0 && result.warning) {
          setZonesError(result.warning);
        }
      } else {
        setZonesError(mapError(result.error, result.message ?? 'Failed to load zones'));
      }
    } catch (e) {
      setZonesError(e instanceof Error ? e.message : 'Failed to load zones');
    } finally {
      setZonesLoading(false);
    }
  }, [apiFetch]);

  // Load current settings on mount and derive wizard step
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getCloudflareSettings(apiFetch);
        if (cancelled) return;
        setSummary(status);
        const step = deriveCurrentStep(status);
        setCurrentStep(step);

        // Mark completed steps
        const completed: string[] = [];
        if (status.apiTokenSet) completed.push('token');
        if (status.zoneName) completed.push('zone');
        if (status.tunnelName) completed.push('tunnel');
        setCompletedSteps(completed);

        // Auto-load zones if resuming at zone step
        if (step === 'zone') {
          void loadZones();
        }
      } catch {
        // non-fatal — start at token step
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiFetch, loadZones]);

  const saveTokenAction = useCallback(async (token: string) => {
    if (!token.trim()) return;
    setTokenValidating(true);
    setTokenError(null);
    setAdminPasswordRequired(false);
    try {
      const result = await saveToken(apiFetch, token.trim());
      if (result.success) {
        setTokenEmail(result.email ?? null);
        setCompletedSteps((prev) => [...new Set([...prev, 'token'])]);
        setCurrentStep('zone');
        void loadZones();
      } else if (result.error === 'Unauthorized') {
        // Admin password missing or wrong — prompt the user instead of showing a raw error
        setPendingCfToken(token.trim());
        setAdminPasswordRequired(true);
      } else {
        setTokenError(mapError(result.error, result.message ?? 'Token verification failed'));
      }
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Token verification failed');
    } finally {
      setTokenValidating(false);
    }
  }, [apiFetch, loadZones]);

  // Called after the user provides the admin password — retries with a direct fetch
  // so we don't have to wait for React's apiFetch ref to update.
  const submitAdminPassword = useCallback(async (adminPw: string) => {
    if (!pendingCfToken) return;
    const cfToken = pendingCfToken;
    setAdminPasswordRequired(false);
    setPendingCfToken(null);
    setTokenValidating(true);
    setTokenError(null);
    try {
      const res = await fetch('/api/settings/cloudflare', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPw },
        body: JSON.stringify({ apiToken: cfToken }),
      });
      const result = await res.json() as import('../types.js').TokenSaveResult;
      if (result.success) {
        setTokenEmail(result.email ?? null);
        setCompletedSteps((prev) => [...new Set([...prev, 'token'])]);
        setCurrentStep('zone');
        void loadZones(adminPw); // pass password directly — apiFetch not yet updated after setPassword
      } else {
        setTokenError(mapError(result.error, result.message ?? 'Token verification failed'));
      }
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Token verification failed');
    } finally {
      setTokenValidating(false);
    }
  }, [pendingCfToken, loadZones]);

  const selectZoneAction = useCallback(async (zoneId: string, token: string) => {
    try {
      const result = await saveZone(apiFetch, token, zoneId);
      if (result.success) {
        const zoneName = result.zoneName ?? zones.find((z) => z.id === zoneId)?.name ?? '';
        setSummary((prev) => prev ? { ...prev, zoneId, zoneName } : null);
        setCompletedSteps((prev) => [...new Set([...prev, 'zone'])]);
        setCurrentStep('tunnel');
      } else {
        showToast(mapError(result.error, result.message ?? 'Failed to save zone'));
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save zone');
    }
  }, [apiFetch, zones]);

  const createTunnelAction = useCallback(async (tunnelName: string) => {
    if (!tunnelName.trim()) return;
    setTunnelCreating(true);
    setTunnelError(null);
    try {
      const result = await createTunnel(apiFetch, tunnelName.trim());
      if (result.success) {
        setSummary((prev) => prev ? { ...prev, tunnelName: result.tunnelName, tunnelId: result.tunnelId } : null);
        setTunnelComposeUpdated(result.composeUpdated);
        setTunnelContainerRestarted(result.containerRestarted);
        setCompletedSteps((prev) => [...new Set([...prev, 'tunnel'])]);
        setCurrentStep('complete');
      } else {
        const r = result as { error?: string; message?: string };
        setTunnelError(mapError(r.error, r.message ?? 'Tunnel creation failed'));
      }
    } catch (e) {
      setTunnelError(e instanceof Error ? e.message : 'Tunnel creation failed');
    } finally {
      setTunnelCreating(false);
    }
  }, [apiFetch]);

  const resetSetup = useCallback(() => {
    setCurrentStep('token');
    setCompletedSteps([]);
    setTokenError(null);
    setTokenEmail(null);
    setZones([]);
    setZonesError(null);
    setTunnelError(null);
  }, []);

  // Default tunnel name: existing name > brewnet-{projectName} > generic fallback
  const defaultTunnelName = summary?.tunnelName
    || (summary?.projectName ? `brewnet-${summary.projectName}` : 'brewnet-homeserver');

  return {
    currentStep,
    completedSteps,
    loading,
    summary,
    tokenValidating,
    tokenError,
    tokenEmail,
    adminPasswordRequired,
    saveTokenAction,
    submitAdminPassword,
    zones,
    zonesLoading,
    zonesError,
    loadZones,
    selectZoneAction,
    defaultTunnelName,
    tunnelCreating,
    tunnelError,
    tunnelComposeUpdated,
    tunnelContainerRestarted,
    createTunnelAction,
    resetSetup,
  };
}
