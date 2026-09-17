import type { ShellState } from './view-state';

export type SocialNavKey = 'feed' | 'discover' | 'groups' | 'inbox' | 'profile';

const pageTitles: Record<SocialNavKey, string> = {
  feed: 'Home',
  discover: 'Explore',
  groups: 'Groups',
  inbox: 'Inbox',
  profile: 'Profile',
};

const navHashes: Record<SocialNavKey, string> = {
  feed: '#feed',
  discover: '#explore',
  groups: '#groups',
  inbox: '#inbox',
  profile: '#profile',
};

export function navFromHash(hash: string): SocialNavKey {
  const value = hash.replace(/^#/, '').toLowerCase();
  if (value === 'explore' || value === 'discover') return 'discover';
  if (value === 'groups' || value === 'group') return 'groups';
  if (value === 'inbox' || value === 'messages') return 'inbox';
  if (value === 'profile' || value === 'me') return 'profile';
  return 'feed';
}

export function hashForNav(nav: SocialNavKey): string {
  return navHashes[nav];
}

export function selectSocialNav(state: ShellState, nav: SocialNavKey): void {
  state.activeApp = 'space';
  state.activeNav = nav;
  state.notice = '';
  state.groupFeedId = '';
  state.groupPosts = [];
  state.selectedGroup = '';
  state.groupMembers = [];
  state.panelOpen = false;
  state.panelDetailOpen = false;
}

export function isHexiGridHash(hash: string): boolean {
  const value = hash.replace(/^#/, '').toLowerCase();
  return value === 'grid' || value === 'hexigrid';
}

export function renderPageHeading(activeNav: SocialNavKey, viewMode: 'human' | 'agent'): string {
  if (viewMode === 'agent') {
    return '<section class="page-heading compact-heading"><h1>Workspace</h1></section>';
  }
  return `<section class="page-heading social-heading" aria-labelledby="pageTitle"><h1 id="pageTitle">${pageTitles[activeNav]}</h1></section>`;
}
