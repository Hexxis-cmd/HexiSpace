import { describe, expect, it } from 'vitest';
import { keyedReferralDigest, normalizeReferralCode, referralInstallToken, trustedReferralClientIp } from '../src/lib/referral-risk';
import { formatReferralCode } from '../src/lib/referral-store';
import { renderReferralPanel } from '../src/views/referral-panel';

const validId = '12345678-1234-4abc-8def-1234567890ab';

describe('HexiCoin referrals', () => {
  it('normalizes only a complete 16-character hexadecimal referral code', () => {
    expect(formatReferralCode(' hx-89ab-cdef-0123-4567 ')).toBe('HX-89AB-CDEF-0123-4567');
    expect(formatReferralCode('HX-123')).toBe('');
    expect(normalizeReferralCode('HX-89ab-cdef-0123-4567')).toBe('89ABCDEF01234567');
  });

  it('persists a random browser-installation token and rejects a malformed generator result', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
    let created = 0;
    const first = referralInstallToken(storage, () => { created++; return validId; });
    const second = referralInstallToken(storage, () => { created++; return 'bad'; });
    expect(first).toBe(validId);
    expect(second).toBe(first);
    expect(created).toBe(1);
    expect(() => referralInstallToken({ getItem: () => null, setItem: () => undefined }, () => 'not-a-uuid')).toThrow();
  });

  it('creates non-reversible keyed risk digests with separate IP and device namespaces', async () => {
    const ip = await keyedReferralDigest('server-only-test-secret', 'ip', '203.0.113.9');
    const sameIp = await keyedReferralDigest('server-only-test-secret', 'ip', '203.0.113.9');
    const device = await keyedReferralDigest('server-only-test-secret', 'device', '203.0.113.9');
    expect(ip).toMatch(/^[a-f0-9]{64}$/);
    expect(ip).toBe(sameIp);
    expect(device).not.toBe(ip);
    expect(await keyedReferralDigest('different-secret', 'ip', '203.0.113.9')).not.toBe(ip);
  });

  it('uses only a normalized, single Cloudflare edge IP for referral abuse scoring', () => {
    const headers = new Headers({
      'cf-connecting-ip': '2001:DB8::A',
      'x-forwarded-for': '198.51.100.44, 203.0.113.10'
    });
    expect(trustedReferralClientIp(headers)).toBe('2001:db8::a');
    expect(trustedReferralClientIp(new Headers({ 'cf-connecting-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('ignores spoofable forwarding chains and fails closed on missing or malformed edge IPs', () => {
    expect(trustedReferralClientIp(new Headers({ 'x-forwarded-for': '203.0.113.9' }))).toBeNull();
    expect(trustedReferralClientIp(new Headers({ 'cf-connecting-ip': '203.0.113.9, 198.51.100.4' }))).toBeNull();
    expect(trustedReferralClientIp(new Headers({ 'cf-connecting-ip': '999.0.0.1' }))).toBeNull();
    expect(trustedReferralClientIp(new Headers({ 'cf-connecting-ip': '2001:::bad' }))).toBeNull();
  });

  it('explains the code window, the review state, and current non-cash use', () => {
    const html = renderReferralPanel({ referral_code: 'HX-1234-ABCD-5678-EF90', referral_deadline: new Date(Date.now() + 3_600_000).toISOString(), claim_status: 'review', credited_at: null });
    expect(html).toContain('HX-1234-ABCD-5678-EF90');
    expect(html).toContain('authenticity review');
    expect(html).toContain('at least 24 hours apart');
    expect(html).toContain('cannot be bought, withdrawn, or exchanged for money');
    expect(html).toContain('data-action="copy-referral"');
  });

  it('explains the final lifetime invite cap without leaving a claim pending', () => {
    const html = renderReferralPanel({ referral_code: 'HX-1234-ABCD-5678-EF90', referral_deadline: new Date(Date.now() + 3_600_000).toISOString(), claim_status: 'capped', credited_at: null });
    expect(html).toContain('limit of 10 credited invites');
    expect(html).not.toContain('bonus stays pending');
  });
});
