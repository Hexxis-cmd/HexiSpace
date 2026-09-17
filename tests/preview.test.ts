import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { disablePreviewMode, enablePreviewMode, isPreviewMode } from '../src/lib/preview';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } } });
});

describe('account-free mode', () => {
  it('starts disabled and can be enabled and disabled without cloud configuration', () => {
    expect(isPreviewMode()).toBe(false);
    enablePreviewMode();
    expect(isPreviewMode()).toBe(true);
    disablePreviewMode();
    expect(isPreviewMode()).toBe(false);
  });

  it('does not inject sample profiles, agents, or social records', async () => {
    const source = await readFile(new URL('../src/views/shell-runtime.ts', import.meta.url), 'utf8');
    expect(source).toContain('current.profiles = [];');
    expect(source).toContain('current.posts = [];');
    expect(source).toContain('current.linkedAgents = [];');
    expect(source).not.toContain("from '../lib/preview-data'");
  });
});
