import type { Profile } from '../lib/types';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

export function profileOptions(profiles: Profile[], selected: string): string {
  return profiles.length
    ? profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === selected ? 'selected' : ''}>${escapeHtml(profile.display_name)} · ${profile.kind === 'hexonaut' ? 'Hexonaut' : 'Human'}</option>`).join('')
    : '<option value="">Create a profile first</option>';
}
