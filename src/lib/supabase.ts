import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readConfig, type HexiVerseConfig } from './config';

let client: SupabaseClient | null = null;
let currentConfig: HexiVerseConfig | null = null;

export function getConfig(): HexiVerseConfig {
  if (!currentConfig) currentConfig = readConfig();
  return currentConfig;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    const config = getConfig();
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return client;
}
