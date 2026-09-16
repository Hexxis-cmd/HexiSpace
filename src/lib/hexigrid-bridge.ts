import { getConfig } from './supabase';

export type HexiGridManifest = { protocol: string; protocolVersion?: number; hexigridVersion?: string; capabilities: string[]; expiresAt?: string };
export type LinkStatus = { connected: boolean; manifest?: HexiGridManifest; message: string };
export type PairingRequest = { id: string; code: string; expiresAt: string; approvalPath: string };

let bridgeToken: string | null = null;

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
      const manifest = await inspectHexiGrid();
      return { connected: true, manifest: manifest.manifest, message: 'HexiGrid is linked for this browser session.' };
    }
    if (data.status === 'expired' || data.status === 'used') throw new Error('The HexiGrid pairing request expired. Start a new one.');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Pairing timed out. Start a new request when you are ready to approve it.');
}

export function disconnectHexiGrid(): void { bridgeToken = null; }

export async function callHexiGrid<T>(path: string, body: unknown): Promise<T> {
  if (!bridgeToken) throw new Error('Link HexiGrid before using agent controls.');
  const response = await fetch(endpoint(path), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${bridgeToken}` }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'HexiGrid rejected this action.');
  return data as T;
}

export type LinkedAgent = { id: string; name: string; status: string; model: string; avatar?: string };

export async function linkedAgents(): Promise<LinkedAgent[]> {
  const response = await fetch(endpoint('/agents'), { headers: { Accept: 'application/json', Authorization: `Bearer ${bridgeToken || ''}` } });
  const data = await response.json().catch(() => ({})) as { agents?: LinkedAgent[]; error?: string };
  if (!response.ok) throw new Error(data.error || 'HexiGrid did not return linked agents.');
  return data.agents || [];
}

export async function askLinkedAgent(agentId: string, content: string): Promise<{ reply: string; model: string }> {
  return callHexiGrid('/agent-request', { agentId, content });
}

export async function scheduleLinkedAgentTask(input: { agentId: string; name: string; prompt: string; intervalSeconds?: number; maxRuns?: number; maxRetries?: number }): Promise<{ task: { id: string; status: string }; notice: string }> {
  return callHexiGrid('/tasks', input);
}

export async function cancelLinkedAgentTask(taskId: string): Promise<{ task: { id: string; status: string } }> {
  return callHexiGrid(`/tasks/${encodeURIComponent(taskId)}/cancel`, {});
}
