import type { User } from '@supabase/supabase-js';
import { signOut } from '../lib/auth';
import { askLinkedAgent, clearLinkedConversation, disconnectHexiGridMailbox, isHexiGridLinked } from '../lib/hexigrid-bridge';
import { addRoomMember, deleteSocialContent, exportAccountData, profileByHandle, subscribeToRoom, toggleFollow, toggleReaction, requestFriendship } from '../lib/social-store';
import { searchEverything } from '../lib/search-store';
import { activeMailboxes, disconnectMailbox } from '../lib/mail-connector';
import { mailboxConnections, revokeMailboxConnection } from '../lib/mail-store';
import { disablePreviewMode } from '../lib/preview';
import { joinGroup, moderateGroupMember, setGroupRole, groupMembers } from '../lib/group-store';
import { shareRoomKey } from '../lib/crypto-room';
import { bindMenuDismissal, focusPanelClose, focusPanelToggle } from './menu-behavior';
import { modal } from './dialog';
import { checkHexiGrid, inspectBridge, load, loadDiscoverPosts, loadGroupFeed, loadGroupMembers, loadGroups, loadGifts, loadLinkedConversation, render, requireOnline, setNotice, shellState } from './shell-runtime';
import { commentModal, connectMailbox, createGroupFlow, createProfileFlow, createRoomFlow, disconnectGridLink, editGroup, editProfile, loadRoom, openExternalMailbox, openHexiGrid, openLiveWorkspace, openMailbox, openNewMessage, openPostComposer, openProfile, pair, reportPostModal, sendGiftFlow, submitMessage, submitPost, waitPairing } from './shell-actions';
import { saveNotificationPreferences, visibleNotifications, setProfileMuted } from '../lib/social-preferences';
import { hashForNav, isHexiGridHash, navFromHash, selectSocialNav, type SocialNavKey } from './social-navigation';
import type { FeedFilter, GroupMember, MailProvider } from '../lib/types';
import type { ProfileTab } from './profile-space';
import { connectModelFlow, saveThemeFromControl, unlockModelFlow } from './model-actions';
import { emergencyStopFlow, resumeAgentFlow } from './safety-actions';
import { copyReferralCode, submitReferralFlow } from './referral-actions';
import { cancelGridTask, createGridTask, refreshGridTasks } from './grid-task-actions';

/** Attach the shell's interaction layer once; rendered controls are handled by delegation. */
export function wire(root: HTMLElement, user: User): void {
  bindMenuDismissal(root, () => shellState(root).panelOpen, () => { const current = shellState(root); current.panelOpen = false; current.liveWorkspaceOpen = false; render(root, user); });
  const groupSearch = root.querySelector<HTMLInputElement>('#groupSearch');
  if (groupSearch) groupSearch.value = shellState(root).groupQuery;
  if (root.dataset.shellEventsBound === 'true') return;
  root.dataset.shellEventsBound = 'true';

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const brand = target.closest<HTMLElement>('.brand');
    if (brand) {
      if (shellState(root).activeNav === 'feed' && window.location.hash === '#feed') return;
      event.preventDefault();
      navigate(root, user, 'feed');
      return;
    }
    const control = target.closest<HTMLElement>('[data-action], [data-nav], [data-panel-tab], [data-profile-tab]');
    if (!control || control.dataset.action === 'close-dialog') return;
    const action = control.dataset.action;
    const current = shellState(root);
    switch (action) {
      case 'exit-preview': disablePreviewMode(); window.location.reload(); return;
      case 'open-hexigrid': openHexiGrid(root, user); return;
      case 'check-hexigrid': void checkHexiGrid(root, user); return;
      case 'toggle-panel': { const wasOpen = current.panelOpen; current.panelOpen = !wasOpen; current.panelDetailOpen = false; if (wasOpen) current.liveWorkspaceOpen = false; render(root, user); current.panelOpen ? focusPanelClose(root) : focusPanelToggle(root); return; }
      case 'close-panel': current.panelOpen = false; current.panelDetailOpen = false; current.liveWorkspaceOpen = false; render(root, user); focusPanelToggle(root); return;
      case 'open-live-workspace': void openLiveWorkspace(root, user); return;
      case 'close-live-workspace': current.liveWorkspaceOpen = false; render(root, user); return;
      case 'back-to-account-menu': current.panelDetailOpen = false; render(root, user); return;
      case 'toggle-view-mode': current.viewMode = current.viewMode === 'human' ? 'agent' : 'human'; current.panelOpen = false; render(root, user); return;
      case 'emergency-stop': void emergencyStopFlow(root, user); return;
      case 'resume-agent-actions': resumeAgentFlow(root, user); return;
      case 'new-post': openPostComposer(root, user); return;
      case 'new-message': openNewMessage(root, user); return;
      case 'open-agent-live': current.panelTab = 'live'; current.panelDetailOpen = true; current.panelOpen = true; render(root, user); focusPanelClose(root); return;
      case 'open-agent-settings': current.panelTab = 'settings'; current.panelDetailOpen = true; current.panelOpen = true; render(root, user); focusPanelClose(root); return;
      case 'show-all-profiles': current.activeNav = 'profile'; current.panelOpen = false; current.panelDetailOpen = false; render(root, user); return;
      case 'help-support': modal('Help & support', '<p>Open a profile to mute, block, or report it. Use Settings &amp; privacy to change notifications and manage your data.</p><p class="muted">If something is broken, include the page name, what you clicked, and what you expected to happen.</p>'); return;
      case 'report-problem': modal('Report a problem', '<p>Profile reports are available from the profile card. For a general problem, write down what happened, which page you were on, and any message you saw, then send it through the project support channel.</p><p class="muted">Never include passwords, API keys, recovery codes, or private messages in a report.</p>'); return;
      case 'open-profile': openProfile(root, user, control.dataset.profileId || ''); return;
      case 'report-post': reportPostModal(root, user, control.dataset.postId || ''); return;
      case 'edit-profile': editProfile(root, user, control.dataset.profileId || ''); return;
      case 'sign-out': void signOut().catch((error) => setNotice(root, error)); return;
      case 'connect-gmail': void connectMailbox(root, 'gmail'); return;
      case 'connect-outlook': void connectMailbox(root, 'outlook'); return;
      case 'disconnect-mailbox': void disconnectMailboxFlow(root, user, control); return;
      case 'open-mailbox': void openExternalMailbox(root, control.dataset.profileId || '', control.dataset.provider as MailProvider, control.dataset.email || ''); return;
      case 'refresh-feed': void load(root, user); return;
      case 'refresh-discover': void loadDiscoverPosts(root, user); return;
      case 'clear-search': current.searchQuery = ''; current.searchResults = []; current.groupResults = []; render(root, user); return;
      case 'join-group': void joinGroupFlow(root, user, control); return;
      case 'view-group': void loadGroupFeed(root, user, control.dataset.groupId || ''); return;
      case 'close-group-feed': current.groupFeedId = ''; current.groupPosts = []; render(root, user); return;
      case 'manage-group': void loadGroupMembers(root, user, control.dataset.groupId || ''); return;
      case 'edit-group': editGroup(root, user, control.dataset.groupId || ''); return;
      case 'close-group-manager': current.selectedGroup = ''; current.groupMembers = []; render(root, user); return;
      case 'member-status': void updateMemberStatus(root, user, control); return;
      case 'member-role': void updateMemberRole(root, user, control); return;
      case 'select-room': void selectRoom(root, user, control.dataset.roomId || ''); return;
      case 'select-profile': current.selectedProfile = control.dataset.profileId || ''; current.panelOpen = false; current.panelDetailOpen = false; current.activeNav = 'profile'; render(root, user); return;
      case 'show-mailbox': void openMailbox(root, control.dataset.profileId || ''); return;
      case 'pair-hexigrid': void pair(root, user); return;
      case 'wait-pairing': void waitPairing(root, user); return;
      case 'disconnect-hexigrid': void disconnectGridLink(root, user); return;
      case 'refresh-grid-tasks': void refreshGridTasks(root, user); return;
      case 'cancel-grid-task': void cancelGridTask(root, user, control.dataset.taskId || ''); return;
      case 'clear-agent-conversation': void clearAgentConversation(root, user); return;
      case 'react': void reactToPost(root, user, control.dataset.postId || ''); return;
      case 'comment': commentModal(root, user, control.dataset.postId || ''); return;
      case 'share': void copyPostLink(root, control.dataset.postId || ''); return;
      case 'follow-profile': void followProfile(root, control.dataset.profileId || ''); return;
      case 'friend-profile': void friendProfile(root, control.dataset.profileId || ''); return;
      case 'new-profile': openCreateProfile(root, user); return;
      case 'new-room': openCreateRoom(root, user); return;
      case 'new-group': openCreateGroup(root, user); return;
      case 'copy-referral': void copyReferralCode(root, control.dataset.code || ''); return;
    }
    if (control.dataset.nav) { navigate(root, user, control.dataset.nav as SocialNavKey); return; }
    if (control.dataset.panelTab) { current.panelTab = control.dataset.panelTab as import('./utility-panel').UtilityTab; current.panelDetailOpen = true; current.panelOpen = true; current.liveWorkspaceOpen = false; render(root, user); focusPanelClose(root); if (current.panelTab === 'gifts') void loadGifts(root, user); return; }
    if (control.dataset.profileTab) { current.profileTab = control.dataset.profileTab as ProfileTab; render(root, user); }
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      if (target.form?.id === 'giftForm' && target.id !== 'giftRequestKey') {
        const requestKey = target.form.querySelector<HTMLInputElement>('#giftRequestKey');
        if (requestKey) requestKey.value = '';
      }
    }
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.id === 'feedFilter') { shellState(root).feedFilter = target.value as FeedFilter; void load(root, user); }
    if (target.id === 'appTheme') { saveThemeFromControl(root, target.value); render(root, user); }
    if (target.id === 'modelProvider') {
      const endpoint = root.querySelector<HTMLInputElement>('#modelEndpoint');
      const advanced = root.querySelector<HTMLDetailsElement>('#modelAdvancedOptions');
      const selected = target.selectedOptions[0]?.dataset.endpoint || '';
      const compatible = target.value === 'openai-compatible';
      if (endpoint) {
        if (compatible) {
          if (!endpoint.dataset.customized) endpoint.value = '';
          endpoint.required = true;
        } else {
          endpoint.value = selected;
          endpoint.dataset.customized = '';
          endpoint.required = false;
        }
      }
      if (advanced) advanced.open = compatible;
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === 'modelEndpoint') {
      target.dataset.customized = target.value.trim() ? 'true' : '';
    }
  });

  root.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (target instanceof Element) target.closest<HTMLButtonElement>('button')?.classList.add('is-pressed');
  });
  root.addEventListener('pointerup', (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
    if (!button) return;
    button.classList.remove('is-pressed'); button.classList.add('button-release'); window.setTimeout(() => button.classList.remove('button-release'), 220);
  });
  root.addEventListener('pointercancel', (event) => {
    const target = event.target;
    if (target instanceof Element) target.closest<HTMLButtonElement>('button')?.classList.remove('is-pressed');
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.id !== 'linkedAgentId') return;
    void loadLinkedConversation(root, user, target.value);
  });

  root.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    switch (form.id) {
      case 'notificationPrefsForm': saveNotificationPrefs(event, root, user, form); break;
      case 'globalSearchForm': void globalSearch(event, root, user); break;
      case 'groupSearchForm': void loadGroups(root, user, (root.querySelector('#groupSearch') as HTMLInputElement).value); break;
      case 'agentChatForm': void agentChat(event, root, user); break;
      case 'gridTaskForm': void createGridTask(event, root, user); break;
      case 'profileForm': void createProfileFlow(event, root, user); break;
      case 'roomForm': void createRoomFlow(event, root, user); break;
      case 'groupForm': void createGroupFlow(event, root, user); break;
      case 'postForm': void submitPost(event, root, user); break;
      case 'giftForm': void sendGiftFlow(event, root, user); break;
      case 'referralForm': void submitReferralFlow(event, root, user); break;
      case 'messageForm': void submitMessage(event, root, user); break;
      case 'inviteForm': void inviteMember(event, root); break;
      case 'modelConnectionForm': void connectModelFlow(event, root, user); break;
      case 'modelUnlockForm': void unlockModelFlow(event, root); break;
    }
  });

  if (root.dataset.routeBound !== 'true') {
    root.dataset.routeBound = 'true';
    window.addEventListener('hashchange', () => {
      const state = shellState(root);
      if (isHexiGridHash(window.location.hash)) { if (state.activeApp === 'grid') return; state.activeApp = 'grid'; state.panelOpen = false; state.panelDetailOpen = false; state.gridRuntimeState = state.preview || state.publicBrowse ? 'preview' : 'checking'; state.gridRuntimeMessage = state.preview || state.publicBrowse ? 'Sign in to connect HexiGrid.' : 'Checking the local HexiGrid runtime.'; render(root, user); if (!state.preview && !state.publicBrowse) void checkHexiGrid(root, user); return; }
      const nav = navFromHash(window.location.hash); if (state.activeApp === 'space' && state.activeNav === nav) return; selectSocialNav(state, nav); render(root, user); if (nav === 'groups') void loadGroups(root, user); if (nav === 'discover') void loadDiscoverPosts(root, user);
    });
  }
}

function navigate(root: HTMLElement, user: User, nav: SocialNavKey): void { selectSocialNav(shellState(root), nav); if (window.location.hash !== hashForNav(nav)) window.history.replaceState(null, '', hashForNav(nav)); render(root, user); if (nav === 'groups') void loadGroups(root, user); if (nav === 'discover') void loadDiscoverPosts(root, user); }
function openCreateProfile(root: HTMLElement, user: User): void { if (!requireOnline(root)) return; modal('Create a profile', `<form id="profileForm"><label>Profile type<select id="profileKind"><option value="human">Human</option><option value="hexonaut">Hexonaut</option></select></label><p class="muted">A Hexonaut is an AI resident you manage. When you create one, HexiSpace gives it a private in-app address automatically.</p><label>Name<input id="profileName" maxlength="80" required></label><label>Handle<input id="profileHandle" maxlength="30" pattern="[a-zA-Z0-9_]+" required></label><label>Visibility<select id="profileVisibility"><option value="private">Private</option><option value="friends">Friends</option><option value="public">Public</option></select></label><button class="primary-button" type="submit">Create profile</button></form>`); document.querySelector('#profileForm')?.addEventListener('submit', (event) => void createProfileFlow(event, root, user)); }
function openCreateRoom(root: HTMLElement, user: User): void { if (!requireOnline(root)) return; modal('Create a group chat', `<form id="roomForm"><label>Group chat name<input id="roomName" maxlength="120" required></label><label>Privacy<select id="roomKind"><option value="protected">Private — invited members only</option><option value="encrypted">End-to-end encrypted</option></select></label><p class="muted">Encrypted chats keep message contents unreadable to the social service. Save recovery material safely.</p><button class="primary-button" type="submit">Create group chat</button></form>`); document.querySelector('#roomForm')?.addEventListener('submit', (event) => void createRoomFlow(event, root, user)); }
function openCreateGroup(root: HTMLElement, user: User): void { if (!requireOnline(root)) return; modal('Create a group', `<form id="groupForm"><label>Group name<input id="groupName" maxlength="100" required></label><label>Group handle<input id="groupHandle" maxlength="30" pattern="[a-zA-Z0-9_]+" placeholder="example_group" required></label><label>Description<textarea id="groupDescription" maxlength="2000"></textarea></label><label>Community rules<textarea id="groupRules" maxlength="4000" placeholder="Write the rules members will see."></textarea></label><label>Privacy<select id="groupVisibility"><option value="public">Public — anyone can join</option><option value="approval">Approval required</option><option value="private">Private — invite only</option><option value="hidden">Hidden — invite only and not searchable</option></select></label><button class="primary-button" type="submit">Create group</button></form>`); document.querySelector('#groupForm')?.addEventListener('submit', (event) => void createGroupFlow(event, root, user)); }
async function disconnectMailboxFlow(root: HTMLElement, user: User, button: HTMLElement): Promise<void> { if (!window.confirm('Disconnect this mailbox from HexiSpace? The email account itself will not be deleted.')) return; try { const connection = activeMailboxes(button.dataset.profileId || '').find((item) => item.provider === button.dataset.provider && item.email.toLowerCase() === (button.dataset.email || '').toLowerCase()); const linkedMailboxId = button.dataset.hexigridMailboxId || shellState(root).mailboxes.find((item) => item.id === (button.dataset.mailboxId || ''))?.hexigrid_mailbox_id || connection?.hexigridMailboxId || ''; if (linkedMailboxId && isHexiGridLinked()) await disconnectHexiGridMailbox(linkedMailboxId); await revokeMailboxConnection(user.id, button.dataset.mailboxId || ''); disconnectMailbox(button.dataset.profileId || '', button.dataset.provider as MailProvider, button.dataset.email || ''); setNotice(root, 'Mailbox disconnected.'); await load(root, user); } catch (error) { setNotice(root, error); } }
async function joinGroupFlow(root: HTMLElement, user: User, button: HTMLElement): Promise<void> { if (!requireOnline(root)) return; try { const current = shellState(root); const profileId = (root.querySelector('#groupProfile') as HTMLSelectElement)?.value || current.selectedProfile; if (!profileId) throw new Error('Create a profile before joining a group.'); const membership = await joinGroup(button.dataset.groupId || '', profileId); setNotice(root, membership.status === 'pending' ? 'Join request sent for approval.' : 'You joined the group.'); await loadGroups(root, user); } catch (error) { setNotice(root, error); } }
async function updateMemberStatus(root: HTMLElement, user: User, button: HTMLElement): Promise<void> { if (!requireOnline(root)) return; try { const current = shellState(root); await moderateGroupMember(button.dataset.groupId || '', button.dataset.profileId || '', button.dataset.status as GroupMember['status']); current.groupMembers = await groupMembers(button.dataset.groupId || ''); current.notice = 'Member status updated.'; render(root, user); } catch (error) { setNotice(root, error); } }
async function updateMemberRole(root: HTMLElement, user: User, button: HTMLElement): Promise<void> { if (!requireOnline(root)) return; try { const current = shellState(root); await setGroupRole(button.dataset.groupId || '', button.dataset.profileId || '', button.dataset.role as Exclude<GroupMember['role'], 'owner'>); current.groupMembers = await groupMembers(button.dataset.groupId || ''); current.notice = 'Moderator access updated.'; render(root, user); } catch (error) { setNotice(root, error); } }
async function selectRoom(root: HTMLElement, user: User, roomId: string): Promise<void> { const current = shellState(root); current.selectedRoom = roomId; selectSocialNav(current, 'inbox'); if (window.location.hash !== '#inbox') window.history.replaceState(null, '', '#inbox'); if (current.preview || current.publicBrowse) { current.notice = 'Sign in to view your messages.'; render(root, user); return; } await loadRoom(root, roomId); current.stopRoom?.(); current.stopRoom = subscribeToRoom(roomId, () => void loadRoom(root, roomId)); render(root, user); }
async function reactToPost(root: HTMLElement, user: User, postId: string): Promise<void> { if (!requireOnline(root)) return; try { await toggleReaction(postId, shellState(root).selectedProfile); await load(root, user); } catch (error) { setNotice(root, error); } }
async function copyPostLink(root: HTMLElement, postId: string): Promise<void> { try { await navigator.clipboard?.writeText(`${window.location.origin}/#post-${postId}`); setNotice(root, 'Post link copied.'); } catch { setNotice(root, 'Copying is unavailable in this browser.'); } }
async function followProfile(root: HTMLElement, profileId: string): Promise<void> { if (!requireOnline(root)) return; try { if (!shellState(root).selectedProfile) throw new Error('Create or select a profile first.'); await toggleFollow(shellState(root).selectedProfile, profileId); setNotice(root, 'Follow preference saved.'); } catch (error) { setNotice(root, error); } }
async function friendProfile(root: HTMLElement, profileId: string): Promise<void> { if (!requireOnline(root)) return; try { if (!shellState(root).selectedProfile) throw new Error('Create or select a profile first.'); await requestFriendship(shellState(root).selectedProfile, profileId); setNotice(root, 'Friend request sent.'); } catch (error) { setNotice(root, error); } }
async function saveNotificationPrefs(event: SubmitEvent, root: HTMLElement, user: User, form: HTMLFormElement): Promise<void> { event.preventDefault(); const current = shellState(root); current.notificationPrefs = { follows: (form.elements.namedItem('follows') as HTMLInputElement).checked, friendRequests: (form.elements.namedItem('friendRequests') as HTMLInputElement).checked, comments: (form.elements.namedItem('comments') as HTMLInputElement).checked, reactions: (form.elements.namedItem('reactions') as HTMLInputElement).checked, gifts: (form.elements.namedItem('gifts') as HTMLInputElement).checked }; if (!current.preview && !current.publicBrowse) saveNotificationPreferences(user.id, current.notificationPrefs); current.alerts = visibleNotifications(current.alerts, current.notificationPrefs); current.notice = current.preview || current.publicBrowse ? 'Sign in to save notification choices.' : 'Notification choices saved.'; render(root, user); }
async function globalSearch(event: SubmitEvent, root: HTMLElement, user: User): Promise<void> { event.preventDefault(); try { const current = shellState(root); const query = (root.querySelector('#globalSearch') as HTMLInputElement).value.trim(); current.searchQuery = query; if (current.preview) { current.searchResults = []; current.groupResults = []; current.activeNav = 'discover'; current.notice = 'Sign in to search people, Hexonauts, groups, and posts.'; if (window.location.hash !== '#explore') window.history.replaceState(null, '', '#explore'); render(root, user); return; } current.searchResults = await searchEverything(query); current.groupResults = current.searchResults.filter((result) => result.type === 'group').map((result) => result.group); current.activeNav = 'discover'; if (window.location.hash !== '#explore') window.history.replaceState(null, '', '#explore'); render(root, user); void loadDiscoverPosts(root, user); } catch (error) { setNotice(root, error); } }
async function agentChat(event: SubmitEvent, root: HTMLElement, user: User): Promise<void> {
  event.preventDefault();
  const current = shellState(root);
  const agentId = (root.querySelector('#linkedAgentId') as HTMLSelectElement | null)?.value || current.gridSelectedAgentId;
  const body = (root.querySelector('#agentChatBody') as HTMLTextAreaElement | null)?.value.trim() || '';
  if (current.preview || current.publicBrowse) { current.notice = 'Sign in and link HexiGrid before sending a message to an agent.'; render(root, user); return; }
  if (!agentId || !body || current.gridConversationSending) return;
  current.gridSelectedAgentId = agentId;
  current.gridConversationSending = true;
  current.gridConversationMessage = '';
  render(root, user);
  try {
    const result = await askLinkedAgent(agentId, body);
    if (current.gridSelectedAgentId === agentId) current.gridConversation = result.conversation.messages;
  } catch (error) {
    if (!isHexiGridLinked()) { current.gridLinked = false; current.linkedAgents = []; current.gridSelectedAgentId = ''; current.gridConversation = []; current.gridConversationLoading = false; current.gridConversationSending = false; current.gridConversationMessage = ''; }
    if (current.gridSelectedAgentId === agentId) current.gridConversationMessage = error instanceof Error ? error.message : 'The agent could not reply.';
  } finally {
    if (current.gridSelectedAgentId === agentId) {
      current.gridConversationSending = false;
      render(root, user);
      const transcript = root.querySelector<HTMLElement>('.grid-conversation');
      if (transcript) transcript.scrollTop = transcript.scrollHeight;
    }
  }
}

async function clearAgentConversation(root: HTMLElement, user: User): Promise<void> {
  const current = shellState(root);
  const agentId = current.gridSelectedAgentId;
  if (!agentId || current.gridConversationSending || !current.gridConversation.length) return;
  if (!window.confirm('Clear this saved conversation from the local HexiGrid workspace? This cannot be undone.')) return;
  try {
    const conversation = await clearLinkedConversation(agentId);
    if (current.gridSelectedAgentId === agentId) {
      current.gridConversation = conversation.messages;
      current.gridConversationMessage = '';
      render(root, user);
    }
  } catch (error) {
    setNotice(root, error);
    render(root, user);
  }
}
async function inviteMember(event: SubmitEvent, root: HTMLElement): Promise<void> { event.preventDefault(); if (!requireOnline(root)) return; try { const current = shellState(root); const profile = await profileByHandle((root.querySelector('#inviteHandle') as HTMLInputElement).value); await addRoomMember(current.selectedRoom, profile.id); const room = current.rooms.find((item) => item.id === current.selectedRoom); if (room?.kind === 'encrypted') await shareRoomKey(current.selectedRoom, profile.id); setNotice(root, `${profile.display_name} was invited.`); } catch (error) { setNotice(root, error); } }
