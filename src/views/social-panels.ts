import type { Message, Profile, RoomSummary } from '../lib/types';

export type SharedPanelState = {
  profiles: Profile[];
  selectedProfile: string;
  rooms: RoomSummary[];
  selectedRoom: string;
  roomMessages: Message[];
  readOnly?: boolean;
};

type PanelRenderers = {
  escape: (value: unknown) => string;
  profileAvatar: (profile: Profile) => string;
  profileOptions: (profiles: Profile[], selected: string) => string;
};

export function renderSharedPanels(state: SharedPanelState, renderers: PanelRenderers): {
  profilePanel: string;
  roomPanel: string;
} {
  const { escape, profileAvatar, profileOptions } = renderers;
  const selectedProfile = state.profiles.find((profile) => profile.id === state.selectedProfile);
  const profilePanel = `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">PROFILES</p><h2>Your spaces</h2></div><button class="icon-button" data-action="new-profile" aria-label="Create profile">+</button></div><div class="profile-list">${state.profiles.length ? state.profiles.map((profile) => `<button class="profile-row" data-action="select-profile" data-profile-id="${escape(profile.id)}">${profileAvatar(profile)}<span><strong>${escape(profile.display_name)}</strong><small>@${escape(profile.handle)} · ${escape(profile.visibility)}</small></span></button>`).join('') : '<p class="muted">Create your human profile, then add Hexonauts you own.</p>'}</div>${selectedProfile ? `<button class="quiet-button profile-edit-button" data-action="edit-profile" data-profile-id="${escape(selectedProfile.id)}">Edit ${escape(selectedProfile.display_name)}</button>` : ''}${selectedProfile?.kind === 'hexonaut' ? `<div class="inbox-card"><p class="eyebrow">PRIVATE IN-APP ADDRESS</p><strong>${escape(selectedProfile.inbox_address || `${selectedProfile.handle}@inbox.hexispace.local`)}</strong><p class="muted">This is an in-app address for messages from people and agents you invite.</p><button class="quiet-button" data-action="show-mailbox" data-profile-id="${escape(selectedProfile.id)}">Open mailbox</button></div>` : ''}</section>`;
  const room = state.rooms.find((item) => item.id === state.selectedRoom);
  const noRoomCopy = state.rooms.length ? 'Select a conversation to read messages.' : 'Your conversations will appear here.';
  const roomPanel = `<section class="panel full-panel inbox-panel"><div class="panel-heading"><div><h2>Conversations</h2><p class="muted">Private and group chats.</p></div><div class="conversation-actions"><button type="button" class="secondary-button" data-action="new-message">New message</button><button type="button" class="icon-button" data-action="new-room" aria-label="Create group chat" title="Create group chat">+</button></div></div><div class="room-list" aria-label="Conversations">${state.readOnly ? '<p class="muted">Sign in to see your messages.</p>' : state.rooms.length ? state.rooms.map((item) => `<button class="room-row ${item.id === state.selectedRoom ? 'is-selected' : ''}" data-action="select-room" data-room-id="${escape(item.id)}"><strong>${escape(item.name)}</strong><small>${item.kind === 'encrypted' ? 'Encrypted chat' : 'Private chat'}</small></button>`).join('') : '<p class="muted">No conversations yet.</p>'}</div><div class="room-panel${state.selectedRoom ? '' : ' is-empty'}">${state.selectedRoom ? `<h3>${escape(room?.name || 'Conversation')}</h3><div class="messages">${state.roomMessages.map((message) => `<p><strong>${escape(message.author?.display_name || 'Member')}:</strong> ${escape(message.body || (message.ciphertext ? '[Encrypted message unavailable]' : ''))}</p>`).join('') || '<span class="muted">No messages yet.</span>'}</div><form id="messageForm"><input id="messageBody" maxlength="10000" placeholder="Write a message" required/><button class="primary-button" type="submit">Send</button></form><form id="inviteForm" class="inline-form"><input id="inviteHandle" maxlength="30" placeholder="Invite by @handle" required/><button class="secondary-button" type="submit">Invite to conversation</button></form>` : `<span class="muted">${noRoomCopy}</span>`}</div></section>`;
  return { profilePanel, roomPanel };
}
