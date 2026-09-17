import { beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { getAppTheme, saveAppTheme, themeClass, themeDefinitions, themeId, themeOptions, themeInlineStyle } from '../src/lib/theme-system';

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } }
  });
});

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(left: string, right: string): number {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('HexiSpace themes', () => {
  it('provides six static and six animated Greek-deity themes with one light theme in each group', () => {
    expect(themeDefinitions).toHaveLength(12);
    expect(themeDefinitions.filter((theme) => theme.family === 'static')).toHaveLength(6);
    expect(themeDefinitions.filter((theme) => theme.family === 'animated')).toHaveLength(6);
    expect(themeDefinitions.filter((theme) => theme.family === 'static' && theme.light).map((theme) => theme.id)).toEqual(['helios']);
    expect(themeDefinitions.filter((theme) => theme.family === 'animated' && theme.light).map((theme) => theme.id)).toEqual(['aphrodite']);
    expect(themeDefinitions.map((theme) => theme.id)).toEqual([
      'helios', 'athena', 'poseidon', 'demeter', 'artemis', 'hestia',
      'hermes', 'hephaestus', 'dionysus', 'aphrodite', 'hera', 'ares'
    ]);
  });

  it('documents every theme with a sourced deity association and separates design color from ancient symbolism', async () => {
    const spec = await readFile(new URL('../docs/HEXISPACE-THEME-SPEC.md', import.meta.url), 'utf8');
    expect(new Set(themeDefinitions.map((theme) => theme.id)).size).toBe(themeDefinitions.length);
    expect(new Set(themeDefinitions.map((theme) => theme.name)).size).toBe(themeDefinitions.length);
    for (const theme of themeDefinitions) {
      expect(spec, `${theme.name} must have a documented theme entry`).toContain(`| ${theme.name} |`);
      expect(theme.domainLabel.length, `${theme.name} must explain its association`).toBeGreaterThan(0);
    }
    expect(spec.match(/\[Theoi:/g)).toHaveLength(themeDefinitions.length);
    expect(spec).toContain('Tufts Perseus Digital Library');
    expect(spec).toContain('not claims about ancient Greek color symbolism');
  });

  it('keeps readable text and status accents on every theme surface', () => {
    for (const theme of themeDefinitions) {
      const { tokens } = theme;
      expect(contrast(tokens.onAccent, tokens.accent), `${theme.name} text on accent controls`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.onDanger, tokens.danger), `${theme.name} text on danger badges`).toBeGreaterThanOrEqual(4.5);
      for (const background of [tokens.bg, tokens.surface, tokens.surface2]) {
        expect(contrast(tokens.text, background), `${theme.name} text on ${background}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.muted, background), `${theme.name} muted text on ${background}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.accent, background), `${theme.name} accent on ${background}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.accentAlt, background), `${theme.name} secondary accent on ${background}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.warm, background), `${theme.name} warm status on ${background}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens.danger, background), `${theme.name} danger status on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('offers only deity names to users and maps old saved choices without losing the profile', () => {
    const options = themeOptions('dark');
    expect(options).toContain('Hestia — hearth and home');
    expect(options).toContain('Helios — sunlight');
    expect(options).not.toContain('>Dark</option>');
    expect(themeId('dark')).toBe('hestia');
    expect(themeId('parchment')).toBe('helios');
    expect(themeClass('tidal')).toBe('theme-poseidon');
    expect(themeId('not-a-theme')).toBe('hestia');
  });

  it('persists a known theme and produces inline tokens only from the fixed registry', () => {
    expect(saveAppTheme('hera')).toBe('hera');
    expect(getAppTheme()).toBe('hera');
    expect(saveAppTheme('not-a-theme')).toBe('hestia');
    expect(values.get('hexispace.app-theme.v1')).toBe('hestia');
    expect(themeInlineStyle('aphrodite')).toContain('--page-gradient:linear-gradient(');
    expect(themeInlineStyle('aphrodite')).toContain('--accent:#a63869');
    expect(themeInlineStyle('url(javascript:alert(1))')).not.toContain('javascript:');
  });

  it('keeps SQL profile validation aligned with the registry and honors reduced motion', async () => {
    const migration = await readFile(new URL('../supabase/migrations/015_greek_deity_themes.sql', import.meta.url), 'utf8');
    const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
    const animatedThemes = await readFile(new URL('../src/animated-themes.css', import.meta.url), 'utf8');
    const profileStyles = await readFile(new URL('../src/social-layout.css', import.meta.url), 'utf8');
    const contrastStyles = await readFile(new URL('../src/theme-contrast.css', import.meta.url), 'utf8');
    const entry = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
    for (const theme of themeDefinitions) expect(migration).toContain(`'${theme.id}'`);
    expect(migration).toContain("alter column theme set default 'hestia'");
    expect(styles).toContain('@media (prefers-reduced-motion:reduce)');
    expect(entry).toContain("import './animated-themes.css'");
    expect(animatedThemes).toContain('@keyframes theme-field-drift');
    expect(animatedThemes).toContain('@media (prefers-reduced-motion: reduce)');
    for (const theme of themeDefinitions.filter((item) => item.family === 'animated')) {
      expect(animatedThemes).toContain(`.app-frame.theme-${theme.id}::before`);
    }
    expect(profileStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(entry).toContain("import './theme-contrast.css'");
    expect(contrastStyles).toContain('color: var(--on-accent)');
    expect(contrastStyles).toContain('color: var(--on-danger)');
    expect(styles).not.toContain('theme-dark');
    expect(styles).not.toContain('theme-tidal');
    expect(animatedThemes).not.toContain('.app-frame.theme-helios::before');
  });
});
