import { describe, expect, it } from 'vitest';
import { renderCoinPanel } from '../src/views/coin-panel';

const base = {
  giftBalance: 1000,
  coinHistory: [{ id: 'ledger-1', delta: 1000, reason: 'alpha_starter_credits', entry_type: 'signup_bonus' as const, created_at: new Date().toISOString() }],
  giftItems: [{ id: 'gift-1', gift_key: 'signal', name: 'Signal', description: '', cost: 5, icon: '✦', enabled: true }],
  receivedGifts: [],
  referral: { referral_code: 'HX-1234-ABCD-5678-EF90', referral_deadline: new Date(Date.now() + 60_000).toISOString(), claim_status: null, credited_at: null },
  profiles: [],
  selectedProfile: ''
};

describe('HexiCoin panel readiness states', () => {
  it('does not present a fake zero balance or an active form while service data is unavailable', () => {
    const html = renderCoinPanel({ ...base, coinStatus: 'unavailable' });
    expect(html).toContain('HexiCoins are temporarily unavailable.');
    expect(html).toContain('sending and referral actions are paused');
    expect(html).not.toContain('id="giftForm"');
    expect(html).not.toContain('HX-1234-ABCD-5678-EF90');
    expect(html).not.toContain('<strong>1000</strong>');
  });

  it('shows a loading state without exposing stale actions', () => {
    const html = renderCoinPanel({ ...base, coinStatus: 'loading' });
    expect(html).toContain('Loading HexiCoins');
    expect(html).not.toContain('id="giftForm"');
    expect(html).not.toContain('Invite friends');
  });

  it('shows balance, a bounded gift form, and referral controls after all service data loads', () => {
    const html = renderCoinPanel({ ...base, coinStatus: 'ready' });
    expect(html).toContain('<strong>1000</strong>');
    expect(html).toContain('id="giftForm"');
    expect(html).toContain('min="1" max="20"');
    expect(html).toContain('data-action="copy-referral"');
    expect(html).toContain('Recent coin activity');
    expect(html).toContain('Gifts you’ve received');
    expect(html).toContain('Gifts sent to your profiles will appear here.');
    expect(html).toContain('Starter HexiCoins');
    expect(html).toContain('+1,000');
  });

  it('shows incoming gifts safely without implying the recipient gets coins', () => {
    const html = renderCoinPanel({
      ...base,
      coinStatus: 'ready',
      profiles: [{ id: 'profile-1', display_name: 'My Hexonaut', handle: 'nova', kind: 'hexonaut' } as never],
      receivedGifts: [{
        id: 'send-1', sender_profile_id: 'sender-1', recipient_profile_id: 'profile-1', gift_id: 'gift-1',
        quantity: 2, note: '<img src=x onerror=alert(1)>', created_at: new Date().toISOString(),
        sender: { id: 'sender-1', kind: 'human', display_name: '<script>sender</script>', handle: 'sender', avatar_url: null },
        gift: { gift_key: 'signal', name: '<script>Signal</script>', description: '', cost: 5, icon: '<svg>' }
      }]
    });
    expect(html).toContain('Gifts you’ve received');
    expect(html).toContain('My Hexonaut');
    expect(html).toContain('× 2');
    expect(html).toContain('Gifts are non-transferable keepsakes');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg>');
  });
});
