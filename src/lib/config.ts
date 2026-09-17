export type HexiVerseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  hexigridOrigin: string;
  mediaProvider: 'supabase' | 'user-owned';
  googleMailClientId: string;
  microsoftMailClientId: string;
};

export type RuntimeConfig = Pick<HexiVerseConfig, 'supabaseUrl' | 'supabaseAnonKey'>;

const runtimeConfigKey = 'hexiverse-runtime-config-v1';

const required = (value: string | undefined, name: string) => {
  const clean = value?.trim() || '';
  if (!clean || clean.includes('your-')) throw new Error(`${name} is not configured.`);
  return clean;
};

export function readConfig(env: Record<string, string | undefined> = import.meta.env): HexiVerseConfig {
  const runtime = env === import.meta.env ? readRuntimeConfig() : null;
  return {
    supabaseUrl: required(runtime?.supabaseUrl || env.VITE_SUPABASE_URL, 'Supabase project URL'),
    supabaseAnonKey: required(runtime?.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY, 'Supabase public anon key'),
    hexigridOrigin: (env.VITE_HEXIGRID_ORIGIN || 'http://127.0.0.1:4318').replace(/\/$/, ''),
    mediaProvider: env.VITE_MEDIA_PROVIDER === 'user-owned' ? 'user-owned' : 'supabase',
    googleMailClientId: env.VITE_GOOGLE_MAIL_CLIENT_ID?.trim() || '',
    microsoftMailClientId: env.VITE_MICROSOFT_MAIL_CLIENT_ID?.trim() || ''
  };
}

function readRuntimeConfig(): RuntimeConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(runtimeConfigKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RuntimeConfig>;
    if (typeof value.supabaseUrl !== 'string' || typeof value.supabaseAnonKey !== 'string') return null;
    return { supabaseUrl: value.supabaseUrl, supabaseAnonKey: value.supabaseAnonKey };
  } catch {
    return null;
  }
}

export function savedRuntimeConfig(): RuntimeConfig | null {
  return readRuntimeConfig();
}

export function saveRuntimeConfig(config: RuntimeConfig): void {
  const supabaseUrl = required(config.supabaseUrl, 'Supabase project URL');
  const supabaseAnonKey = required(config.supabaseAnonKey, 'Supabase public anon key');
  if (typeof window === 'undefined') throw new Error('Browser setup is only available in the web app.');
  window.localStorage.setItem(runtimeConfigKey, JSON.stringify({ supabaseUrl, supabaseAnonKey }));
}

export function clearRuntimeConfig(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(runtimeConfigKey);
}

export function configError(): string {
  return 'HexiSpace needs two public connection details before it can save social data. The setup screen lets you paste them directly; no server password or private key belongs here.';
}
