import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('account-free language', () => {
  it('keeps the unauthenticated shell honest and free of invented content', async () => {
    const [shell, runtime, actions, events, view] = await Promise.all([
      readFile(new URL('../src/views/app-shell.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/shell-runtime.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/shell-actions.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/shell-events.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/social-view.ts', import.meta.url), 'utf8')
    ]);

    expect(view).toContain("current.liveWorkspaceStatus === 'unavailable' ? 'Not available right now'");
    expect(view).toContain('Sign in to use live spaces.');
    expect(view).not.toContain('Local test mode');
    expect(view).not.toContain('Sample reply');
    expect(view).toContain('class="skip-link"');
    expect(view).toContain('id="workspace-content"');
    expect(view).toContain("const accountStatusLabel = readOnly ? 'Browse only' : 'Signed in';");
    expect(view).toContain('aria-label="Account status">${accountStatusLabel}');
    const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(styles).toContain('grid-template-columns:repeat(5,minmax(0,1fr))');
    expect(styles).toContain('overflow:visible}.topbar .top-nav button');
    expect(view).toContain("import { renderPageHeading } from './social-navigation';");
    expect(view).toContain("const pageHeading = current.activeApp === 'grid' || current.viewMode === 'agent' ? '' : renderPageHeading(current.activeNav, current.viewMode);");
    expect(shell).toContain("setShellWiring(wire)");
    expect(events).toContain("Sign in and link HexiGrid before sending a message to an agent.");
    expect(events).toContain("if (!current.preview && !current.publicBrowse) saveNotificationPreferences(user.id, current.notificationPrefs);");
    expect(view).toContain("${readOnly ? 'Try notification choices' : 'Save notification choices'}");
    expect(actions).toContain('id="postGroup"');
    expect(runtime).toContain('loadGroupFeed');
    expect(events).toContain('selectSocialNav(state, nav)');
    expect(runtime).toContain("if (current.activeNav === 'groups') await loadGroups(root, user, current.groupQuery);");
    expect(runtime).toContain('Linked and reachable on this device.');
    expect(events).toContain("case 'open-live-workspace': void openLiveWorkspace(root, user); return;");
    expect(runtime).toContain('current.profiles = [];');
    expect(runtime).toContain('current.linkedAgents = [];');
    expect(shell).not.toContain("from '../lib/preview-data'");
    expect(actions).toContain('if (!requireOnline(root)) return; const form = event.target as HTMLFormElement;');
    expect(actions).toContain('export function editGroup(root: HTMLElement, user: User, groupId: string): void');
  });
});
