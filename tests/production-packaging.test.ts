import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectProductionArtifacts } from '../scripts/production-artifacts.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function buildFixture(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'hexispace-release-artifacts-'));
  temporaryDirectories.push(directory);
  writeFileSync(path.join(directory, 'index.html'), '<main>HexiSpace</main>');
  return directory;
}

describe('production packaging guard', () => {
  it('accepts the reviewed Firebase dist target when the private console is absent', () => {
    const build = buildFixture();
    expect(inspectProductionArtifacts('dist', build)).toEqual([]);
  });

  it('rejects an admin console page or bundled owner-only console code', () => {
    const build = buildFixture();
    mkdirSync(path.join(build, 'dev'));
    writeFileSync(path.join(build, 'dev', 'admin-console.html'), '<main>owner tool</main>');
    writeFileSync(path.join(build, 'admin.js'), 'LOCAL OWNER TOOL');
    expect(inspectProductionArtifacts('dist', build)).toEqual(expect.arrayContaining([
      expect.stringContaining('admin-console.html'),
      expect.stringContaining('owner-console code')
    ]));
  });

  it('rejects an unreviewed Firebase hosting target or a missing production build', () => {
    const build = buildFixture();
    expect(inspectProductionArtifacts('public', build)[0]).toContain('must publish the reviewed dist directory');
    expect(inspectProductionArtifacts('dist', path.join(build, 'missing'))[0]).toContain('build the app before checking release artifacts');
  });
});
