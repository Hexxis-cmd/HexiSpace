import { describe, expect, it, vi } from 'vitest';
import { renderSharedPanels } from '../src/views/social-panels';
import type { Profile, RoomSummary } from '../src/lib/types';

const renderers = {
  escape: (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char),
  profileAvatar: () => '',
  profileOptions: () => ''
};

describe('Inbox', () => {
  it('uses familiar conversation language and provides new-message and group-chat actions', () => {
    const { roomPanel } = renderSharedPanels({ profiles: [], selectedProfile: '', rooms: [{ id: 'room-1', name: 'Chat with Mira', kind: 'protected', created_at: '' }], selectedRoom: 'room-1', roomMessages: [] }, renderers);
    expect(roomPanel).toContain('Conversations');
    expect(roomPanel).toContain('Private and group chats.');
    expect(roomPanel).toContain('Chat with Mira');
    expect(roomPanel).toContain('Private chat');
    expect(roomPanel).toContain('data-action="new-message"');
    expect(roomPanel).toContain('data-action="new-room"');
    expect(roomPanel).toContain('Create group chat');
  });

  it('does not expose conversations to signed-out visitors', () => {
    const { roomPanel } = renderSharedPanels({ profiles: [], selectedProfile: '', rooms: [{ id: 'room-1', name: 'Private conversation', kind: 'protected', created_at: '' }], selectedRoom: '', roomMessages: [], readOnly: true }, renderers);
    expect(roomPanel).toContain('Sign in to see your messages.');
    expect(roomPanel).not.toContain('Private conversation');
  });

  it('keeps a Hexonaut mail address distinct from the social Inbox', () => {
    const profile: Profile = { id: 'agent-1', kind: 'hexonaut', display_name: 'Mira', handle: 'mira', bio: '', avatar_url: null, banner_url: null, visibility: 'private', theme: 'hestia', created_at: '', inbox_address: 'mira@inbox.hexispace.local' };
    const { profilePanel } = renderSharedPanels({ profiles: [profile], selectedProfile: profile.id, rooms: [], selectedRoom: '', roomMessages: [] }, renderers);
    expect(profilePanel).toContain('mira@inbox.hexispace.local');
    expect(profilePanel).toContain('Open mailbox');
    expect(profilePanel).not.toContain('Open inbox');
  });
});

it('loads the rooms allowed by account-level row security, including joined conversations', async () => {
  const row: RoomSummary = { id: 'incoming-1', name: 'Incoming message', kind: 'protected', created_at: '' };
  const order = vi.fn().mockResolvedValue({ data: [row], error: null });
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  vi.doMock('../src/lib/supabase', () => ({ getSupabase: () => ({ from }) }));
  const { rooms } = await import('../src/lib/social-store');
  await expect(rooms()).resolves.toEqual([row]);
  expect(from).toHaveBeenCalledWith('rooms');
  expect(select).toHaveBeenCalledWith('id,name,kind,created_at');
  expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
});
