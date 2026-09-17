import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('moderation surfaces', () => {
  it('exposes reporting from profiles and posts', async () => {
    const [shell, cards] = await Promise.all([
      readFile(new URL('../src/views/shell-actions.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/social-cards.ts', import.meta.url), 'utf8'),
    ]);
    expect(cards).toContain('data-action="report-post"');
    expect(shell).toContain('reportPostModal');
    expect(shell).toContain("reportContent(user.id, 'post'");
    expect(shell).toContain('Copyright or stolen work');
    expect(shell).toContain('postAiGenerated');
  });

  it('keeps owner moderation actions behind the admin console', async () => {
    const admin = await readFile(new URL('../src/admin/main.ts', import.meta.url), 'utf8');
    const store = await readFile(new URL('../src/admin/admin-store.ts', import.meta.url), 'utf8');
    expect(admin).toContain('Hide target');
    expect(admin).toContain('Manual review only');
    expect(admin).toContain('Purge old resolved reports');
    expect(store).toContain('admin_moderate_report');
    expect(store).toContain('admin_purge_moderation_data');
  });
});
