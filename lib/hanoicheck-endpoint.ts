import { isIP } from 'node:net';
import { HanoiCheckApiError } from '@/lib/hanoicheck-errors';

export const DEFAULT_BASE_URL = 'https://ncc-api.hanoicheck.com.vn';

function isPublicHostname(host: string) {
  return host.length <= 253 && !isIP(host) &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) &&
    !/(?:^|\.)(?:localhost|local|internal|test|invalid|example|home|lan|onion)$/.test(host) &&
    !host.endsWith('.home.arpa');
}

/** Additional exact vendor hosts can only be approved by the server operator. */
export function normalizeHanoiCheckEndpoint(value: string, additionalHosts = process.env.HANOICHECK_ALLOWED_API_HOSTS || '') {
  const input = value.trim();
  // Parse the raw authority first: URL normalizes explicit :443, backslashes and dot segments.
  const match = /^https:\/\/([a-z0-9.-]+)\/?$/i.exec(input);
  const hostname = match?.[1].toLowerCase();
  const allowed = new Set(['ncc-api.hanoicheck.com.vn']);
  for (const entry of additionalHosts.split(',')) {
    const host = entry.trim().toLowerCase();
    if (isPublicHostname(host)) allowed.add(host);
  }
  if (!hostname || !isPublicHostname(hostname) || !allowed.has(hostname)) {
    throw new HanoiCheckApiError('Endpoint phải là HTTPS của HanoiCheck đã được máy chủ cho phép, không kèm cổng, đường dẫn, thông tin đăng nhập hoặc tham số.', 400);
  }
  return `https://${hostname}`;
}

export function hanoiCheckBusinessUrl(baseUrl: string, path: string, params: Record<string, string | number | undefined>) {
  if (!/^\/(?:[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+)*$/.test(path) || /\/(?:merge|token|refresh_token)(?:\/|$)/i.test(path)) {
    throw new HanoiCheckApiError('Đường dẫn đọc HanoiCheck không hợp lệ.', 400);
  }
  const url = new URL(`${normalizeHanoiCheckEndpoint(baseUrl)}/api/supplier${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  return url;
}
