import { serviceBaseUrl, serviceCredentials } from './service-connection';
import type { CaptionCredential } from './caption-client';

let activeRequest: Promise<boolean> | null = null;

function isLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function parseCredential(value: unknown, receivedAt: number): CaptionCredential | null {
  if (!value || typeof value !== 'object') return null;
  const grant = value as { token?: unknown; expiresAt?: unknown };
  if (typeof grant.token !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/u.test(grant.token) ||
      !Number.isFinite(grant.expiresAt) || (grant.expiresAt as number) <= receivedAt ||
      (grant.expiresAt as number) > receivedAt + 3900000) return null;
  return { token: grant.token, expiresAt: Math.min(grant.expiresAt as number, receivedAt + 3600000) };
}

export function ensureServiceConnection(options: { fetcher?: typeof fetch; force?: boolean } = {}): Promise<boolean> {
  const current = serviceCredentials.current;
  if (!options.force && current && current.expiresAt > Date.now()) return Promise.resolve(true);
  if (activeRequest) return activeRequest;
  if (!isLoopbackOrigin(serviceBaseUrl)) return Promise.resolve(false);
  const fetcher = options.fetcher ?? fetch;
  activeRequest = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(`${serviceBaseUrl}/v1/local/demo/clients`, {
        method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) return false;
      const raw = await response.text();
      if (raw.length > 4096) return false;
      const credential = parseCredential(JSON.parse(raw), Date.now());
      if (!credential) return false;
      serviceCredentials.current = credential;
      return true;
    } catch { return false; }
    finally { clearTimeout(timer); }
  })().finally(() => { activeRequest = null; });
  return activeRequest;
}
