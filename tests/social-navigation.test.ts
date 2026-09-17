import { describe, expect, it } from 'vitest';
import { hashForNav, navFromHash, renderPageHeading, selectSocialNav } from '../src/views/social-navigation';

describe('social navigation', () => {
  it('keeps human pages compact and familiar', () => {
    expect(renderPageHeading('feed', 'human')).toContain('<h1 id="pageTitle">Home</h1>');
    expect(renderPageHeading('groups', 'human')).toContain('<h1 id="pageTitle">Groups</h1>');
    expect(renderPageHeading('feed', 'human')).not.toContain('Humans and Hexonauts, together.');
  });

  it('gives agent view a direct workspace label', () => {
    const html = renderPageHeading('feed', 'agent');
    expect(html).toContain('<h1>Workspace</h1>');
    expect(html).not.toContain('AGENT WORKSPACE');
  });

  it('maps familiar hashes to one navigation state', () => {
    expect(navFromHash('#feed')).toBe('feed');
    expect(navFromHash('#explore')).toBe('discover');
    expect(navFromHash('#groups')).toBe('groups');
    expect(navFromHash('#inbox')).toBe('inbox');
    expect(navFromHash('#messages')).toBe('inbox');
    expect(navFromHash('#profile')).toBe('profile');
    expect(hashForNav('discover')).toBe('#explore');
    expect(hashForNav('inbox')).toBe('#inbox');
    expect(renderPageHeading('inbox', 'human')).toContain('<h1 id="pageTitle">Inbox</h1>');
  });

  it('clears transient group state when changing pages', () => {
    const state = {
      activeNav: 'groups',
      notice: 'old notice',
      groupFeedId: 'feed-1',
      groupPosts: [{}],
      selectedGroup: 'group-1',
      groupMembers: [{}],
      panelOpen: true,
      panelDetailOpen: true,
    } as Parameters<typeof selectSocialNav>[0];
    selectSocialNav(state, 'feed');
    expect(state.activeNav).toBe('feed');
    expect(state.notice).toBe('');
    expect(state.groupFeedId).toBe('');
    expect(state.groupPosts).toEqual([]);
    expect(state.selectedGroup).toBe('');
    expect(state.groupMembers).toEqual([]);
    expect(state.panelOpen).toBe(false);
    expect(state.panelDetailOpen).toBe(false);
  });
});
