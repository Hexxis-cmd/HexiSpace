import { isEmergencyStopped, registerAgentRequest } from './emergency-stop';

export type ModelProviderId = 'openai' | 'anthropic' | 'gemini' | 'openai-compatible';
export type DirectModelDraft = { provider: ModelProviderId; endpoint: string; model: string; apiKey: string; passphrase: string; testMessage?: string };
export type ModelConnection = { id: string; provider: ModelProviderId; endpoint: string; model: string; createdAt: string };
export type DirectModelResult = { connection: ModelConnection; models: string[]; reply?: string };
export type DirectModelFailure = 'blocked' | 'cors-or-network' | 'provider-rejected' | 'invalid-input';
type StoredModelConnection = ModelConnection & { version: 2; salt: string; iv: string; ciphertext: string };

export const modelProviders: ReadonlyArray<{ id: ModelProviderId; name: string; endpoint: string; docs: string }> = [
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', docs: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1', docs: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini', name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', docs: 'https://aistudio.google.com/apikey' },
  { id: 'openai-compatible', name: 'Another compatible provider', endpoint: '', docs: 'https://platform.openai.com/docs/api-reference/chat' }
];

const vaultKey = 'hexispace.direct-models.v1';
const unlocked = new Map<string, DirectModelDraft>();

export class DirectModelError extends Error {
  constructor(message: string, public readonly reason: DirectModelFailure) { super(message); this.name = 'DirectModelError'; }
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function keyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (passphrase.trim().length < 10) throw new DirectModelError('Use a local passphrase with at least 10 characters.', 'invalid-input');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt).buffer as ArrayBuffer, iterations: 210000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function provider(value: string): ModelProviderId {
  if (value === 'openai' || value === 'anthropic' || value === 'gemini' || value === 'openai-compatible') return value;
  throw new DirectModelError('Choose a model provider.', 'invalid-input');
}

function endpointFor(draft: DirectModelDraft): string {
  const raw = (draft.endpoint || modelProviders.find((item) => item.id === draft.provider)?.endpoint || '').trim().replace(/\/$/, '');
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error();
    return url.toString().replace(/\/$/, '');
  } catch { throw new DirectModelError('Enter a valid HTTPS API address. Local HTTP addresses are allowed only on this device.', 'invalid-input'); }
}

function headersFor(draft: DirectModelDraft): Record<string, string> {
  if (!draft.apiKey.trim() && draft.provider !== 'openai-compatible') throw new DirectModelError('Paste the API key for this provider, or leave it blank only when your local server does not use one.', 'invalid-input');
  if (draft.provider === 'gemini') return { Accept: 'application/json', 'x-goog-api-key': draft.apiKey.trim() };
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (draft.apiKey.trim()) headers.Authorization = `Bearer ${draft.apiKey.trim()}`;
  if (draft.provider === 'anthropic') { headers['x-api-key'] = draft.apiKey.trim(); headers['anthropic-version'] = '2023-06-01'; headers['anthropic-dangerous-direct-browser-access'] = 'true'; delete headers.Authorization; }
  return headers;
}

function requestUrl(draft: DirectModelDraft, path: string): string {
  const endpoint = endpointFor(draft);
  return `${endpoint}/${path}`;
}

async function request(draft: DirectModelDraft, path: string, init: RequestInit = {}): Promise<unknown> {
  if (isEmergencyStopped()) throw new DirectModelError('Agent activity is stopped. Resume it from the account menu before making model requests.', 'blocked');
  const controller = registerAgentRequest();
  try {
    const response = await fetch(requestUrl(draft, path), { ...init, headers: { ...headersFor(draft), ...(init.headers || {}) }, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new DirectModelError(`The provider rejected the request (${response.status}). Check the key, model, and provider limits.`, 'provider-rejected');
    return data;
  } catch (error) {
    if (error instanceof DirectModelError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new DirectModelError('The request was stopped.', 'blocked');
    throw new DirectModelError('This provider could not be reached directly from this browser. HexiGrid can be used as the local fallback when you have it running.', 'cors-or-network');
  } finally { controller.cleanup(); }
}

function modelNames(data: any, providerId: ModelProviderId): string[] {
  if (providerId === 'gemini') return Array.isArray(data?.models) ? data.models.map((item: any) => String(item.name || '').replace(/^models\//, '')).filter(Boolean) : [];
  return Array.isArray(data?.data) ? data.data.map((item: any) => String(item.id || '')).filter(Boolean) : Array.isArray(data?.models) ? data.models.map((item: any) => String(item.id || item.name || '')).filter(Boolean) : [];
}

function connectionId(): string { return `model-${crypto.randomUUID()}`; }

async function seal(draft: DirectModelDraft, id: string): Promise<void> {
  const endpoint = endpointFor(draft);
  const createdAt = new Date().toISOString();
  const salt = randomBytes(16); const iv = randomBytes(12); const key = await keyFromPassphrase(draft.passphrase, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv).buffer as ArrayBuffer }, key, new TextEncoder().encode(JSON.stringify({ provider: draft.provider, endpoint, model: draft.model, apiKey: draft.apiKey })));
  const record: StoredModelConnection = { id, version: 2, provider: draft.provider, endpoint, model: draft.model, createdAt, salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted)) };
  const current = storage();
  if (current) { let records: unknown[] = []; try { records = JSON.parse(current.getItem(vaultKey) || '[]') as unknown[]; } catch { records = []; } current.setItem(vaultKey, JSON.stringify([...records.filter((item: any) => item?.id !== id), record])); }
  unlocked.set(id, { ...draft, endpoint, model: record.model });
  return;
}

function storedRecords(): StoredModelConnection[] {
  const current = storage();
  if (!current) return [];
  try {
    const records = JSON.parse(current.getItem(vaultKey) || '[]') as unknown[];
    return records.filter((record): record is StoredModelConnection => Boolean(record && typeof record === 'object' && typeof (record as any).id === 'string' && typeof (record as any).salt === 'string' && typeof (record as any).iv === 'string' && typeof (record as any).ciphertext === 'string'));
  } catch { return []; }
}

export function listSavedModelConnections(): ModelConnection[] {
  return storedRecords().map(({ id, provider, endpoint, model, createdAt }) => ({ id, provider, endpoint, model, createdAt }));
}

export async function unlockModelConnection(id: string, passphrase: string): Promise<ModelConnection> {
  const record = storedRecords().find((item) => item.id === id);
  if (!record) throw new DirectModelError('That saved model connection is not available in this browser.', 'invalid-input');
  const key = await keyFromPassphrase(passphrase.trim(), fromBase64(record.salt));
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(record.iv).buffer as ArrayBuffer }, key, fromBase64(record.ciphertext).buffer as ArrayBuffer);
    const saved = JSON.parse(new TextDecoder().decode(decrypted)) as Partial<DirectModelDraft>;
    if (saved.provider !== record.provider || saved.endpoint !== record.endpoint || saved.model !== record.model || typeof saved.apiKey !== 'string') throw new Error('invalid-record');
    unlocked.set(id, { provider: saved.provider, endpoint: saved.endpoint, model: saved.model, apiKey: saved.apiKey, passphrase: passphrase.trim() });
    return { id: record.id, provider: record.provider, endpoint: record.endpoint, model: record.model, createdAt: record.createdAt };
  } catch { throw new DirectModelError('That passphrase did not unlock this saved connection.', 'invalid-input'); }
}

export async function connectDirectModel(draft: DirectModelDraft): Promise<DirectModelResult> {
  const clean = { ...draft, provider: provider(draft.provider), model: draft.model.trim(), apiKey: draft.apiKey.trim(), passphrase: draft.passphrase.trim(), endpoint: draft.endpoint.trim() };
  const data = await request(clean, 'models');
  const models = modelNames(data, clean.provider);
  if (!models.length && !clean.model) throw new DirectModelError('The provider connected but did not return a model. Enter the exact model ID shown by that provider.', 'provider-rejected');
  const selected = clean.model || models[0];
  const id = connectionId();
  await seal({ ...clean, model: selected }, id);
  const connection = listSavedModelConnections().find((item) => item.id === id) || { id, provider: clean.provider, endpoint: endpointFor(clean), model: selected, createdAt: new Date().toISOString() };
  return { connection, models };
}

export async function testDirectModel(connection: ModelConnection, message: string): Promise<string> {
  const draft = unlocked.get(connection.id);
  if (!draft) throw new DirectModelError('Unlock this local model connection again before testing it.', 'invalid-input');
  const content = message.trim();
  if (!content) throw new DirectModelError('Write a short test message.', 'invalid-input');
  if (draft.provider === 'gemini') {
    const data = await request(draft, `models/${encodeURIComponent(connection.model)}:generateContent`, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: content }] }] }) }) as any;
    return String(data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || 'The model connected but returned no text.');
  }
  if (draft.provider === 'anthropic') {
    const data = await request(draft, 'messages', { method: 'POST', body: JSON.stringify({ model: connection.model, max_tokens: 256, messages: [{ role: 'user', content }] }) }) as any;
    return String(data?.content?.map((part: any) => part.text || '').join('') || 'The model connected but returned no text.');
  }
  const data = await request(draft, 'chat/completions', { method: 'POST', body: JSON.stringify({ model: connection.model, messages: [{ role: 'user', content }], max_tokens: 256 }) }) as any;
  return String(data?.choices?.[0]?.message?.content || 'The model connected but returned no text.');
}

export function clearUnlockedModelKeys(): void { unlocked.clear(); }

if (typeof window !== 'undefined') window.addEventListener('hexispace-emergency-stop', clearUnlockedModelKeys);
