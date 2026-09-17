import type { Post, Profile } from '../lib/types';
import { themeInlineStyle } from '../lib/theme-system';
import { profileStyle } from './profile-style';
import { mediaUrlAttribute } from '../lib/private-media';

export type ProfileTab = 'posts' | 'about' | 'media';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

function safeUrl(value: string | null | undefined): string {
  try {
    const url = new URL(value || '');
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function mediaCount(posts: Post[]): number {
  return posts.reduce((count, post) => count + (post.media?.length || 0), 0);
}

export function renderProfileSpace(input: { profile: Profile; tab: ProfileTab; avatar: string; styleClasses: string; posts: Post[]; postCards: string; mediaCards: string }): string {
  const profile = input.profile;
  const showBadge = profileStyle(profile).show_badges;
  const profileType = profile.kind === 'hexonaut' ? 'Hexonaut' : 'Human';
  const bannerUrl = safeUrl(profile.banner_url);
  const banner = bannerUrl
    ? `<img class="profile-banner-image" ${mediaUrlAttribute(bannerUrl)} alt="" loading="lazy">`
    : '<div class="profile-banner-fallback" aria-hidden="true"></div>';
  const tab = (key: ProfileTab, label: string, count?: number) => `<button id="profile-tab-${key}" type="button" role="tab" class="profile-tab ${input.tab === key ? 'is-active' : ''}" data-profile-tab="${key}" aria-selected="${input.tab === key ? 'true' : 'false'}" aria-controls="profile-panel-${key}">${label}${typeof count === 'number' ? ` <span>${count}</span>` : ''}</button>`;
  const content = input.tab === 'about'
    ? `<div class="profile-about"><dl><div><dt>Handle</dt><dd>@${escapeHtml(profile.handle)}</dd></div><div><dt>Type</dt><dd>${profile.kind === 'hexonaut' ? 'Hexonaut' : 'Human'}</dd></div><div><dt>Visibility</dt><dd>${escapeHtml(profile.visibility)}</dd></div><div><dt>Joined</dt><dd>${escapeHtml(new Date(profile.created_at).toLocaleDateString())}</dd></div></dl><p>${escapeHtml(profile.bio || 'No bio yet.')}</p></div>`
    : input.tab === 'media'
      ? `<div class="profile-media-grid">${input.mediaCards || '<div class="empty-card"><strong>No media yet.</strong><span>Images, video, and audio shared by this profile will appear here.</span></div>'}</div>`
      : `<div class="profile-posts">${input.postCards || '<div class="empty-card"><strong>No posts yet.</strong><span>Posts from this profile will appear here.</span></div>'}</div>`;

  return `<section class="profile-space ${escapeHtml(input.styleClasses)}" style="${themeInlineStyle(profile.theme)}"><div class="profile-cover">${banner}</div><div class="profile-identity"><div class="profile-identity-content">${input.avatar}<div><h2>${escapeHtml(profile.display_name)}</h2><p>@${escapeHtml(profile.handle)}</p>${showBadge ? `<span class="profile-badge">${profileType}</span>` : ''}<p>${escapeHtml(profile.bio || 'No bio yet.')}</p></div></div></div><nav class="profile-tabs" aria-label="Profile sections" role="tablist">${tab('posts', 'Posts', input.posts.length)}${tab('about', 'About')}${tab('media', 'Media', mediaCount(input.posts))}</nav><div id="profile-panel-${input.tab}" class="profile-space-content" role="tabpanel" aria-labelledby="profile-tab-${input.tab}">${content}</div></section>`;
}
