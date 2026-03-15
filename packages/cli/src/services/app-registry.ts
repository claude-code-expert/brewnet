// packages/cli/src/services/app-registry.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppEntry } from '../types/app-entry.js';

export function readApps(appsJsonPath: string): AppEntry[] {
  if (!existsSync(appsJsonPath)) return [];
  try {
    return JSON.parse(readFileSync(appsJsonPath, 'utf-8')) as AppEntry[];
  } catch {
    return [];
  }
}

export function writeApps(appsJsonPath: string, apps: AppEntry[]): void {
  mkdirSync(dirname(appsJsonPath), { recursive: true });
  writeFileSync(appsJsonPath, JSON.stringify(apps, null, 2), 'utf-8');
}

export function addApp(appsJsonPath: string, entry: AppEntry): void {
  const apps = readApps(appsJsonPath);
  if (apps.some((a) => a.name === entry.name)) {
    throw new Error(`App "${entry.name}" already exists`);
  }
  writeApps(appsJsonPath, [...apps, entry]);
}

export function updateApp(appsJsonPath: string, name: string, patch: Partial<AppEntry>): void {
  const apps = readApps(appsJsonPath);
  const idx = apps.findIndex((a) => a.name === name);
  if (idx === -1) throw new Error(`App "${name}" not found`);
  apps[idx] = { ...apps[idx]!, ...patch };
  writeApps(appsJsonPath, apps);
}

export function removeApp(appsJsonPath: string, name: string): void {
  const apps = readApps(appsJsonPath).filter((a) => a.name !== name);
  writeApps(appsJsonPath, apps);
}
