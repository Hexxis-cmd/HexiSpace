import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { collectStrangerPosts, excludeKnownProfiles } from '../src/lib/discovery-store';
import type { Post } from '../src/lib/types';

const post = (id: string, authorId: string): Post => ({
  id,
  author_id: authorId,
  body: id,
  media: [],
  visibility: 'public',
  ai_generated: false,
  created_at: new Date(0).toISOString()
});

describe('Explore discovery feed', () => {
  it('keeps strangers in order and excludes owned, followed, and friend profiles', () => {
    const posts = [post('one', 'own'), post('two', 'followed'), post('three', 'stranger-a'), post('four', 'friend'), post('five', 'stranger-b')];
    expect(excludeKnownProfiles(posts, ['own', 'followed', 'friend']).map((item) => item.id)).toEqual(['three', 'five']);
  });

  it('pages past a full batch of known profiles and preserves feed order', async () => {
    const pages = [
      Array.from({ length: 2 }, (_, index) => post(`known-${index}`, 'known')),
      [post('stranger-newer', 'stranger'), post('known-again', 'known'), post('stranger-older', 'another-stranger')]
    ];
    const calls: Array<[number, number]> = [];
    const result = await collectStrangerPosts(async (offset, limit) => {
      calls.push([offset, limit]);
      return pages[offset / 2] || [];
    }, ['known'], { pageSize: 2, targetCount: 2, maxPages: 4 });

    expect(calls).toEqual([[0, 2], [2, 2]]);
    expect(result.map((item) => item.id)).toEqual(['stranger-newer', 'stranger-older']);
  });

  it('stops when enough strangers are found, the feed ends, or the page bound is reached', async () => {
    let calls = 0;
    await collectStrangerPosts(async () => {
      calls += 1;
      return Array.from({ length: 3 }, (_, index) => post(`stranger-${calls}-${index}`, 'stranger'));
    }, [], { pageSize: 3, targetCount: 2, maxPages: 5 });
    expect(calls).toBe(1);

    calls = 0;
    await collectStrangerPosts(async () => {
      calls += 1;
      return [post(`known-${calls}`, 'known')];
    }, ['known'], { pageSize: 3, targetCount: 2, maxPages: 5 });
    expect(calls).toBe(1);

    calls = 0;
    await collectStrangerPosts(async () => {
      calls += 1;
      return Array.from({ length: 3 }, (_, index) => post(`known-${calls}-${index}`, 'known'));
    }, ['known'], { pageSize: 3, targetCount: 2, maxPages: 2 });
    expect(calls).toBe(2);
  });

  it('loads only the public feed and renders a refreshable Explore post list', async () => {
    const store = await readFile(new URL('../src/lib/social-store.ts', import.meta.url), 'utf8');
    const discovery = await readFile(new URL('../src/lib/discovery-store.ts', import.meta.url), 'utf8');
    const view = await readFile(new URL('../src/views/social-view.ts', import.meta.url), 'utf8');
    const runtime = await readFile(new URL('../src/views/shell-runtime.ts', import.meta.url), 'utf8');
    const events = await readFile(new URL('../src/views/shell-events.ts', import.meta.url), 'utf8');
    const actions = await readFile(new URL('../src/views/shell-actions.ts', import.meta.url), 'utf8');

    expect(store).toContain(".eq('visibility', 'public')");
    expect(store).toContain('.range(safeOffset, safeOffset + safeLimit - 1)');
    expect(discovery).toContain('collectStrangerPosts((offset, limit) => publicFeed(offset, limit), knownIds)');
    expect(discovery).toContain('excludeKnownProfiles(page, known)');
    expect(view).toContain('From outside your circle');
    expect(view).toContain('current.discoverPosts.map(postCard)');
    expect(view).toContain('id="globalSearchForm"');
    expect(view).not.toContain('id="discoverForm"');
    expect(runtime).toContain('export async function loadDiscoverPosts');
    expect(events).toContain("case 'refresh-discover': void loadDiscoverPosts(root, user); return;");
    expect(events).toContain("case 'clear-search': current.searchQuery = '';");
    expect(actions).toContain('current.searchResults.find((result) => result.type === \'profile\'');
  });
});
