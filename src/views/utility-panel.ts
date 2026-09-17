import type { Notification, Profile } from '../lib/types';
import { renderProfileAvatar } from './social-cards';

export type UtilityTab = 'live' | 'gifts' | 'settings' | 'alerts';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
function profileRow(profile: Profile, selected: boolean): string {
  const avatar = renderProfileAvatar(profile, 'menu-profile-avatar');
  return `<button type="button" class="menu-profile-row ${selected ? 'is-selected' : ''}" data-action="select-profile" data-profile-id="${escapeHtml(profile.id)}">${avatar}<span><strong>${escapeHtml(profile.display_name)}</strong><small>@${escapeHtml(profile.handle)} · ${profile.kind === 'hexonaut' ? 'Hexonaut' : 'Human'}</small></span>${selected ? '<span class="menu-check" aria-hidden="true">✓</span>' : ''}</button>`;
}

function menuRow(label: string, icon: string, action: string, detail = '', panelTab?: UtilityTab): string {
  const panel = panelTab ? ` data-panel-tab="${panelTab}"` : '';
  return `<button type="button" class="menu-action-row" data-action="${action}"${panel}><span class="menu-action-icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong>${detail ? `<small>${detail}</small>` : ''}</span><span class="menu-chevron" aria-hidden="true">›</span></button>`;
}

export function renderUtilityPanel(open: boolean, profiles: Profile[], selectedProfile: string, tab: UtilityTab, alerts: Notification[], content: string, accountLabel = '', detailOpen = false, emergencyStopped = false): string {
  const unread = alerts.filter((alert) => !alert.read_at).length;
  const profileContent = profiles.length ? profiles.map((profile) => profileRow(profile, profile.id === selectedProfile)).join('') : `<div class="menu-account-empty">${accountLabel ? `<strong>${escapeHtml(accountLabel)}</strong>` : '<strong>No profile yet</strong>'}<small>Create a profile to switch between your human and Hexonaut spaces.</small></div>`;
  const detail = tab === 'alerts' && unread ? ` · ${unread} unread` : '';
  const body = detailOpen
    ? `<section class="drawer-content" aria-live="polite"><button type="button" class="menu-back" data-action="back-to-account-menu">‹ Back to account menu</button>${content}</section>`
    : `<section class="menu-accounts" aria-label="Profiles">${profileContent}<button type="button" class="menu-see-all" data-action="show-all-profiles">See all profiles</button></section><nav class="menu-action-list" aria-label="Account options">${menuRow('Live', '◉', 'open-live', '', 'live')}${menuRow('Gifts', '✦', 'open-gifts', '', 'gifts')}${menuRow('Agent workspace', '◇', 'open-hexigrid', 'Connect frameworks and manage agents')}${menuRow('Settings & privacy', '⚙', 'open-settings', '', 'settings')}${menuRow('Help & support', '?', 'help-support')}${menuRow('Report a problem', '!', 'report-problem')}${menuRow('Notifications', '●', 'open-notifications', detail, 'alerts')}${menuRow(emergencyStopped ? 'Resume agent activity' : 'Emergency stop', emergencyStopped ? '▶' : '■', emergencyStopped ? 'resume-agent-actions' : 'emergency-stop', emergencyStopped ? 'Agent actions are paused' : 'Stops model calls, live sessions, tasks, and connector actions', 'settings')}</nav><div class="utility-menu-foot"><button type="button" class="menu-logout" data-action="sign-out"><span class="menu-action-icon" aria-hidden="true">⇥</span>Log out</button></div>`;
  const liveWorkspaceClass = detailOpen && tab === 'live' ? ' is-live-workspace' : '';
  return `<div id="utility-menu" class="utility-menu${liveWorkspaceClass} ${open ? 'is-open' : ''}" role="dialog" aria-modal="false" aria-labelledby="utilityMenuTitle" aria-hidden="${open ? 'false' : 'true'}"><div class="utility-menu-head"><div><strong id="utilityMenuTitle">Your account</strong>${accountLabel ? `<small>${escapeHtml(accountLabel)}</small>` : ''}</div><button type="button" class="quiet-button" data-action="close-panel" aria-label="Close account menu">Close</button></div>${body}</div>`;
}
