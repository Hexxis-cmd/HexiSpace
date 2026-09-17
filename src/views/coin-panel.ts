import { renderReferralPanel } from './referral-panel';
import { escapeHtml as esc, profileOptions } from './view-helpers';
import type { ShellState } from './view-state';

type CoinPanelState = Pick<ShellState, 'coinStatus' | 'giftBalance' | 'coinHistory' | 'giftItems' | 'receivedGifts' | 'referral' | 'profiles' | 'selectedProfile'>;

function ledgerDescription(reason: string, entryType: string): string {
  if (entryType === 'signup_bonus') return 'Starter HexiCoins';
  if (entryType === 'signup_adjustment') return 'Alpha balance adjustment';
  if (entryType === 'referral_new_user' || entryType === 'referral_referrer') return 'Referral bonus';
  if (entryType === 'gift_spend') return `Digital gift${reason.startsWith('gift:') ? ` · ${reason.slice(5).replaceAll('_', ' ')}` : ''}`;
  return 'Earlier HexiCoin activity';
}

export function renderCoinPanel(current: CoinPanelState): string {
  const unavailable = current.coinStatus === 'unavailable'
    ? '<div class="offline-status" role="status"><strong>HexiCoins are temporarily unavailable.</strong><span>Balances, gifts, and referral details could not be loaded, so sending and referral actions are paused. Try again later.</span></div>'
    : '';
  const loading = current.coinStatus === 'loading' ? '<p class="muted" role="status">Loading HexiCoins…</p>' : '';
  const ready = current.coinStatus === 'ready'
    ? `<div class="coin-balance"><strong>${current.giftBalance}</strong><span>free alpha HexiCoins</span></div>${current.giftItems.length ? `<form id="giftForm"><input id="giftRequestKey" type="hidden" value=""/><label>Send as<select id="giftSender">${profileOptions(current.profiles, current.selectedProfile)}</select></label><label>Recipient handle<input id="giftRecipient" placeholder="@someone" maxlength="30" required /></label><label>Gift<select id="giftChoice">${current.giftItems.map((gift) => `<option value="${esc(gift.gift_key)}">${esc(gift.icon)} ${esc(gift.name)} · ${gift.cost} coins</option>`).join('')}</select></label><label>Quantity<input id="giftQuantity" type="number" min="1" max="20" value="1" required /></label><label>Message (optional)<textarea id="giftNote" maxlength="300" placeholder="Say something kind"></textarea></label><button class="primary-button" type="submit">Send gift</button></form>` : '<p class="muted">No digital gifts are available right now.</p>'}<p class="muted">Gifts are non-transferable keepsakes; they do not add coins to the recipient’s balance. Coins cannot be bought, cashed out, or exchanged for money.</p><section class="received-gifts" aria-labelledby="received-gifts-title"><h3 id="received-gifts-title">Gifts you’ve received</h3>${current.receivedGifts.length ? `<ul>${current.receivedGifts.map((gift) => {
      const sender = gift.sender?.display_name || 'A HexiSpace member';
      const recipient = current.profiles.find((profile) => profile.id === gift.recipient_profile_id)?.display_name || 'your profile';
      const description = gift.note || gift.gift?.description || '';
      return `<li><span class="received-gift-mark" aria-hidden="true">${esc(gift.gift?.icon || '✦')}</span><span class="received-gift-copy"><strong>${esc(gift.gift?.name || 'Digital gift')}${gift.quantity > 1 ? ` × ${gift.quantity}` : ''}</strong><small>From ${esc(sender)} · For ${esc(recipient)} · ${esc(new Date(gift.created_at).toLocaleDateString())}</small>${description ? `<p>${esc(description)}</p>` : ''}</span></li>`;
    }).join('')}</ul>` : '<p class="muted">Gifts sent to your profiles will appear here.</p>'}</section>${current.coinHistory.length ? `<section class="coin-history" aria-labelledby="coin-history-title"><h3 id="coin-history-title">Recent coin activity</h3><ul>${current.coinHistory.map((entry) => `<li><span>${esc(ledgerDescription(entry.reason, entry.entry_type))}<small>${esc(new Date(entry.created_at).toLocaleString())}</small></span><strong class="${entry.delta < 0 ? 'coin-debit' : 'coin-credit'}">${entry.delta > 0 ? '+' : ''}${entry.delta.toLocaleString()}</strong></li>`).join('')}</ul></section>` : ''}${renderReferralPanel(current.referral)}`
    : '';
  return `<section class="panel full-panel gifts-panel"><p class="eyebrow">HEXICOINS</p><h2>Send a small digital gift</h2><p>HexiCoins are free alpha credits for non-redeemable digital gifts. They cannot be bought, cashed out, or exchanged for real money.</p>${unavailable}${loading}${ready}</section>`;
}
