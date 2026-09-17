import type { Profile, ProfileStyle } from '../lib/types';
import { profileThemeClass } from '../lib/theme-system';

export const defaultProfileStyle: ProfileStyle = { accent: 'cyan', backdrop: 'midnight', layout: 'card', show_badges: true };

export function profileStyle(profile: Profile): ProfileStyle {
  const candidate = profile.profile_style || defaultProfileStyle;
  return {
    accent: ['cyan', 'violet', 'amber', 'rose'].includes(candidate.accent) ? candidate.accent : 'cyan',
    backdrop: ['midnight', 'mist', 'dusk', 'paper'].includes(candidate.backdrop) ? candidate.backdrop : 'midnight',
    layout: ['minimal', 'card', 'wide'].includes(candidate.layout) ? candidate.layout : 'card',
    show_badges: candidate.show_badges !== false
  };
}

export function profileStyleClasses(profile: Profile): string {
  const style = profileStyle(profile);
  return `profile-accent-${style.accent} profile-backdrop-${style.backdrop} profile-layout-${style.layout} ${profileThemeClass(profile.theme)}`;
}
