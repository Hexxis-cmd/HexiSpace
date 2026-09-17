import { getConfig } from './supabase';
import { clearBridgeToken, readBridgeToken, saveBridgeToken } from './bridge-session';

export type HexiGridManifest = { protocol: string; protocolVersion?: number; hexigridVersion?: string; capabilities: string[]; expiresAt?: string };
export type LinkStatus = { connected: boolean; manifest?: HexiGridManifest; message: string };
export type PairingRequest = { id: string; code: string; expiresAt: string; approvalPath: string };

let bridgeToken: string | null = readBridgeToken();

function endpoint(path: string): string { return `${getConfig().hexigridOrigin}/api/hexiverse/v1${path}`; }

export async function inspectHexiGrid(): Promise<LinkStatus> {
  try {
    const response = await fetch(endpoint('/manifest'), { headers: { Accept: 'application/json' } });
    if (!response.ok) return { connected: false, message: 'HexiGrid is not linked on this device.' };
    const manifest = await response.json() as HexiGridManifest;
    return { connected: true, manifest, message: 'HexiGrid is reachable on this device.' };
  } catch {
    return { connected: false, message: 'HexiGrid is not running or is not reachable from this browser.' };
  }
}

export async function requestPairing(): Promise<PairingRequest> {
  const response = await fetch(endpoint('/pairing'), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ origin: window.location.origin }) });
  if (!response.ok) throw new Error('HexiGrid could not create a pairing code. Open HexiGrid locally and try again.');
  return response.json() as Promise<PairingRequest>;
}

export function approvalUrl(pairing: PairingRequest): string { return `${getConfig().hexigridOrigin}${pairing.approvalPath}`; }

export async function waitForPairing(pairingId: string, timeoutMs = 300000): Promise<LinkStatus> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(endpoint(`/pairing/status?id=${encodeURIComponent(pairingId)}`), { headers: { Accept: 'application/json' } });
    const data = await response.json() as { status: string; token?: string };
    if (data.status === 'approved' && data.token) {
      bridgeToken = data.token;
      saveBridgeToken(data.token);
      const manifest = await inspectHexiGrid();
      return { connected: true, manifest: manifest.manifest, message: 'HexiGrid is linked for this browser session.' };
    }
    if (data.status === 'expired' || data.status === 'used') throw new Error('The HexiGrid pairing request expired. Start a new one.');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Pairing timed out. Start a new request when you are ready to approve it.');
}

export function disconnectHexiGrid(): void { bridgeToken = null; clearBridgeToken(); }

/** Revoke the server-side grant before clearing its browser session token. */
export async function revokeHexiGridLink(): Promise<{ mailboxCleanupPending: boolean; alreadyInactive: boolean }> {
  if (!bridgeToken) return { mailboxCleanupPending: false, alreadyInactive: true };
  const token = bridgeToken;
  const response = await fetch(endpoint('/link/disconnect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: '{}'
  });
  const data = await response.json().catch(() => ({})) as { error?: string; mailboxCleanupPending?: boolean };
  if (!response.ok && response.status !== 401) throw new Error(data.error || 'HexiGrid could not revoke this connection.');
  disconnectHexiGrid();
  return { mailboxCleanupPending: data.mailboxCleanupPending === true, alreadyInactive: response.status === 401 };
}

export function isHexiGridLinked(): boolean { return Boolean(bridgeToken); }

export async function callHexiGrid<T>(path: string, body: unknown): Promise<T> {
  if (!bridgeToken) throw new Error('Link HexiGrid before using agent controls.');
  const response = await fetch(endpoint(path), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${bridgeToken}` }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { bridgeToken = null; clearBridgeToken(); }
  if (!response.ok) throw new Error(data.error || 'HexiGrid rejected this action.');
  return data as T;
}

export type HexiGridMailbox = { id: string; profileId: string; provider: 'gmail' | 'outlook'; email: string; scopes: string[]; connectedAt: string; updatedAt: string };

export async function attachMailboxToHexiGrid(connection: { provider: 'gmail' | 'outlook'; profileId: string; email: string; scopes: string[]; accessToken: string; refreshToken?: string; expiresAt: number; clientId?: string }): Promise<{ mailbox: HexiGridMailbox }> {
  return callHexiGrid('/mailboxes/attach', {
    provider: connection.provider,
    profileId: connection.profileId,
    email: connection.email,
    scopes: connection.scopes,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken || '',
    expiresAt: connection.expiresAt,
    clientId: connection.clientId || ''
  });
}

export async function disconnectHexiGridMailbox(id: string): Promise<{ ok: true }> {
  return callHexiGrid('/mailboxes/disconnect', { id });
}

export async function mailboxActionThroughHexiGrid(id: string, input: { action: 'list' | 'send' | 'delete'; recipient?: string; subject?: string; body?: string; messageId?: string }): Promise<Record<string, unknown>> {
  return callHexiGrid('/mailboxes/action', { id, ...input });
}

export type LinkedAgent = { id: string; name: string; status: string; model: string; avatar?: string };
export type HexiGridConversationMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string };
export type HexiGridConversation = { agentId: string; messages: HexiGridConversationMessage[] };
export type HexiGridTask = { id: string; name: string; agentId: string; intervalSeconds: number; maxRuns: number; runCount: number; status: 'paused' | 'running' | 'waiting_approval' | 'blocked' | 'completed' | 'cancelled' | 'failed'; nextRunAt: string | null; createdAt: string; updatedAt: string };

export async function linkedAgents(): Promise<LinkedAgent[]> {
  const response = await fetch(endpoint('/agents'), { headers: { Accept: 'application/json', Authorization: `Bearer ${bridgeToken || ''}` } });
  const data = await response.json().catch(() => ({})) as { agents?: LinkedAgent[]; error?: string };
  if (response.status === 401) disconnectHexiGrid();
  if (!response.ok) throw new Error(data.error || 'HexiGrid did not return linked agents.');
  return data.agents || [];
}

export async function linkedConversation(agentId: string): Promise<HexiGridConversation> {
  if (!bridgeToken) throw new Error('Link HexiGrid before opening an agent conversation.');
  const response = await fetch(endpoint(`/conversations/${encodeURIComponent(agentId)}`), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${bridgeToken}` }
  });
  const data = await response.json().catch(() => ({})) as { conversation?: HexiGridConversation; error?: string };
  if (response.status === 401) disconnectHexiGrid();
  if (!response.ok || !data.conversation) throw new Error(data.error || 'HexiGrid could not load this conversation.');
  return data.conversation;
}

export async function askLinkedAgent(agentId: string, content: string): Promise<{ reply: string; model: string; conversation: HexiGridConversation }> {
  return callHexiGrid('/agent-request', { agentId, content });
}

export async function clearLinkedConversation(agentId: string): Promise<HexiGridConversation> {
  const result = await callHexiGrid<{ ok: true; conversation: HexiGridConversation }>(`/conversations/${encodeURIComponent(agentId)}/clear`, {});
  return result.conversation;
}

export async function linkedTasks(): Promise<HexiGridTask[]> {
  if (!bridgeToken) throw new Error('Link HexiGrid before viewing scheduled work.');
  const response = await fetch(endpoint('/tasks'), { cache: 'no-store', headers: { Accept: 'application/json', Authorization: `Bearer ${bridgeToken}` } });
  const data = await response.json().catch(() => ({})) as { tasks?: HexiGridTask[]; error?: string };
  if (response.status === 401) disconnectHexiGrid();
  if (!response.ok) throw new Error(data.error || 'HexiGrid could not load scheduled work.');
  return Array.isArray(data.tasks) ? data.tasks : [];
}

export async function emergencyStopHexiGrid(): Promise<{ ok: true; pausedTasks: number; activeTasks: number; runnerJobsStopped: number; runnersStopped: number }> {
  if (!bridgeToken) throw new Error('Link HexiGrid before stopping its agent activity.');
  const response = await fetch(`${getConfig().hexigridOrigin}/api/hexiverse/v1/emergency-stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${bridgeToken}` }, body: JSON.stringify({}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'HexiGrid could not apply the emergency stop.');
  return data as { ok: true; pausedTasks: number; activeTasks: number; runnerJobsStopped: number; runnersStopped: number };
}

export async function scheduleLinkedAgentTask(input: { agentId: string; name: string; prompt: string; intervalSeconds?: number; maxRuns?: number; maxRetries?: number }): Promise<{ task: { id: string; status: string }; notice: string }> {
  return callHexiGrid('/tasks', input);
}

export async function cancelLinkedAgentTask(taskId: string): Promise<{ task: { id: string; status: string } }> {
  return callHexiGrid(`/tasks/${encodeURIComponent(taskId)}/cancel`, {});
}
