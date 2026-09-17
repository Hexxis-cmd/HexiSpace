import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const privateConsoleMarkers = [
  'LOCAL OWNER TOOL',
  'admin-console.html',
  'Purge old resolved reports'
];

export function inspectProductionArtifacts(hostingPublicDir, buildDir) {
  const findings = [];
  if (hostingPublicDir !== 'dist') {
    findings.push(`Firebase Hosting must publish the reviewed dist directory, not ${String(hostingPublicDir)}.`);
  }
  if (!existsSync(buildDir)) {
    findings.push('Production build output is missing; build the app before checking release artifacts.');
    return findings;
  }

  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(buildDir, fullPath).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (/(^|\/)admin-console\.html$/i.test(relativePath)) {
        findings.push(`${relativePath}: the owner-only moderation console must not ship in the public build.`);
      }
      if (!/\.(?:html|js|css)$/i.test(entry.name)) continue;
      let content;
      try { content = readFileSync(fullPath, 'utf8'); } catch { continue; }
      if (content.includes('\0')) continue;
      for (const marker of privateConsoleMarkers) {
        if (content.includes(marker)) {
          findings.push(`${relativePath}: contains owner-console code or copy and must not ship publicly.`);
          break;
        }
      }
    }
  };

  visit(buildDir);
  return findings;
}
