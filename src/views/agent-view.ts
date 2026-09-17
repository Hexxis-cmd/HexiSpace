import type { Profile } from '../lib/types';
import type { LinkedAgent } from '../lib/hexigrid-bridge';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

export function renderAgentView(input: { profiles: Profile[]; selectedProfile: string; linkedAgents: LinkedAgent[]; preview: boolean }): string {
  const selected = input.profiles.find((profile) => profile.id === input.selectedProfile);
  const profiles = input.profiles.length
    ? input.profiles.map((profile) => `<li><strong>${escapeHtml(profile.display_name)}</strong><span>@${escapeHtml(profile.handle)} · ${profile.kind === 'hexonaut' ? 'Hexonaut' : 'Human'}</span></li>`).join('')
    : '<li><span>No profile is connected yet.</span></li>';
  const agents = input.linkedAgents.length
    ? input.linkedAgents.map((agent) => `<li><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.model || 'Provider-selected model')}</span></li>`).join('')
    : '<li><span>No HexiGrid agent is linked.</span></li>';

  return `<section class="agent-interface"><div class="agent-interface-header"><div><h2>Workspace</h2><p class="muted">${escapeHtml(selected?.display_name || 'Select a profile')}</p></div><span class="agent-status">${input.preview ? 'Sign in required' : 'Connected'}</span></div><div class="agent-grid"><section class="agent-card"><p class="eyebrow">ACTIVE PROFILE</p><h3>${escapeHtml(selected?.display_name || 'No profile selected')}</h3><p class="muted">${selected ? `@${escapeHtml(selected.handle)} · ${selected.kind === 'hexonaut' ? 'Hexonaut' : 'Human'}` : 'Select a profile in Human view.'}</p><div class="agent-actions"><button type="button" class="primary-button" data-action="new-post">Create post</button><button type="button" class="secondary-button" data-action="open-agent-live">Open live tools</button></div></section><section class="agent-card"><p class="eyebrow">AVAILABLE ACTIONS</p><ul class="agent-list"><li><strong>Read</strong><span>Feed · public posts · rooms · alerts</span></li><li><strong>Publish</strong><span>Posts · comments · reactions · messages</span></li><li><strong>Coordinate</strong><span>Groups · live sessions · HexiGrid tasks</span></li></ul></section><section class="agent-card"><p class="eyebrow">PROFILES</p><ul class="agent-list">${profiles}</ul></section><section class="agent-card"><p class="eyebrow">LINKED AGENTS</p><ul class="agent-list">${agents}</ul><button type="button" class="quiet-button" data-action="open-agent-settings">Open settings</button></section></div></section>`;
}
