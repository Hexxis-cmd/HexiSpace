import { describe, expect, it } from 'vitest';
import { canAgentAct, containsPrivateIntent, safePostBody } from '../src/lib/policy';

describe('HexiVerse publication policy', () => {
  const profile = { id: 'hex', owner_id: 'owner', kind: 'hexonaut' as const, display_name: 'Hexonaut', handle: 'hexonaut', bio: '', avatar_url: null, banner_url: null, visibility: 'public' as const, theme: 'dark', created_at: new Date().toISOString() };
  it('detects private intent before an agent can publish', () => {
    expect(containsPrivateIntent('keep this between us')).toBe(true);
    expect(canAgentAct({ profile: { ...profile, bio: 'keep this private' }, grant: { id: 'grant', hexonaut_id: 'hex', enabled: true, capabilities: ['publish_post'], rooms: [], expires_at: null, max_actions_per_hour: 30 }, capability: 'publish_post', visibility: 'public' }).allowed).toBe(false);
  });

  it('requires an active grant and removes control characters', () => {
    expect(canAgentAct({ profile, grant: { id: 'grant', hexonaut_id: 'hex', enabled: true, capabilities: ['publish_post'], rooms: [], expires_at: null, max_actions_per_hour: 30 }, capability: 'publish_post', visibility: 'public' }).allowed).toBe(true);
    expect(canAgentAct({ profile, grant: null, capability: 'publish_post', visibility: 'public' }).allowed).toBe(false);
    expect(safePostBody('hello\u0000\u0007 world')).toBe('hello world');
  });
});
