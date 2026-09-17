import { getConfig, getSupabase } from './supabase';
import { isMediaPrivacyReady } from './media-readiness';

const BUCKET = 'public-media'; // Kept for existing files; the bucket is private after migration 017.
const SIGNED_URL_TTL_SECONDS = 300;
const SIGNED_URL_REFRESH_INTERVAL_MS = 60_000;
const SIGNED_URL_REFRESH_EARLY_MS = 90_000;
const SIGNING_BATCH_SIZE = 50;
let refreshTimer: number | undefined;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

export function storageObjectPathFromUrl(value: string, projectUrl: string): string | null {
  try {
    const url = new URL(value);
    const project = new URL(projectUrl);
    if (url.origin !== project.origin) return null;
    const basePath = project.pathname.replace(/\/$/, '');
    const publicPrefix = `${basePath}/storage/v1/object/public/${BUCKET}/`;
    if (!url.pathname.startsWith(publicPrefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(publicPrefix.length));
    const segments = path.split('/');
    if (segments.length !== 2 || !/^[0-9a-f-]{36}$/i.test(segments[0])) return null;
    if (!/^[a-z0-9][a-z0-9._-]{0,255}$/i.test(segments[1]) || segments[1] === '.' || segments[1] === '..') return null;
    return path;
  } catch {
    return null;
  }
}

function isSupabasePublicMediaLocator(url: URL): boolean {
  return /\/storage\/v1\/object\/public\/public-media\//i.test(url.pathname);
}

export function mediaAttributeForProject(value: string, projectUrl: string, attribute: 'src' | 'href' = 'src'): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    // Treat recognizable Supabase object URLs as private even if they came from
    // another project or the current project is not configured. Hydration then
    // validates the configured origin and fails closed instead of exposing it.
    if (isSupabasePublicMediaLocator(url)) {
      return `data-private-media-url="${escapeHtml(url.toString())}" data-private-media-attribute="${attribute}"`;
    }
    return `${attribute}="${escapeHtml(url.toString())}"`;
  } catch {
    return '';
  }
}

/** Use this for media HTML attributes; project-owned storage URLs are never emitted as direct src/href values. */
export function mediaUrlAttribute(value: string, attribute: 'src' | 'href' = 'src'): string {
  try {
    return mediaAttributeForProject(value, getConfig().supabaseUrl, attribute);
  } catch {
    // Supabase media remains deferred until a configured project can authorize it.
    return mediaAttributeForProject(value, 'https://unconfigured.invalid', attribute);
  }
}

type SignTarget = HTMLElement & { src?: string; href?: string; load?: () => void };

function privateMediaTargets(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-private-media-url]'));
}

function setUnavailable(element: HTMLElement): void {
  element.dataset.privateMediaState = 'denied';
  if (element instanceof HTMLImageElement) {
    element.hidden = true;
    return;
  }
  if (element instanceof HTMLAnchorElement) {
    element.removeAttribute('href');
    element.setAttribute('aria-disabled', 'true');
    element.title = 'This media is no longer available to this account.';
    return;
  }
  element.hidden = true;
}

function setSignedSource(element: SignTarget, signedUrl: string, expiresAt: number): void {
  const attribute = element.dataset.privateMediaAttribute;
  if (attribute === 'href' && element instanceof HTMLAnchorElement) {
    element.href = signedUrl;
  } else if (attribute === 'src' && (element instanceof HTMLImageElement || element instanceof HTMLVideoElement || element instanceof HTMLAudioElement)) {
    element.hidden = false;
    element.src = signedUrl;
    if (element instanceof HTMLVideoElement || element instanceof HTMLAudioElement) element.load();
  } else {
    setUnavailable(element);
    return;
  }
  element.dataset.privateMediaExpiresAt = String(expiresAt);
  element.dataset.privateMediaState = 'ready';
}

async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const storage = getSupabase().storage.from(BUCKET);
  const batches: string[][] = [];
  for (let index = 0; index < paths.length; index += SIGNING_BATCH_SIZE) batches.push(paths.slice(index, index + SIGNING_BATCH_SIZE));
  await Promise.all(batches.map(async (batch) => {
    try {
      const { data, error } = await storage.createSignedUrls(batch, SIGNED_URL_TTL_SECONDS);
      if (error || !data) return;
      batch.forEach((path, index) => {
        const url = data[index]?.signedUrl || data[index]?.signedURL;
        if (url) signed.set(path, url);
      });
    } catch {
      // A denied or offline signing request leaves the media hidden; it never falls back to a public URL.
    }
  }));
  return signed;
}

export async function hydratePrivateMedia(root: ParentNode): Promise<void> {
  const targets = privateMediaTargets(root).filter((element) => {
    if (element.dataset.privateMediaState === 'loading' || element.dataset.privateMediaState === 'denied') return false;
    const expiry = Number(element.dataset.privateMediaExpiresAt || 0);
    return !expiry || expiry <= Date.now() + SIGNED_URL_REFRESH_EARLY_MS;
  });
  if (!targets.length) return;

  let projectUrl: string;
  try {
    projectUrl = getConfig().supabaseUrl;
  } catch {
    targets.forEach(setUnavailable);
    return;
  }

  const pathsByTarget = new Map<HTMLElement, string>();
  for (const target of targets) {
    const path = storageObjectPathFromUrl(target.dataset.privateMediaUrl || '', projectUrl);
    if (path) {
      target.dataset.privateMediaState = 'loading';
      pathsByTarget.set(target, path);
    } else setUnavailable(target);
  }
  const paths = [...new Set(pathsByTarget.values())];
  if (!paths.length) return;
  if (!(await isMediaPrivacyReady())) {
    for (const target of pathsByTarget.keys()) setUnavailable(target);
    return;
  }
  const signed = await signPaths(paths);
  const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
  for (const [target, path] of pathsByTarget) {
    if (!target.isConnected || !target.dataset.privateMediaUrl) continue;
    const url = signed.get(path);
    if (url) setSignedSource(target as SignTarget, url, expiresAt);
    else setUnavailable(target);
  }
  if (refreshTimer === undefined && typeof window !== 'undefined') {
    refreshTimer = window.setInterval(() => { void hydratePrivateMedia(document); }, SIGNED_URL_REFRESH_INTERVAL_MS);
  }
}

export const privateMediaPolicy = Object.freeze({ bucket: BUCKET, signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS });
