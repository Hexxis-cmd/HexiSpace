import type { HexiGridConversationMessage, HexiGridTask, LinkedAgent, PairingRequest } from '../lib/hexigrid-bridge';
import { approvalUrl } from '../lib/hexigrid-bridge';
import { escapeHtml } from './view-helpers';
import { renderGridTasks } from './grid-task-view';

export type HexiGridRuntimeState = 'preview' | 'checking' | 'online' | 'offline';

function safeOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function renderPairing(pairing: PairingRequest | null, waiting: boolean): string {
  if (!pairing) return '';
  const approve = escapeHtml(approvalUrl(pairing));
  const expires = escapeHtml(new Date(pairing.expiresAt).toLocaleTimeString());
  return `<div class="grid-pairing-result" id="pairingResult"><p class="eyebrow">ONE-TIME PAIRING CODE</p><strong class="pairing-code">${escapeHtml(pairing.code)}</strong><p>Open the approval page on the computer running HexiGrid, sign in there, and choose only the permissions you want to allow.</p><a class="secondary-button link-button" href="${approve}" target="_blank" rel="noopener noreferrer">Review permissions in HexiGrid</a><button class="primary-button" type="button" data-action="wait-pairing" ${waiting ? 'disabled' : ''}>${waiting ? 'Waiting for approval…' : 'Finish connecting'}</button><small>This code expires at ${expires}.</small></div>`;
}

function renderAgentChat(agents: LinkedAgent[], selectedAgentId: string, conversation: HexiGridConversationMessage[], loading: boolean, sending: boolean, message: string): string {
  if (!agents.length) return '';
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0];
  const transcript = loading
    ? '<p class="grid-conversation-empty">Loading conversation…</p>'
    : conversation.length
      ? conversation.map((entry) => {
        const author = entry.role === 'user' ? 'You' : selectedAgent.name;
        const date = new Date(entry.createdAt);
        const time = Number.isNaN(date.getTime()) ? '' : `<time datetime="${escapeHtml(date.toISOString())}">${escapeHtml(date.toLocaleString())}</time>`;
        return `<article class="grid-conversation-message is-${entry.role}"><header><strong>${escapeHtml(author)}</strong>${time}</header><p>${escapeHtml(entry.content)}</p></article>`;
      }).join('')
      : `<p class="grid-conversation-empty">Start a conversation with ${escapeHtml(selectedAgent.name)}.</p>`;
  return `<section class="grid-agent-chat" aria-label="Conversation with linked agent"><label for="linkedAgentId">Agent</label><select id="linkedAgentId" required ${loading || sending ? 'disabled' : ''}>${agents.map((agent) => `<option value="${escapeHtml(agent.id)}" ${agent.id === selectedAgent.id ? 'selected' : ''}>${escapeHtml(agent.name)} · ${escapeHtml(agent.model || 'Selected model')}</option>`).join('')}</select><div class="grid-conversation" role="log" aria-label="Conversation with ${escapeHtml(selectedAgent.name)}" aria-live="polite" aria-relevant="additions text" aria-busy="${loading ? 'true' : 'false'}">${transcript}</div>${message ? `<p class="grid-conversation-error" role="status">${escapeHtml(message)}</p>` : ''}<form id="agentChatForm"><label for="agentChatBody">Message ${escapeHtml(selectedAgent.name)}</label><textarea id="agentChatBody" maxlength="50000" placeholder="Write a message" required ${loading || sending ? 'disabled' : ''}></textarea><button class="primary-button" type="submit" ${loading || sending ? 'disabled' : ''}>${sending ? 'Waiting for reply…' : 'Send'}</button></form><div class="grid-conversation-footer"><small class="grid-conversation-note">This thread is saved in the linked HexiGrid workspace, separately for this browser connection and agent.</small>${conversation.length ? `<button type="button" class="quiet-button" data-action="clear-agent-conversation" ${loading || sending ? 'disabled' : ''}>Clear history</button>` : ''}</div></section>`;
}

export function renderHexiGridView(input: {
  origin: string;
  state: HexiGridRuntimeState;
  message: string;
  linked: boolean;
  agents: LinkedAgent[];
  selectedAgentId: string;
  conversation: HexiGridConversationMessage[];
  conversationLoading: boolean;
  conversationSending: boolean;
  conversationMessage: string;
  tasks: HexiGridTask[];
  tasksLoading: boolean;
  tasksChecked: boolean;
  tasksAvailable: boolean;
  tasksMessage: string;
  taskSaving: boolean;
  pairing: PairingRequest | null;
  pairingBusy: boolean;
}): string {
  const origin = safeOrigin(input.origin);
  const statusLabel = input.linked ? 'Connected' : input.state === 'online' ? 'Available on this device' : input.state === 'checking' ? 'Checking' : input.state === 'preview' ? 'Sign in required' : 'Not running';
  const statusClass = input.linked ? 'is-online' : input.state === 'checking' ? 'is-checking' : '';
  const runtimeMessage = escapeHtml(input.message || 'HexiGrid is not running on this device.');
  let body: string;

  if (input.state === 'preview') {
    body = `<section class="grid-runtime-card" data-grid-state="preview"><span class="grid-runtime-icon" aria-hidden="true">⬡</span><div><strong>Sign in to connect your workspace</strong><p>HexiGrid runs on your own device. Sign in to HexiSpace, then connect the local workspace when you are ready.</p><button type="button" class="primary-button" data-action="exit-preview">Sign in</button></div></section>`;
  } else if (input.state === 'checking') {
    body = `<section class="grid-runtime-card" data-grid-state="checking"><span class="grid-runtime-icon" aria-hidden="true">◌</span><div><strong>Looking for your local workspace…</strong><p>${runtimeMessage}</p></div></section>`;
  } else if (input.state === 'offline' || !origin) {
    body = `<section class="grid-runtime-card" data-grid-state="offline"><span class="grid-runtime-icon" aria-hidden="true">○</span><div><strong>HexiGrid is not available on this device</strong><p>${runtimeMessage}</p><button type="button" class="primary-button" data-action="check-hexigrid">Check again</button></div></section>`;
  } else if (!input.linked) {
    body = `<section class="grid-connection-card"><div class="grid-card-heading"><div><p class="eyebrow">YOUR PRIVATE WORKSPACE</p><h2>Connect HexiGrid</h2></div><span class="grid-runtime-status is-online">Available</span></div><p>Pair this browser to use the HexiGrid features you approve. Messaging, creating paused tasks, and using connected mailboxes are separate permissions.</p>${input.message && input.message !== 'HexiGrid is reachable on this device.' ? `<p class="grid-link-message" role="status">${runtimeMessage}</p>` : ''}<button type="button" class="primary-button" data-action="pair-hexigrid" ${input.pairing || input.pairingBusy ? 'disabled' : ''}>${input.pairing ? 'Pairing request created' : 'Connect HexiGrid'}</button>${renderPairing(input.pairing, input.pairingBusy)}<a class="grid-local-link" href="${escapeHtml(origin)}" target="_blank" rel="noopener noreferrer">Open HexiGrid controls</a></section>`;
  } else {
    const noMessageScope = !input.agents.length && input.message.toLowerCase().includes('messages permission');
    const agentContent = input.agents.length
      ? `<div class="grid-agent-list" aria-label="Linked agents">${input.agents.map((agent) => `<article class="grid-agent-row"><span class="grid-agent-avatar" aria-hidden="true">${escapeHtml(agent.name.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.model || 'Selected model')} · ${escapeHtml(agent.status)}</small></span></article>`).join('')}</div>${renderAgentChat(input.agents, input.selectedAgentId, input.conversation, input.conversationLoading, input.conversationSending, input.conversationMessage)}`
      : `<p class="grid-empty-agents">${noMessageScope ? 'Agent messaging was not approved for this connection. Disconnect and pair again with Messages selected if you want HexiSpace to list and message your agents.' : 'No available agents were returned by this HexiGrid account.'}</p>`;
    body = `<section class="grid-connection-card is-connected"><div class="grid-card-heading"><div><p class="eyebrow">YOUR PRIVATE WORKSPACE</p><h2>HexiGrid is connected</h2></div><span class="grid-runtime-status is-online">Connected</span></div><p>This thread is saved in HexiGrid’s encrypted local workspace, separately for each linked browser and agent. It is not stored in HexiSpace or synced with HexiGrid Rooms or chats in other apps. Messages are sent with that agent’s configured instructions and enabled memories to its selected model; a cloud provider may process that context.</p>${input.message && !noMessageScope && input.message !== 'HexiGrid is reachable on this device.' ? `<p class="grid-link-message" role="status">${runtimeMessage}</p>` : ''}${agentContent}${renderGridTasks({ agents: input.agents, tasks: input.tasks, loading: input.tasksLoading, checked: input.tasksChecked, available: input.tasksAvailable, message: input.tasksMessage, saving: input.taskSaving })}<div class="grid-connection-actions"><button type="button" class="quiet-button" data-action="check-hexigrid">Refresh agents</button><button type="button" class="quiet-button" data-action="disconnect-hexigrid">Disconnect</button><a class="grid-local-link" href="${escapeHtml(origin)}" target="_blank" rel="noopener noreferrer">Open HexiGrid controls</a></div></section>`;
  }

  return `<section class="grid-app-view" aria-labelledby="gridAppTitle"><div class="grid-app-head"><div><h1 id="gridAppTitle">Agent workspace</h1><p class="grid-app-subtitle">Connect agents, models, and tools you choose.</p></div><span class="grid-runtime-status ${statusClass}">${statusLabel}</span></div>${body}</section>`;
}
