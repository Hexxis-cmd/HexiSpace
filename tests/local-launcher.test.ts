import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../scripts/start-local.mjs', import.meta.url), 'utf8');

describe('local HexiSpace launcher', () => {
  it('reuses verified services and refuses unrelated ports', () => {
    expect(source).toContain('Reusing the verified HexiGrid service');
    expect(source).toContain('Reusing the verified HexiSpace app');
    expect(source).toContain('not the expected HexiGrid service');
    expect(source).toContain('not the expected HexiSpace app');
  });

  it('uses strict ports, exact child paths, and cleans up only children it owns', () => {
    expect(source).toContain("'--strictPort'");
    expect(source).toContain("path.join(gridRoot, 'server.mjs')");
    expect(source).toContain("child.kill('SIGTERM')");
    expect(source).toContain('HEXIVERSE_EMBED_ORIGINS');
  });
});
