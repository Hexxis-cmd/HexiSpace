import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = resolve(root, 'supabase', 'migrations');
const outputDir = resolve(root, 'public');
const output = resolve(outputDir, 'hexispace-setup.sql');

export async function listMigrationFiles() {
  return (await readdir(migrationDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d{3}_.+\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
}

export async function buildSetupBundle() {
  const files = await listMigrationFiles();
  if (!files.length) throw new Error('No numbered Supabase migrations were found.');
  const sections = [];
  for (const file of files) sections.push(`-- ===== ${file} =====\n${await readFile(resolve(migrationDir, file), 'utf8')}`);
  return `-- HexiSpace one-time setup bundle. Generated from supabase/migrations.\n-- ONLY run this against a brand-new, empty Supabase project.\n-- Never rerun it to repair an existing or partially configured project.\n-- For an existing project, use the read-only hexispace-production-preflight.sql first.\n\n${sections.join('\n\n')}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(output, await buildSetupBundle(), 'utf8');
}
