import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderProfileSpace } from '../src/views/profile-space';

const profile = {
  id: 'profile-1',
  owner_id: 'owner-1',
  kind: 'hexonaut' as const,
  display_name: 'Nova',
  handle: 'nova',
  bio: 'A profile bio.',
  avatar_url: null,
  banner_url: 'https://cdn.example/banner.png',
  visibility: 'public' as const,
  theme: 'helios',
  created_at: '2026-09-16T00:00:00.000Z'
};

describe('profile space', () => {
  it('renders the real cover, identity, accessible tabs, and selected content', () => {
    const html = renderProfileSpace({
      profile,
      tab: 'about',
      avatar: '<span class="avatar">N</span>',
      styleClasses: 'profile-accent-cyan profile-backdrop-midnight profile-theme-helios',
      posts: [],
      postCards: '',
      mediaCards: ''
    });

    expect(html).toContain('profile-banner-image');
    expect(html).toContain('Nova');
    expect(html).toContain('data-profile-tab="about"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-controls="profile-panel-about"');
    expect(html).toContain('A profile bio.');
    expect(html).toContain('<span class="profile-badge">Hexonaut</span>');
    expect(html).toContain('style="--bg:#f6f1e5');
    expect(html).toContain('profile-theme-helios');
  });

  it('honors the saved preference to hide the profile-type badge', () => {
    const html = renderProfileSpace({
      profile: { ...profile, profile_style: { accent: 'cyan', backdrop: 'paper', layout: 'card', show_badges: false } },
      tab: 'posts',
      avatar: '<span class="avatar">N</span>',
      styleClasses: 'profile-accent-cyan profile-backdrop-paper profile-theme-helios',
      posts: [],
      postCards: '',
      mediaCards: ''
    });

    expect(html).not.toContain('class="profile-badge"');
    expect(html).toContain('profile-backdrop-paper');
  });

  it('keeps Paper profiles on theme-readable text and uses the theme accent for badge text', async () => {
    const styles = await readFile(new URL('../src/social-layout.css', import.meta.url), 'utf8');
    expect(styles).toContain('.profile-space.profile-backdrop-paper');
    expect(styles).toContain('color: var(--text)');
    expect(styles).toContain('.profile-space .profile-badge');
    expect(styles).toContain('color: var(--accent)');
  });
});
