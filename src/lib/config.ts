export type HexiVerseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  hexigridOrigin: string;
  mediaProvider: 'supabase' | 'user-owned';
};

const required = (value: string | undefined, name: string) => {
  const clean = value?.trim() || '';
  if (!clean || clean.includes('your-')) throw new Error(`${name} is not configured.`);
  return clean;
};

export function readConfig(env: Record<string, string | undefined> = import.meta.env): HexiVerseConfig {
  return {
    supabaseUrl: required(env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
    supabaseAnonKey: required(env.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY'),
    hexigridOrigin: (env.VITE_HEXIGRID_ORIGIN || 'http://127.0.0.1:4318').replace(/\/$/, ''),
    mediaProvider: env.VITE_MEDIA_PROVIDER === 'user-owned' ? 'user-owned' : 'supabase'
  };
}

export function configError(): string {
  return 'HexiVerse is not connected to its shared service yet. Copy .env.example to .env.local, add the public Supabase URL and anon key from your own project, then restart the app. No private key belongs in this file.';
}
