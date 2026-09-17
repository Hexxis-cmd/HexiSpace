import { describe, expect, it } from 'vitest';
import { liveWorkspaceEmbedUrl, safeLiveWorkspaceLink } from '../src/lib/live-workspace';

describe('Live workspace boundary', () => {
  it('builds a focused, origin-bound URL for same-device development', () => {
    const value = liveWorkspaceEmbedUrl('http://127.0.0.1:4318', 'http://127.0.0.1:4340');
    expect(value).not.toBeNull();
    const url = new URL(value!);
    expect(url.origin).toBe('http://127.0.0.1:4318');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('embedded')).toBe('1');
    expect(url.searchParams.get('view')).toBe('live');
    expect(url.searchParams.get('parent')).toBe('http://127.0.0.1:4340');
  });

  it('does not frame the local authenticated runtime from a hosted or network origin', () => {
    expect(liveWorkspaceEmbedUrl('http://127.0.0.1:4318', 'https://hexispace.com')).toBeNull();
    expect(liveWorkspaceEmbedUrl('http://192.168.1.9:4318', 'http://127.0.0.1:4340')).toBeNull();
    expect(liveWorkspaceEmbedUrl('http://user:pass@127.0.0.1:4318', 'http://127.0.0.1:4340')).toBeNull();
    expect(liveWorkspaceEmbedUrl('javascript:alert(1)', 'http://127.0.0.1:4340')).toBeNull();
  });

  it('keeps a secure top-level fallback available for a user-owned HTTPS endpoint', () => {
    expect(safeLiveWorkspaceLink('https://grid.example.net/path')).toBeNull();
    expect(safeLiveWorkspaceLink('https://grid.example.net')).toBe('https://grid.example.net/');
    expect(safeLiveWorkspaceLink('http://192.168.1.9:4318')).toBeNull();
  });
});
