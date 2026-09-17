import type { User } from '@supabase/supabase-js';
import { redeemReferralCode } from '../lib/referral-store';
import { loadGifts, render, setNotice, shellState } from './shell-runtime';

const resultMessage: Record<string, string> = {
  pending: 'Code applied. Referral bonuses are pending while the eligibility checks finish.',
  review: 'Code applied. This referral needs a quick authenticity review.',
  credited: 'Referral verified. Both accounts received 500 HexiCoins.',
  rejected: 'This referral did not qualify, so no bonus was issued.',
  capped: 'This referral reached the referrer’s limit of 10 credited invites. No additional bonus was issued.',
  invalid_code: 'That referral code was not found. Check the code and try again.',
  invalid_account: 'Sign in again before applying a referral code.',
  window_closed: 'The 72-hour referral entry window has closed.',
  already_redeemed: 'This account has already used its one referral code.',
  self_referral: 'You cannot use your own referral code.',
  referrer_cap: 'That referral code has reached its current account limit.',
  rate_limited: 'Too many recent referral attempts. Please try again later.'
};

export async function submitReferralFlow(event: Event, root: HTMLElement, user: User): Promise<void> {
  event.preventDefault();
  const input = root.querySelector<HTMLInputElement>('#referralCode');
  if (!input) return;
  const button = input.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const result = await redeemReferralCode(input.value);
    shellState(root).notice = resultMessage[result.status] || 'Referral status updated.';
    await loadGifts(root, user);
  } catch (error) {
    setNotice(root, error);
    if (button) button.disabled = false;
  }
}

export async function copyReferralCode(root: HTMLElement, code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    const current = shellState(root);
    current.notice = 'Referral code copied.';
    const notice = root.querySelector<HTMLElement>('#notice');
    if (notice) notice.textContent = current.notice;
  } catch {
    setNotice(root, 'Clipboard access is unavailable. Select and copy the referral code instead.');
  }
}
