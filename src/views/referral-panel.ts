import type { ReferralStatus } from '../lib/referral-store';
import { escapeHtml as esc } from './view-helpers';

function deadlineText(value: string): string {
  const deadline = Date.parse(value);
  if (!Number.isFinite(deadline)) return 'Referral entry window unavailable';
  if (deadline <= Date.now()) return 'Referral entry window has closed';
  const hours = Math.max(1, Math.ceil((deadline - Date.now()) / 3_600_000));
  return `Enter a code within ${hours} hour${hours === 1 ? '' : 's'} of account creation`;
}

export function renderReferralPanel(status: ReferralStatus | null): string {
  if (!status?.referral_code) return '<section class="referral-card"><h3>Invite friends</h3><p class="muted">Your referral details could not be loaded. Refresh this page to try again.</p></section>';

  const mayRedeem = !status.claim_status && Date.parse(status.referral_deadline) > Date.now();
  const claimMessage = status.claim_status === 'pending'
    ? 'Your code is saved. The bonus stays pending until both accounts are verified, have a profile, and the new account completes two qualifying activities at least 24 hours apart.'
    : status.claim_status === 'review'
      ? 'This referral needs a quick authenticity review. No bonus has been issued yet.'
      : status.claim_status === 'credited'
        ? 'Referral verified. The new account and its referrer each received 500 HexiCoins.'
        : status.claim_status === 'rejected'
          ? 'This referral was reviewed and did not qualify. No referral bonus was issued.'
          : status.claim_status === 'capped'
            ? 'This referral reached the referrer’s limit of 10 credited invites. No additional bonus was issued.'
            : '';

  return `<section class="referral-card" aria-labelledby="referral-title">
    <div><h3 id="referral-title">Invite friends</h3><p>Share your code. A new account gets 1,000 starter coins, plus 500 after a referral qualifies; you can earn 500 for each qualified invite, up to 10.</p></div>
    <div class="referral-code-row"><code>${esc(status.referral_code)}</code><button class="secondary-button" type="button" data-action="copy-referral" data-code="${esc(status.referral_code)}">Copy code</button></div>
    <small>${esc(deadlineText(status.referral_deadline))}</small>
    ${mayRedeem ? `<form id="referralForm"><label for="referralCode">Have a code?</label><div class="referral-code-entry"><input id="referralCode" name="code" maxlength="23" autocomplete="off" placeholder="HX-1234-ABCD-5678-EF90" required/><button class="primary-button" type="submit">Apply code</button></div></form>` : ''}
    ${status.claim_status ? `<p class="referral-state" role="status">${esc(claimMessage)}</p>` : mayRedeem ? '<p class="muted">A code can be used once, in the first 72 hours. Shared device or network signals may send a referral for review; they do not automatically reject it.</p>' : '<p class="muted">No referral was used. The 72-hour entry window is closed.</p>'}
    <details><summary>How referral bonuses qualify</summary><p>Both accounts need a verified email address and at least one profile. The new account also needs two different real activities at least 24 hours apart: a thoughtful public or friends-only post, a comment on someone else’s public post, a reaction to someone else’s public post, following another profile, or joining a public group. Activity text is not recorded for this check. Shared browser or network signals go to manual review.</p><p>HexiCoins are alpha credits for digital gifts only. They cannot be bought, withdrawn, or exchanged for money.</p></details>
  </section>`;
}
