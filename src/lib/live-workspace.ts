const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function safeOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
    if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Embed the existing local Live workspace only when HexiSpace itself is being
 * served locally. A hosted page must not silently frame a local authenticated
 * workspace: browser local-network and third-party-cookie rules vary by device.
 */
export function liveWorkspaceEmbedUrl(runtimeOrigin: string, parentOrigin: string): string | null {
  const runtime = safeOrigin(runtimeOrigin);
  const parent = safeOrigin(parentOrigin);
  if (!runtime || !parent || !LOCAL_HOSTS.has(runtime.hostname) || !LOCAL_HOSTS.has(parent.hostname)) return null;
  const url = new URL('/', runtime);
  url.searchParams.set('embedded', '1');
  url.searchParams.set('view', 'live');
  url.searchParams.set('parent', parent.origin);
  return url.toString();
}

export function safeLiveWorkspaceLink(runtimeOrigin: string): string | null {
  const runtime = safeOrigin(runtimeOrigin);
  return runtime?.toString() || null;
}
