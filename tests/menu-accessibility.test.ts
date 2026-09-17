import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('tools menu accessibility', () => {
  it('has a named dialog and keyboard focus handoff', async () => {
    const [panel, behavior, shell, view] = await Promise.all([
      readFile(new URL('../src/views/utility-panel.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/menu-behavior.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/shell-events.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/social-view.ts', import.meta.url), 'utf8')
    ]);

    expect(panel).toContain('aria-modal="false"');
    expect(panel).toContain('aria-labelledby="utilityMenuTitle"');
    expect(panel).toContain('id="utilityMenuTitle"');
    expect(panel).toContain('aria-label="Close account menu"');
    expect(panel).toContain('See all profiles');
    expect(panel).toContain('Settings & privacy');
    expect(panel).not.toContain('Display & accessibility');
    expect(panel).not.toContain("menuRow('Alerts'");
    expect(panel).toContain("menuRow('Notifications'");
    expect(panel).toContain("menuRow('Agent workspace'");
    expect(panel).toContain('Report a problem');
    expect(panel).toContain('data-action="sign-out"');
    expect(view).toContain('aria-haspopup="dialog"');
    expect(shell).toContain("focusPanelClose(root)");
    expect(panel).toContain("menuRow('Settings & privacy'");
    expect(behavior).toContain("focusPanelToggle(root)");
    expect(behavior).toContain("event.key === 'Escape'");
    expect(behavior).toContain("event.key !== 'Tab'");
    expect(behavior).toContain('focusableSelector');
  });

  it('keeps the account menu anchored to the upper-right on wide screens', async () => {
    const [styles, socialStyles] = await Promise.all([
      readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
      readFile(new URL('../src/social-layout.css', import.meta.url), 'utf8')
    ]);
    expect(styles).toContain('left:max(12px,calc(100vw - 406px))');
    expect(styles).toContain('@media (max-width:640px){.utility-menu{left:12px!important;right:12px!important');
    expect(styles).toContain('.app-frame>.topbar{position:sticky;z-index:5}');
    expect(styles).toContain('.app-frame>.skip-link{position:fixed;z-index:60}');
    expect(socialStyles).toContain('body:has(.utility-menu.is-open)');
    expect(socialStyles).toContain('overscroll-behavior: contain');
  });
});
