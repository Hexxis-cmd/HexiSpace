import { existsSync, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const spacePort = Number(process.env.HEXISPACE_PORT || process.env.VITE_PORT || 4340);
const gridPort = Number(process.env.HEXIGRID_PORT || 4318);
const gridCandidates = [
  process.env.HEXIGRID_DIR,
  path.resolve(appRoot, '..', 'HexiGrid'),
  path.resolve(appRoot, '..', 'Ilands')
].filter(Boolean).map((value) => path.resolve(value));
const gridRoot = gridCandidates.find((candidate) => {
  try { return Boolean(candidate) && requireFile(candidate, 'server.mjs'); } catch { return false; }
});
const gridOrigin = `http://127.0.0.1:${gridPort}`;
const spaceOrigin = `http://127.0.0.1:${spacePort}`;
const children = new Map();
let shuttingDown = false;

function requireFile(root, name) {
  return existsSync(path.join(root, name));
}

function validPort(value, name) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${name} must be a whole number from 1024 through 65535.`);
  return value;
}

validPort(spacePort, 'HEXISPACE_PORT');
validPort(gridPort, 'HEXIGRID_PORT');

async function packageVersion(root) {
  const raw = await fs.readFile(path.join(root, 'package.json'), 'utf8');
  const metadata = JSON.parse(raw);
  if (metadata.name !== 'hexigrid' || !/^\d+\.\d+\.\d+$/.test(String(metadata.version || ''))) throw new Error(`The folder at ${root} is not a HexiGrid installation.`);
  return String(metadata.version);
}

async function fetchText(url, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    return { response, text: await response.text() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function existingGrid(version) {
  const result = await fetchText(`${gridOrigin}/api/system/identity`);
  if (!result) return null;
  try {
    const identity = JSON.parse(result.text);
    if (result.response.ok && identity.product === 'hexigrid' && identity.version === version && identity.port === gridPort && identity.scheme === 'http') return identity;
  } catch { /* A response from another process is not a valid HexiGrid identity. */ }
  throw new Error(`Port ${gridPort} is already in use by a process that is not the expected HexiGrid service. Nothing was stopped.`);
}

async function existingSpace() {
  const result = await fetchText(`${spaceOrigin}/`);
  if (!result) return false;
  if (result.response.ok && /HexiSpace|HexiVerse/i.test(result.text)) return true;
  throw new Error(`Port ${spacePort} is already in use by a process that is not the expected HexiSpace app. Nothing was stopped.`);
}

function startChild(name, command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  children.set(name, child);
  child.once('exit', (code, signal) => {
    children.delete(name);
    if (!shuttingDown) {
      console.error(`${name} stopped${signal ? ` after ${signal}` : ` with exit code ${code ?? 'unknown'}`}.`);
      void shutdown(code || 1);
    }
  });
  child.once('error', (error) => {
    if (!shuttingDown) console.error(`${name} could not start: ${error.message}`);
  });
  return child;
}

async function waitFor(check, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds.`);
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) child.kill('SIGTERM');
  if (children.size) await new Promise((resolve) => setTimeout(resolve, 800));
  process.exitCode = code;
}

async function start() {
  if (!gridRoot) throw new Error('HexiGrid was not found. Set HEXIGRID_DIR to the folder containing HexiGrid server.mjs, or place the two repositories beside each other.');
  const gridVersion = await packageVersion(gridRoot);
  const gridIdentity = await existingGrid(gridVersion);
  if (gridIdentity) console.log(`Reusing the verified HexiGrid service at ${gridOrigin}.`);
  else {
    startChild('HexiGrid', process.execPath, [path.join(gridRoot, 'server.mjs')], gridRoot, {
      ...process.env,
      HEXIGRID_PORT: String(gridPort),
      HEXIGRID_HOST: '127.0.0.1',
      HEXIVERSE_EMBED_ORIGINS: [process.env.HEXIVERSE_EMBED_ORIGINS || '', spaceOrigin].filter(Boolean).join(',')
    });
    await waitFor(() => existingGrid(gridVersion), 'HexiGrid');
    console.log(`Started one HexiGrid service at ${gridOrigin}.`);
  }

  if (await existingSpace()) console.log(`Reusing the verified HexiSpace app at ${spaceOrigin}.`);
  else {
    const viteBin = path.join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!requireFile(appRoot, path.join('node_modules', 'vite', 'bin', 'vite.js'))) throw new Error('HexiSpace dependencies are missing. Run npm install in the HexiSpace folder first.');
    startChild('HexiSpace', process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(spacePort), '--strictPort'], appRoot, {
      ...process.env,
      VITE_HEXIGRID_ORIGIN: gridOrigin
    });
    await waitFor(existingSpace, 'HexiSpace');
    console.log(`Started one HexiSpace app at ${spaceOrigin}.`);
  }

  console.log(`Open ${spaceOrigin}. Choose HexiGrid in the header to use the built-in control-room workspace.`);
  if (!children.size) await new Promise(() => {});
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));
start().catch(async (error) => {
  console.error(error.message);
  await shutdown(1);
});
