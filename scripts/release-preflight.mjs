import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectProductionArtifacts } from './production-artifacts.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const forbiddenPaths = [
  /(^|\/)\.env(?:\.(?!example$).+)?$/i,
  /(^|\/)data\/(?:vault|workspace|media|plugins|runner-profiles)(?:\/|$)/i,
  /(^|\/)data\/(?:control-room\.json|\.runtime\.json|\.instance\.lock|.*\.state-key)$/i,
  /(^|\/)data\/\.development-fresh-start$/i,
  /(^|\/)(?:credentials|client_secret|token)[^/]*\.json$/i,
  /\.(?:pem|key|p12|pfx)$/i
];
const secretPatterns = [
  ['OpenAI-style key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['authorization bearer value', /\bauthorization\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._~+\/-]{20,}/gi],
  ['machine-specific Windows profile', /[A-Za-z]:\\Users\\(?!Public\\|Default\\)[^\\\s"']+/gi]
];

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function candidateFiles() {
  return git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
}

function scan(label, content, findings) {
  if (content.includes('\0')) return;
  for (const [kind, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${label}: possible ${kind}`);
  }
}

const findings = [];
const files = candidateFiles();
try {
  const firebaseConfig = JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  findings.push(...inspectProductionArtifacts(firebaseConfig.hosting?.public, path.join(root, 'dist')));
} catch {
  findings.push('firebase.json: could not verify the public hosting directory.');
}
for (const file of files) {
  const normalized = file.replaceAll('\\', '/');
  if (forbiddenPaths.some((pattern) => pattern.test(normalized))) findings.push(`${file}: private runtime or credential file must not be included`);
  try { scan(file, readFileSync(path.join(root, file), 'utf8'), findings); } catch { /* Binary or unreadable files are not text secrets. */ }
}

for (const label of ['staged changes', 'working-tree changes']) {
  try { scan(label, git(['diff', label === 'staged changes' ? '--cached' : '--']), findings); } catch { /* A diff is optional for a clean checkout. */ }
}

if (findings.length) {
  console.error('HexiSpace release privacy check failed:');
  for (const finding of [...new Set(findings)]) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`HexiSpace release privacy check passed: ${files.length} candidate files checked.`);
