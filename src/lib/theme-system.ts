export const themeDefinitions = [
  {
    id: 'helios', name: 'Helios', domainLabel: 'sunlight', family: 'static', light: true,
    tokens: { bg: '#f6f1e5', surface: '#fffdf7', surface2: '#ede4d2', line: '#c8b89a', text: '#241d16', muted: '#655846', accent: '#805000', onAccent: '#fffdf7', accentAlt: '#923d31', warm: '#825137', danger: '#a22438', onDanger: '#fffdf7' },
    gradient: 'linear-gradient(135deg, #fffdf7 0%, #f6f1e5 68%, #efe2c9 100%)'
  },
  {
    id: 'athena', name: 'Athena', domainLabel: 'wisdom', family: 'static', light: false,
    tokens: { bg: '#101710', surface: '#19231a', surface2: '#222f23', line: '#455546', text: '#f5f6e9', muted: '#b9c2b5', accent: '#bdca8a', onAccent: '#071018', accentAlt: '#d3b575', warm: '#ddae76', danger: '#ff9298', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #101710 0%, #172119 56%, #22291a 100%)'
  },
  {
    id: 'poseidon', name: 'Poseidon', domainLabel: 'the sea', family: 'static', light: false,
    tokens: { bg: '#071923', surface: '#0d2633', surface2: '#133847', line: '#315968', text: '#effaff', muted: '#b5ced7', accent: '#70dce2', onAccent: '#071018', accentAlt: '#85b9ed', warm: '#edc878', danger: '#ff929e', onDanger: '#071018' },
    gradient: 'linear-gradient(155deg, #071923 0%, #0a2635 56%, #103b4a 100%)'
  },
  {
    id: 'demeter', name: 'Demeter', domainLabel: 'grain and harvest', family: 'static', light: false,
    tokens: { bg: '#1c190f', surface: '#292414', surface2: '#3a321b', line: '#635834', text: '#fff8e7', muted: '#d8c99e', accent: '#e5c567', onAccent: '#071018', accentAlt: '#9ab276', warm: '#e8ad68', danger: '#ff9a94', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #1c190f 0%, #292414 55%, #37301b 100%)'
  },
  {
    id: 'artemis', name: 'Artemis', domainLabel: 'the wilds', family: 'static', light: false,
    tokens: { bg: '#121729', surface: '#1b2340', surface2: '#293251', line: '#485476', text: '#f5f6ff', muted: '#c1c9e4', accent: '#c6d0ff', onAccent: '#071018', accentAlt: '#90baa5', warm: '#d8c59a', danger: '#ff97a2', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #121729 0%, #1b2340 58%, #182b33 100%)'
  },
  {
    id: 'hestia', name: 'Hestia', domainLabel: 'hearth and home', family: 'static', light: false,
    tokens: { bg: '#1c120d', surface: '#291a13', surface2: '#39251b', line: '#664834', text: '#fff5eb', muted: '#dec4af', accent: '#ffc18b', onAccent: '#071018', accentAlt: '#ee9b70', warm: '#eac175', danger: '#ff96a0', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #1c120d 0%, #291a13 58%, #392319 100%)'
  },
  {
    id: 'hermes', name: 'Hermes', domainLabel: 'messages and travel', family: 'animated', light: false,
    tokens: { bg: '#111925', surface: '#1a2736', surface2: '#243548', line: '#3c5870', text: '#f1f7ff', muted: '#bdd0e0', accent: '#f2cc69', onAccent: '#071018', accentAlt: '#80c9e8', warm: '#ffc980', danger: '#ff9bac', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #111925 0%, #1b2b3b 55%, #182533 100%)'
  },
  {
    id: 'hephaestus', name: 'Hephaestus', domainLabel: 'the forge', family: 'animated', light: false,
    tokens: { bg: '#1b100e', surface: '#291714', surface2: '#3b211b', line: '#684137', text: '#fff4ee', muted: '#e0b9aa', accent: '#ffb26e', onAccent: '#071018', accentAlt: '#ef765f', warm: '#f4d17a', danger: '#ff9aa2', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #1b100e 0%, #291714 58%, #3a2018 100%)'
  },
  {
    id: 'dionysus', name: 'Dionysus', domainLabel: 'vine and festivity', family: 'animated', light: false,
    tokens: { bg: '#18101f', surface: '#25172e', surface2: '#33213d', line: '#5d4268', text: '#fbf2ff', muted: '#d2bfdc', accent: '#cf9bdc', onAccent: '#071018', accentAlt: '#8bc99c', warm: '#edbf7b', danger: '#ff98ae', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #18101f 0%, #25172e 56%, #1a2a25 100%)'
  },
  {
    id: 'aphrodite', name: 'Aphrodite', domainLabel: 'love and beauty', family: 'animated', light: true,
    tokens: { bg: '#fff6f7', surface: '#fffdfd', surface2: '#f5e7ed', line: '#d9c0cf', text: '#2c2028', muted: '#67545f', accent: '#a63869', onAccent: '#fffdfd', accentAlt: '#7752a6', warm: '#82513c', danger: '#b42c4b', onDanger: '#fffdfd' },
    gradient: 'linear-gradient(135deg, #fffdfd 0%, #fff6f7 58%, #f4e4ed 100%)'
  },
  {
    id: 'hera', name: 'Hera', domainLabel: 'marriage and queenship', family: 'animated', light: false,
    tokens: { bg: '#141327', surface: '#201d3b', surface2: '#2d2950', line: '#514a77', text: '#f8f4ff', muted: '#c9c2df', accent: '#d4b7ff', onAccent: '#071018', accentAlt: '#65c9c0', warm: '#eccd83', danger: '#ff97a6', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #141327 0%, #201d3b 58%, #16302f 100%)'
  },
  {
    id: 'ares', name: 'Ares', domainLabel: 'war and battle', family: 'animated', light: false,
    tokens: { bg: '#191111', surface: '#281717', surface2: '#382020', line: '#684040', text: '#fff3ef', muted: '#dfbdb8', accent: '#f08676', onAccent: '#071018', accentAlt: '#e3bb83', warm: '#f1cd87', danger: '#ff9da5', onDanger: '#071018' },
    gradient: 'linear-gradient(145deg, #191111 0%, #281717 58%, #321d1b 100%)'
  }
] as const;

export type ThemeId = typeof themeDefinitions[number]['id'];
export type ThemeFamily = typeof themeDefinitions[number]['family'];
export type ThemeDefinition = typeof themeDefinitions[number];

const defaultThemeId: ThemeId = 'hestia';
const legacyThemeIds: Record<string, ThemeId> = {
  dark: 'hestia', light: 'helios', prism: 'aphrodite', parchment: 'helios',
  obsidian: 'hestia', aurora: 'athena', pulse: 'ares', orbit: 'hermes',
  flux: 'dionysus', halo: 'aphrodite', ember: 'hephaestus', tidal: 'poseidon'
};
const appThemeKey = 'hexispace.app-theme.v1';

export function themeDefinition(value: unknown): ThemeDefinition {
  const rawId = typeof value === 'string' ? value : '';
  const normalizedId = legacyThemeIds[rawId] || rawId;
  return themeDefinitions.find((theme) => theme.id === normalizedId)
    || themeDefinitions.find((theme) => theme.id === defaultThemeId)!;
}

export function themeId(value: unknown): ThemeId {
  return themeDefinition(value).id;
}

export function themeClass(value: unknown): string {
  return `theme-${themeId(value)}`;
}

export function profileThemeClass(value: unknown): string {
  return `profile-theme-${themeId(value)}`;
}

export function themeInlineStyle(value: unknown): string {
  const { tokens, gradient } = themeDefinition(value);
  return [
    `--bg:${tokens.bg}`, `--surface:${tokens.surface}`, `--surface2:${tokens.surface2}`,
    `--line:${tokens.line}`, `--text:${tokens.text}`, `--muted:${tokens.muted}`,
    `--accent:${tokens.accent}`, `--on-accent:${tokens.onAccent}`, `--accent-alt:${tokens.accentAlt}`, `--warm:${tokens.warm}`,
    `--danger:${tokens.danger}`, `--on-danger:${tokens.onDanger}`,
    // Older modular screens still consume these aliases; their meaning is now semantic, not literal color.
    `--mint:${tokens.accent}`, `--violet:${tokens.accentAlt}`, `--amber:${tokens.warm}`,
    `--page-gradient:${gradient}`
  ].join(';');
}

export function getAppTheme(): ThemeId {
  if (typeof window === 'undefined') return defaultThemeId;
  try { return themeId(window.localStorage.getItem(appThemeKey)); } catch { return defaultThemeId; }
}

export function saveAppTheme(value: unknown): ThemeId {
  const selected = themeId(value);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(appThemeKey, selected); } catch { /* A private tab may be session-only. */ }
  }
  return selected;
}

export function themeOptions(selected: unknown): string {
  const current = themeId(selected);
  const option = (theme: ThemeDefinition) => `<option value="${theme.id}" ${theme.id === current ? 'selected' : ''}>${theme.name} — ${theme.domainLabel}</option>`;
  const staticOptions = themeDefinitions.filter((theme) => theme.family === 'static').map(option).join('');
  const animatedOptions = themeDefinitions.filter((theme) => theme.family === 'animated').map(option).join('');
  return `<optgroup label="Static">${staticOptions}</optgroup><optgroup label="Animated">${animatedOptions}</optgroup>`;
}
