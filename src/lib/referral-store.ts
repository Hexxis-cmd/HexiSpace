import { getSupabase } from './supabase';
import { normalizeReferralCode, referralInstallToken } from './referral-risk';

export type ReferralStatus = {
  referral_code: string | null;
  referral_deadline: string;
  claim_status: 'pending' | 'review' | 'credited' | 'rejected' | 'capped' | null;
  credited_at: string | null;
};

export type ReferralResult = { status: 'pending' | 'review' | 'credited' | 'rejected' | 'capped' | 'invalid_code' | 'invalid_account' | 'window_closed' | 'already_redeemed' | 'self_referral' | 'referrer_cap' | 'rate_limited'; submitted_at?: string };

const db = () => getSupabase();

export function formatReferralCode(value: string): string {
  const code = normalizeReferralCode(value);
  if (!/^[A-F0-9]{16}$/.test(code)) return '';
  return `HX-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
}

export async function myReferralStatus(): Promise<ReferralStatus | null> {
  const { data, error } = await db().rpc('my_hexicoin_referral_status');
  if (error) throw error;
  const status = Array.isArray(data) ? data[0] : data;
  return status ? status as ReferralStatus : null;
}

export async function redeemReferralCode(value: string): Promise<ReferralResult> {
  const code = formatReferralCode(value);
  if (!code) throw new Error('Enter the full referral code, including all four groups.');
  let installToken: string;
  try {
    installToken = referralInstallToken(window.localStorage, () => crypto.randomUUID());
  } catch {
    throw new Error('This browser cannot save the one-time anti-abuse token needed to redeem a referral.');
  }
  const { data, error } = await db().functions.invoke('redeem-hexicoin-referral', { body: { code, installToken } });
  if (error) throw new Error('The referral check could not connect. Please try again later.');
  if (!data || typeof data.status !== 'string') throw new Error('The referral check returned an invalid response.');
  return data as ReferralResult;
}
