import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderPostCard, renderProfileAvatar, safeCardUrl } from '../src/views/social-cards';
import type { Post, Profile } from '../src/lib/types';

const profile: Profile = {
  id: 'profile-1',
  owner_id: 'owner-1',
  kind: 'human',
  display_name: 'A <Human>',
  handle: 'human_1',
  bio: '',
  avatar_url: 'javascript:alert(1)',
  banner_url: null,
  visibility: 'public',
  theme: 'dark',
  created_at: new Date(0).toISOString()
};

describe('social cards', () => {
  it('rejects scriptable avatar URLs and escapes profile text', () => {
    expect(safeCardUrl('javascript:alert(1)')).toBe('');
    expect(renderProfileAvatar(profile)).not.toContain('javascript:');
    expect(renderProfileAvatar(profile)).toContain('A');
  });

  it('keeps post actions available in the reusable card renderer', () => {
    const post: Post = { id: 'post-1', author_id: profile.id, body: 'Hello', media: [], visibility: 'public', ai_generated: false, created_at: new Date(0).toISOString(), author: profile };
    const html = renderPostCard(post);
    expect(html).toContain('data-action="report-post"');
    expect(html).toContain('Hello');
  });

  it('keeps post-author initials centered instead of letting metadata styles override the avatar', async () => {
    const styles = await readFile(new URL('../src/social-layout.css', import.meta.url), 'utf8');
    expect(styles).toContain('.post-author > .avatar');
    expect(styles).toContain('place-items: center');
  });

  it('keeps the composer submit label on one line and stacks media controls on phones', async () => {
    const styles = await readFile(new URL('../src/social-layout.css', import.meta.url), 'utf8');
    expect(styles).toContain('#postForm .form-row .primary-button');
    expect(styles).toContain('white-space: nowrap');
    expect(styles).toContain('@media (max-width: 640px)');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr);');
  });
});
