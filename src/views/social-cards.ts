import type { Group, Post, Profile, SearchResult } from '../lib/types';
import { firstHttpsUrl, linkifyText, mediaEmbedForUrl, renderMediaEmbed } from '../lib/media-embeds';
import { mediaUrlAttribute } from '../lib/private-media';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

export function safeCardUrl(value: string): string {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function renderPostCard(post: Post): string {
  const author = post.author;
  const authorAvatar = author ? renderProfileAvatar(author) : '<div class="avatar">?</div>';
  const media = post.media?.map((item) => {
    const url = safeCardUrl(item.public_url);
    if (!url) return '';
    if (item.kind === 'image') return `<img ${mediaUrlAttribute(url)} alt="Media shared by ${esc(author?.display_name || 'profile')}" loading="lazy">`;
    if (url.startsWith('https:') && item.kind === 'video') return `<video ${mediaUrlAttribute(url)} controls playsinline preload="metadata"></video>`;
    if (url.startsWith('https:') && item.kind === 'audio') return `<audio ${mediaUrlAttribute(url)} controls preload="metadata"></audio>`;
    return `<a class="media-link" ${mediaUrlAttribute(url, 'href')} target="_blank" rel="noreferrer">Open ${esc(item.kind)}</a>`;
  }).join('') || '';
  const sharedUrl = firstHttpsUrl(post.body);
  const embed = sharedUrl ? mediaEmbedForUrl(sharedUrl) : null;
  return `<article class="post-card"><div class="post-author">${authorAvatar}<div><strong>${esc(author?.display_name || 'Unknown profile')}</strong><span>@${esc(author?.handle || 'profile')} · ${new Date(post.created_at).toLocaleString()}</span></div><span class="visibility">${esc(post.visibility)}</span></div><p>${linkifyText(post.body)}</p>${embed ? renderMediaEmbed(embed) : ''}${media ? `<div class="post-media">${media}</div>` : ''}<div class="post-actions"><button type="button" data-action="react" data-post-id="${esc(post.id)}">React</button><button type="button" data-action="comment" data-post-id="${esc(post.id)}">Comment</button><button type="button" data-action="share" data-post-id="${esc(post.id)}">Share</button><button type="button" data-action="report-post" data-post-id="${esc(post.id)}">Report</button>${post.ai_generated ? '<span class="ai-label">AI-assisted</span>' : ''}</div></article>`;
}

export function renderProfileAvatar(profile: Profile, className = 'avatar'): string {
  const url = safeCardUrl(profile.avatar_url || '');
  const initial = esc(profile.display_name.slice(0, 1).toUpperCase());
  return url
    ? `<span class="${className} avatar-frame"><span class="avatar-initial" aria-hidden="true">${initial}</span><img class="avatar-image" ${mediaUrlAttribute(url)} alt="" loading="lazy"></span>`
    : `<span class="${className}">${initial}</span>`;
}

export function renderProfileCard(profile: Profile, ownProfile = false): string {
  const actions = ownProfile ? '<span class="muted profile-self-label">Your profile</span>' : `<button class="quiet-button" data-action="follow-profile" data-profile-id="${esc(profile.id)}">Follow</button><button class="quiet-button" data-action="friend-profile" data-profile-id="${esc(profile.id)}">Add friend</button>`;
  return `<article class="discover-card"><button class="profile-card-main" data-action="open-profile" data-profile-id="${esc(profile.id)}">${renderProfileAvatar(profile)}<span><strong>${esc(profile.display_name)}</strong><small>@${esc(profile.handle)} · ${esc(profile.kind === 'hexonaut' ? 'Hexonaut' : 'Human')}</small><span>${esc(profile.bio || 'No public bio yet.')}</span></span></button><div class="profile-actions">${actions}</div></article>`;
}

export function renderGroupCard(group: Group, mine = false): string {
  const privacy = group.visibility === 'approval' ? 'Join by request' : group.visibility === 'public' ? 'Open group' : 'Private group';
  const actions = mine ? `<button class="quiet-button" data-action="view-group" data-group-id="${esc(group.id)}">Open</button><button class="quiet-button" data-action="edit-group" data-group-id="${esc(group.id)}">Edit</button><button class="secondary-button" data-action="manage-group" data-group-id="${esc(group.id)}">Manage</button>` : `<button class="quiet-button" data-action="view-group" data-group-id="${esc(group.id)}">Open</button><button class="secondary-button" data-action="join-group" data-group-id="${esc(group.id)}">Join</button>`;
  return `<article class="group-card"><div><strong>${esc(group.name)}</strong><small>@${esc(group.handle)} · ${privacy}</small><p>${esc(group.description || 'No description yet.')}</p>${group.rules ? `<details><summary>Community rules</summary><p>${esc(group.rules)}</p></details>` : ''}</div><div class="group-actions">${actions}</div></article>`;
}

export function renderSearchResultCard(result: SearchResult, ownedProfileIds: string[]): string {
  if (result.type === 'profile') return renderProfileCard(result.profile, ownedProfileIds.includes(result.profile.id));
  if (result.type === 'group') return renderGroupCard(result.group, false);
  return `<article class="search-post"><strong>${esc(result.post.author?.display_name || 'Profile')}</strong><small>@${esc(result.post.author?.handle || 'profile')}</small><p>${esc(result.post.body)}</p></article>`;
}
