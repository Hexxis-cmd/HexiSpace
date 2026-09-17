import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/lib/config';

describe('HexiVerse configuration', () => {
  it('accepts only a public Supabase URL and anon key', () => {
    const config = readConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key', VITE_HEXIGRID_ORIGIN: 'http://127.0.0.1:4318', VITE_MEDIA_PROVIDER: 'supabase' });
    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.mediaProvider).toBe('supabase');
    expect(config.googleMailClientId).toBe('');
  });

  it('rejects missing or example credentials', () => {
    expect(() => readConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: 'your-public-anon-key' })).toThrow();
  });
});
