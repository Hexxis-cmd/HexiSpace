import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearUnlockedModelKeys, connectDirectModel, listSavedModelConnections, testDirectModel, unlockModelConnection } from '../src/lib/model-connections';

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }, addEventListener: () => undefined }
  });
  vi.restoreAllMocks();
});

describe('direct browser model connections', () => {
  it('stores only encrypted key material and can unlock it again', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const result = await connectDirectModel({ provider: 'openai', endpoint: 'https://api.openai.com/v1', model: 'test-model', apiKey: 'secret-key-value', passphrase: 'a passphrase long enough', testMessage: '' });
    const raw = values.get('hexispace.direct-models.v1') || '';
    expect(raw).not.toContain('secret-key-value');
    expect(listSavedModelConnections()).toEqual([result.connection]);
    await expect(unlockModelConnection(result.connection.id, 'wrong passphrase')).rejects.toThrow('passphrase');
    await expect(unlockModelConnection(result.connection.id, 'a passphrase long enough')).resolves.toEqual(result.connection);
  });

  it('sends Gemini API keys in the authentication header, never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'models/gemini-test' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await connectDirectModel({ provider: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-test', apiKey: 'gemini-secret-value', passphrase: 'a passphrase long enough' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('gemini-secret-value');
    expect(url).not.toContain('?key=');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('gemini-secret-value');
  });

  it('clears the unlocked key from active memory when the user signs out or emergency-stops', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const result = await connectDirectModel({ provider: 'openai', endpoint: 'https://api.openai.com/v1', model: 'test-model', apiKey: 'secret-key-value', passphrase: 'a passphrase long enough' });
    clearUnlockedModelKeys();
    await expect(testDirectModel(result.connection, 'hello')).rejects.toThrow('Unlock this local model connection');
  });
});
