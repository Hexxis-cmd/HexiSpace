export type MediaEmbed =
  | { kind: 'youtube' | 'vimeo'; sourceUrl: string; embedUrl: string; title: string }
  | { kind: 'image' | 'video' | 'audio'; sourceUrl: string; title: string };

const urlPattern = /https:\/\/[^\s<>"']+/gi;
const youtubeIdPattern = /^[A-Za-z0-9_-]{6,20}$/;

function safeHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.replace(/[),.!?;:]+$/, ''));
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const localName = hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
      || hostname.endsWith('.home.arpa');
    const addressLiteral = hostname.startsWith('[') || /^[0-9.]+$/.test(hostname);
    // Direct media is fetched automatically while a feed is rendered. Reject
    // obvious local-network destinations so a post cannot make every reader's
    // browser probe localhost, a router, or another IP-literal service.
    if (url.protocol !== 'https:' || url.username || url.password || localName || addressLiteral || !hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  let id = '';
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] || '';
  else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || '';
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] || '';
  }
  return youtubeIdPattern.test(id) ? id : null;
}

function directKind(url: URL): 'image' | 'video' | 'audio' | null {
  const path = url.pathname.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif)$/.test(path)) return 'image';
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(path)) return 'audio';
  return null;
}

export function mediaEmbedForUrl(value: string): MediaEmbed | null {
  const url = safeHttpsUrl(value);
  if (!url) return null;
  const id = youtubeId(url);
  if (id) return { kind: 'youtube', sourceUrl: url.toString(), embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, title: 'YouTube video' };
  if (url.hostname.toLowerCase() === 'vimeo.com' && /^\/\d{4,15}\/?$/.test(url.pathname)) {
    const id = url.pathname.replace(/\//g, '');
    return { kind: 'vimeo', sourceUrl: url.toString(), embedUrl: `https://player.vimeo.com/video/${id}`, title: 'Vimeo video' };
  }
  const kind = directKind(url);
  return kind ? { kind, sourceUrl: url.toString(), title: `Shared ${kind}` } : null;
}

export function firstHttpsUrl(value: string): string | null {
  const match = value.match(urlPattern)?.[0];
  return match && safeHttpsUrl(match) ? match : null;
}

export function linkifyText(value: string): string {
  let output = '';
  let cursor = 0;
  for (const match of value.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const url = safeHttpsUrl(raw);
    output += escapeHtml(value.slice(cursor, index));
    output += url ? `<a ${mediaUrlAttribute(url.toString(), 'href')} target="_blank" rel="noreferrer">${escapeHtml(raw)}</a>` : escapeHtml(raw);
    cursor = index + raw.length;
  }
  return output + escapeHtml(value.slice(cursor));
}

export function renderMediaEmbed(embed: MediaEmbed): string {
  const source = escapeHtml(embed.sourceUrl);
  if (embed.kind === 'youtube' || embed.kind === 'vimeo') {
    return `<div class="post-embed post-embed-video"><iframe src="${escapeHtml(embed.embedUrl)}" title="${escapeHtml(embed.title)}" loading="lazy" referrerpolicy="no-referrer" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation"></iframe><a class="embed-source" href="${source}" target="_blank" rel="noreferrer">Open on ${embed.kind === 'youtube' ? 'YouTube' : 'Vimeo'}</a></div>`;
  }
  if (embed.kind === 'image') return `<div class="post-embed post-embed-image"><img ${mediaUrlAttribute(embed.sourceUrl)} alt="Shared image" loading="lazy" referrerpolicy="no-referrer"></div>`;
  if (embed.kind === 'video') return `<div class="post-embed post-embed-video"><video ${mediaUrlAttribute(embed.sourceUrl)} controls playsinline preload="metadata"></video></div>`;
  return `<div class="post-embed post-embed-audio"><audio ${mediaUrlAttribute(embed.sourceUrl)} controls preload="metadata"></audio></div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}
import { mediaUrlAttribute } from './private-media';
