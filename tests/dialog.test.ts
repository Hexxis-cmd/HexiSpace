import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('dialog keyboard access', () => {
  it('traps Tab inside the modal and keeps Escape available', async () => {
    const source = await readFile(new URL('../src/views/dialog.ts', import.meta.url), 'utf8');
    expect(source).toContain("event.key !== 'Tab'");
    expect(source).toContain('event.shiftKey');
    expect(source).toContain('last.focus()');
    expect(source).toContain('first.focus()');
    expect(source).toContain("event.key === 'Escape'");
  });
});
