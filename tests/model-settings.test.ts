import { describe, expect, it } from 'vitest';
import { renderModelSettings } from '../src/views/model-settings';

describe('model connection setup', () => {
  it('keeps the first connection path short and explains browser key handling plainly', () => {
    const html = renderModelSettings(false);
    expect(html).toContain('Connect straight from this device.');
    expect(html).toContain('Create an unlock phrase');
    expect(html).toContain('Connect and test');
    expect(html).not.toContain('Node.js');
    expect(html).not.toContain('Test message');
  });

  it('keeps endpoint and model overrides inside collapsed advanced options', () => {
    const html = renderModelSettings(false);
    const advanced = html.slice(html.indexOf('<details id="modelAdvancedOptions"'), html.indexOf('</details>', html.indexOf('<details id="modelAdvancedOptions"')));
    expect(advanced).toContain('Model name (optional)');
    expect(advanced).toContain('Custom provider address');
    expect(html.indexOf('modelApiKey')).toBeLessThan(html.indexOf('modelAdvancedOptions'));
  });

  it('disables connection controls while the emergency stop is active', () => {
    const html = renderModelSettings(true);
    expect(html).toContain('Agent activity is stopped.');
    expect(html).toMatch(/id="modelApiKey"[^>]*disabled/);
    expect(html).toMatch(/id="modelPassphrase"[^>]*disabled/);
  });
});
