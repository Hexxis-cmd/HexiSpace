import type { User } from '@supabase/supabase-js';
import { attachMailboxToHexiGrid, inspectHexiGrid, isHexiGridLinked, linkedAgents, linkedConversation, linkedTasks } from '../lib/hexigrid-bridge';
import { feed, myProfiles, notifications, publicFeed, rooms } from '../lib/social-store';
import { activeMailboxes } from '../lib/mail-connector';
import { mailboxConnections, saveMailboxConnection } from '../lib/mail-store';
import { discoverGroups, groupMembers, myGroups } from '../lib/group-store';
import { coinHistory, giftBalance, giftCatalog, receivedGifts } from '../lib/gift-store';
import { myReferralStatus } from '../lib/referral-store';
import { renderSocialView } from './social-view';
import type { ShellState } from './view-state';
import { isHexiGridHash, navFromHash, selectSocialNav } from './social-navigation';
import { getMutedProfiles, getNotificationPreferences, visibleNotifications } from '../lib/social-preferences';
import { noticeMessage } from './notice';
import { isEmergencyStopped } from '../lib/emergency-stop';
import { discoverPosts } from '../lib/discovery-store';
import { socialLoadNotice } from '../lib/social-errors';

type ShellWiring = (root: HTMLElement, user: User) => void;
let wireShell: ShellWiring = () => undefined;
const state = new WeakMap<HTMLElement, ShellState>();

export function setShellWiring(wiring: ShellWiring): void {
  wireShell = wiring;
}

export function shellState(root: HTMLElement): ShellState {
  const existing = state.get(root);
  if (existing) return existing;
  const value: ShellState = {
    profiles: [], posts: [], rooms: [], groups: [], groupResults: [], groupQuery: '', groupMembers: [], selectedGroup: '', groupFeedId: '', groupPosts: [], giftItems: [], receivedGifts: [], giftBalance: 0, coinHistory: [], coinStatus: 'idle', referral: null, searchResults: [], searchQuery: '', mailboxes: [], alerts: [],
    notificationPrefs: { follows: true, friendRequests: true, comments: true, reactions: true, gifts: true }, mutedProfileIds: [], discoverPosts: [], discoverLoading: false, discoverError: '', selectedProfile: '', selectedRoom: '', roomMessages: [], linkedAgents: [], gridSelectedAgentId: '', gridConversation: [], gridConversationLoading: false, gridConversationSending: false, gridConversationMessage: '', gridTasks: [], gridTasksLoading: false, gridTasksChecked: false, gridTasksAvailable: false, gridTasksMessage: '', gridTaskSaving: false, liveWorkspaceOpen: false, liveWorkspaceStatus: 'idle', liveWorkspaceMessage: '', activeNav: 'feed', activeApp: 'space', gridRuntimeState: 'offline', gridRuntimeMessage: '', gridLinked: false, profileTab: 'posts', viewMode: 'human', panelOpen: false, panelDetailOpen: false, panelTab: 'settings', feedFilter: 'for-you', notice: '', busy: false, stopRoom: null, pairing: null, pairingBusy: false, preview: false, publicBrowse: false, emergencyStopped: isEmergencyStopped()
  };
  state.set(root, value);
  return value;
}

export function render(root: HTMLElement, user: User): void {
  shellState(root).emergencyStopped = isEmergencyStopped();
  renderSocialView(root, user, shellState(root), () => wireShell(root, user));
}

function applyRouteFromHash(current: ShellState): void {
  const hash = typeof window === 'undefined' ? '#feed' : window.location.hash;
  if (isHexiGridHash(hash)) {
    current.activeApp = 'grid'; current.panelOpen = false; current.panelDetailOpen = false;
    current.gridRuntimeState = current.preview || current.publicBrowse ? 'preview' : 'checking';
    current.gridRuntimeMessage = current.preview || current.publicBrowse ? 'Sign in to connect HexiGrid.' : 'Checking the local HexiGrid runtime.';
    return;
  }
  current.activeApp = 'space';
  selectSocialNav(current, navFromHash(hash));
}

export async function checkHexiGrid(root: HTMLElement, user: User): Promise<void> {
  const current = shellState(root);
  if (current.preview || current.publicBrowse) return;
  current.gridRuntimeState = 'checking'; current.gridRuntimeMessage = 'Checking the local HexiGrid runtime.';
  render(root, user);
  const result = await inspectHexiGrid();
  current.gridRuntimeState = result.connected ? 'online' : 'offline'; current.gridRuntimeMessage = result.message;
  current.gridLinked = result.connected && isHexiGridLinked();
  current.linkedAgents = [];
  current.gridTasks = []; current.gridTasksChecked = false; current.gridTasksAvailable = false; current.gridTasksMessage = '';
  if (current.gridLinked) {
    try { current.linkedAgents = await linkedAgents(); }
    catch (error) { current.gridRuntimeMessage = error instanceof Error ? error.message : 'HexiGrid is linked, but its approved agent access could not be loaded.'; }
    try { current.gridTasks = await linkedTasks(); current.gridTasksAvailable = true; }
    catch (error) {
      const detail = error instanceof Error ? error.message : '';
      current.gridTasksMessage = detail.includes('scheduled_work permission')
        ? 'Task access was not approved for this connection. Disconnect and reconnect HexiGrid, then select Scheduled work.'
        : detail || 'Scheduled work could not be loaded. Check the HexiGrid connection and try again.';
    }
    current.gridTasksChecked = true;
    current.gridLinked = isHexiGridLinked();
  }
  if (!result.connected) current.gridLinked = false;
  if (current.gridLinked) {
    current.gridSelectedAgentId = current.linkedAgents.some((agent) => agent.id === current.gridSelectedAgentId)
      ? current.gridSelectedAgentId
      : current.linkedAgents[0]?.id || '';
    if (current.gridSelectedAgentId) await loadLinkedConversation(root, user, current.gridSelectedAgentId, false);
    else { current.gridConversation = []; current.gridConversationMessage = ''; }
  } else if (!isHexiGridLinked()) {
    current.gridSelectedAgentId = ''; current.gridConversation = []; current.gridConversationMessage = '';
    current.gridTasks = []; current.gridTasksChecked = false; current.gridTasksAvailable = false; current.gridTasksMessage = '';
  }
  render(root, user);
}

export async function loadLinkedConversation(root: HTMLElement, user: User, agentId: string, renderBeforeLoad = true): Promise<void> {
  const current = shellState(root);
  current.gridSelectedAgentId = agentId;
  current.gridConversation = [];
  current.gridConversationLoading = Boolean(agentId);
  current.gridConversationMessage = '';
  if (!agentId || !isHexiGridLinked()) {
    current.gridConversationLoading = false;
    if (renderBeforeLoad) render(root, user);
    return;
  }
  if (renderBeforeLoad) render(root, user);
  try {
    const conversation = await linkedConversation(agentId);
    if (current.gridSelectedAgentId === agentId) current.gridConversation = conversation.messages;
  } catch (error) {
    if (current.gridSelectedAgentId === agentId) current.gridConversationMessage = error instanceof Error ? error.message : 'This conversation could not be loaded.';
    if (!isHexiGridLinked()) { current.gridLinked = false; current.linkedAgents = []; }
  } finally {
    if (current.gridSelectedAgentId === agentId) {
      current.gridConversationLoading = false;
      render(root, user);
      const transcript = root.querySelector<HTMLElement>('.grid-conversation');
      if (transcript) transcript.scrollTop = transcript.scrollHeight;
    }
  }
}

export async function load(root: HTMLElement, user: User): Promise<void> {
  const current = shellState(root);
  if (current.preview) { current.posts = []; current.notice = ''; render(root, user); return; }
  if (current.publicBrowse) {
    current.busy = true;
    try { current.posts = await publicFeed(); current.notice = ''; render(root, user); }
    catch (error) { current.notice = socialLoadNotice(error); render(root, user); }
    finally { current.busy = false; }
    return;
  }
  current.busy = true;
  try {
    current.notificationPrefs = getNotificationPreferences(user.id);
    current.mutedProfileIds = getMutedProfiles(user.id);
    current.profiles = await myProfiles(user.id);
    current.selectedProfile = current.selectedProfile || current.profiles[0]?.id || '';
    current.posts = (await feed(user.id, current.feedFilter)).filter((post) => !post.author_id || !current.mutedProfileIds.includes(post.author_id));
    current.rooms = await rooms();
    current.mailboxes = await mailboxConnections(user.id);
    for (const profile of current.profiles.filter((item) => item.kind === 'hexonaut')) for (const connection of activeMailboxes(profile.id)) {
      await saveMailboxConnection(user.id, connection);
      if (isHexiGridLinked() && !connection.hexigridMailboxId) {
        try { connection.hexigridMailboxId = (await attachMailboxToHexiGrid(connection)).mailbox.id; await saveMailboxConnection(user.id, connection); }
        catch { /* Browser-only mailbox use remains available without the HexiGrid mailbox scope. */ }
      }
    }
    current.mailboxes = await mailboxConnections(user.id);
    current.alerts = visibleNotifications(await notifications(user.id), current.notificationPrefs);
    render(root, user);
    await inspectBridge(root);
  } catch (error) {
    current.notice = socialLoadNotice(error); render(root, user);
  } finally { current.busy = false; }
}

export async function loadDiscoverPosts(root: HTMLElement, user: User): Promise<void> {
  const current = shellState(root);
  if (current.preview) {
    current.discoverPosts = [];
    current.discoverError = '';
    current.discoverLoading = false;
    return;
  }
  if (current.discoverLoading) return;
  current.discoverLoading = true;
  current.discoverError = '';
  render(root, user);
  try {
    const ownerId = current.publicBrowse ? undefined : user.id;
    current.discoverPosts = (await discoverPosts(ownerId)).filter((post) => !current.mutedProfileIds.includes(post.author_id));
  } catch {
    current.discoverPosts = [];
    current.discoverError = 'Public posts could not load. Check your connection and try again.';
  } finally {
    current.discoverLoading = false;
    render(root, user);
  }
}

export async function loadGroups(root: HTMLElement, user: User, query = ''): Promise<void> {
  const current = shellState(root); current.groupQuery = query.trim();
  if (current.preview) { current.groupResults = []; current.notice = 'Sign in to search and join groups.'; render(root, user); return; }
  if (current.publicBrowse) {
    try { current.groups = []; current.groupResults = await discoverGroups(query); current.notice = 'Public groups are viewable here. Sign in to join or create one.'; render(root, user); }
    catch (error) { setNotice(root, error); }
    return;
  }
  try { current.groups = await myGroups(user.id); current.groupResults = (await discoverGroups(query)).filter((group) => !current.groups.some((owned) => owned.id === group.id)); render(root, user); }
  catch (error) { setNotice(root, error); }
}

export async function loadGroupMembers(root: HTMLElement, user: User, groupId: string): Promise<void> {
  const current = shellState(root);
  if (current.preview || current.publicBrowse) { current.notice = 'Sign in to view group members.'; render(root, user); return; }
  try { current.selectedGroup = groupId; current.groupMembers = await groupMembers(groupId); render(root, user); }
  catch (error) { setNotice(root, error); }
}

export async function loadGroupFeed(root: HTMLElement, user: User, groupId: string): Promise<void> {
  const current = shellState(root);
  if (current.preview || current.publicBrowse) { current.notice = 'Sign in to view group posts.'; render(root, user); return; }
  try { current.groupFeedId = groupId; current.groupPosts = (await feed(user.id, 'for-you', groupId)).filter((post) => !post.author_id || !current.mutedProfileIds.includes(post.author_id)); render(root, user); }
  catch (error) { setNotice(root, error); }
}

export async function loadGifts(root: HTMLElement, user: User): Promise<void> {
  const current = shellState(root);
  if (current.preview || current.publicBrowse) { current.notice = 'Sign in to view HexiCoins gifts.'; render(root, user); return; }
  current.coinStatus = 'loading'; current.notice = ''; render(root, user);
  try {
    const referral = await myReferralStatus();
    const [balance, catalog, history, gifts] = await Promise.all([giftBalance(user.id), giftCatalog(), coinHistory(user.id), receivedGifts(current.profiles.map((profile) => profile.id))]);
    current.giftBalance = balance; current.giftItems = catalog; current.coinHistory = history; current.receivedGifts = gifts; current.referral = referral; current.coinStatus = 'ready'; current.notice = '';
    render(root, user);
  } catch {
    current.coinStatus = 'unavailable'; current.referral = null; current.giftItems = []; current.receivedGifts = []; current.coinHistory = []; current.notice = 'HexiCoins are temporarily unavailable. Please try again later.';
    render(root, user);
  }
}

export async function inspectBridge(root: HTMLElement): Promise<void> {
  const result = await inspectHexiGrid(); const target = root.querySelector('#hexigridStatus');
  if (target) { const linked = isHexiGridLinked(); target.innerHTML = `<strong>HexiGrid</strong><span class="${linked && result.connected ? 'online' : ''}">${escapeText(linked ? (result.connected ? 'Linked and reachable on this device.' : 'Linked for this browser session.') : result.message)}</span>`; }
}

function escapeText(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
}

export function setNotice(root: HTMLElement, error: unknown): void {
  const message = noticeMessage(error); const current = shellState(root); current.notice = message;
  const target = root.querySelector('#notice'); if (target) target.textContent = message;
}

export function requireOnline(root: HTMLElement): boolean {
  if (!shellState(root).preview && !shellState(root).publicBrowse) return true;
  setNotice(root, 'Sign in before creating or sending anything. Open the top-right menu, then Settings to connect online.');
  return false;
}

export async function renderApp(root: HTMLElement, user: User): Promise<void> {
  const current = shellState(root); applyRouteFromHash(current); render(root, user); await load(root, user);
  if (current.activeApp === 'grid') { void checkHexiGrid(root, user); return; }
  if (current.activeNav === 'groups') await loadGroups(root, user, current.groupQuery);
  if (current.activeNav === 'discover') await loadDiscoverPosts(root, user);
}

export function renderPreview(root: HTMLElement): void {
  const current = shellState(root); current.preview = true; applyRouteFromHash(current);
  current.profiles = []; current.posts = []; current.rooms = []; current.roomMessages = []; current.groups = []; current.groupMembers = []; current.groupPosts = []; current.giftItems = []; current.receivedGifts = []; current.giftBalance = 0; current.coinHistory = []; current.coinStatus = 'idle'; current.referral = null; current.alerts = []; current.linkedAgents = []; current.gridSelectedAgentId = ''; current.gridConversation = []; current.gridConversationMessage = ''; current.gridTasks = []; current.gridTasksChecked = false; current.gridTasksAvailable = false; current.gridTasksMessage = ''; current.searchResults = []; current.searchQuery = ''; current.selectedProfile = ''; current.selectedRoom = ''; current.notice = '';
  render(root, { id: 'preview-user', email: '' } as User);
}

export async function renderPublicBrowse(root: HTMLElement): Promise<void> {
  const current = shellState(root); current.preview = false; current.publicBrowse = true; applyRouteFromHash(current);
  current.profiles = []; current.rooms = []; current.roomMessages = []; current.groups = []; current.groupMembers = []; current.groupPosts = []; current.giftItems = []; current.receivedGifts = []; current.giftBalance = 0; current.coinHistory = []; current.coinStatus = 'idle'; current.referral = null; current.alerts = []; current.linkedAgents = []; current.gridSelectedAgentId = ''; current.gridConversation = []; current.gridConversationMessage = ''; current.gridTasks = []; current.gridTasksChecked = false; current.gridTasksAvailable = false; current.gridTasksMessage = ''; current.searchResults = []; current.searchQuery = ''; current.discoverPosts = []; current.discoverError = ''; current.selectedProfile = ''; current.selectedRoom = ''; current.notice = 'Browsing public posts. Sign in to interact.';
  await load(root, { id: 'public-visitor', email: '' } as User);
  if (current.activeNav === 'discover') await loadDiscoverPosts(root, { id: 'public-visitor', email: '' } as User);
}
