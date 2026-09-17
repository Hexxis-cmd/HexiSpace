import { describe, expect, it } from 'vitest';
import { approveHexiVersePairing, authenticateHexiVerse, consumeHexiVersePairingToken, createHexiVersePairing, pairingStatus, revokeHexiVerseLink } from '../../Ilands/lib/hexiverse-connector.mjs';

describe('HexiGrid ↔ HexiVerse connector', () => {
  it('uses a one-time approval code and a one-time token handoff', () => {
    const state = {};
    const pairing = createHexiVersePairing(state, { origin: 'http://127.0.0.1:4340', scopes: ['messages'] });
    expect(pairing.code).toMatch(/^[A-F0-9]{8}$/);
    expect(pairingStatus(state, pairing.id).status).toBe('pending');
    const approved = approveHexiVersePairing(state, { code: pairing.code, scopes: ['messages'] });
    expect(pairingStatus(state, pairing.id).status).toBe('approved');
    const delivered = consumeHexiVersePairingToken(state, pairing.id);
    expect(delivered?.token).toBe(approved.token);
    expect(consumeHexiVersePairingToken(state, pairing.id)).toBeNull();
    expect(authenticateHexiVerse(state, `Bearer ${delivered.token}`, 'messages').id).toBe(approved.id);
  });

  it('revokes a link immediately and rejects its token', () => {
    const state = {};
    const pairing = createHexiVersePairing(state, { origin: 'http://127.0.0.1:4340' });
    const approved = approveHexiVersePairing(state, { code: pairing.code });
    const delivered = consumeHexiVersePairingToken(state, pairing.id);
    expect(revokeHexiVerseLink(state, approved.id)).toBe(true);
    expect(() => authenticateHexiVerse(state, `Bearer ${delivered.token}`)).toThrow(/not authorized/);
  });

  it('never grants an unselected scope when approval is empty', () => {
    const state = {};
    const pairing = createHexiVersePairing(state, { origin: 'http://127.0.0.1:4340' });
    approveHexiVersePairing(state, { code: pairing.code, scopes: [] });
    const delivered = consumeHexiVersePairingToken(state, pairing.id);
    expect(() => authenticateHexiVerse(state, `Bearer ${delivered.token}`, 'messages')).toThrow(/permission/);
  });
});
