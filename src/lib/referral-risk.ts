const INSTALL_TOKEN_KEY = 'hexispace.referral-installation.v1';

export function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase().replace(/^HX[-\s]?/, '').replace(/[^A-F0-9]/g, '');
}

function normalizeIpAddress(value: string): string | null {
  if (value.length > 64 || value.includes(',')) return null;
  const octets = value.split('.');
  if (octets.length === 4 && octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)) {
    return octets.join('.');
  }
  if (!value.includes(':') || !/^[0-9a-f:.]+$/i.test(value)) return null;
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1).toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function trustedReferralClientIp(headers: Pick<Headers, 'get'>): string | null {
  // Cloudflare overwrites CF-Connecting-IP at its edge. Do not trust the
  // client-preservable X-Forwarded-For chain for abuse scoring.
  const forwarded = headers.get('cf-connecting-ip')?.trim() || '';
  return normalizeIpAddress(forwarded);
}

export function referralInstallToken(storage: Pick<Storage, 'getItem' | 'setItem'>, createId: () => string): string {
  const current = storage.getItem(INSTALL_TOKEN_KEY);
  if (current && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(current)) return current;
  const token = createId();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) throw new Error('A secure installation token could not be created.');
  storage.setItem(INSTALL_TOKEN_KEY, token);
  return token;
}

export async function keyedReferralDigest(secret: string, purpose: 'ip' | 'device', value: string): Promise<string> {
  if (!secret || !value) throw new Error('Referral risk signal is unavailable.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${purpose}\u0000${value.trim().toLowerCase()}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
