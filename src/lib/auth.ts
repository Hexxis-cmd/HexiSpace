import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { clearUnlockedModelKeys } from './model-connections';

export async function currentUser(): Promise<User | null> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error && error.message !== 'Auth session missing!') throw error;
  return data.user;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams: { access_type: 'offline', prompt: 'select_account' } }
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  clearUnlockedModelKeys();
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export function watchAuth(callback: (user: User | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') clearUnlockedModelKeys();
    callback(session?.user || null);
  });
  return () => data.subscription.unsubscribe();
}
