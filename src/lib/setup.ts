import { getSupabase } from './supabase';

export type SetupCheck = { ok: true } | { ok: false; message: string; detail?: string };

/** Checks the public connection and whether the HexiSpace tables have been installed. */
export async function checkSocialService(): Promise<SetupCheck> {
  try {
    // This is a permission/schema probe only; never fetch even one profile while checking setup.
    const { error } = await getSupabase().from('profiles').select('id').limit(0);
    if (!error) return { ok: true };
    if (error.code === '42501' || error.message.toLowerCase().includes('permission denied for table')) {
      return {
        ok: false,
        message: 'The project is connected, but its public-data security setup is incomplete.',
        detail: 'Ask the site owner to finish reviewing the database setup. Do not rerun the initial setup file on an existing project.'
      };
    }
    const message = error.message.toLowerCase();
    if (message.includes('relation') && message.includes('does not exist')) {
      return { ok: false, message: 'Your connection works, but the HexiSpace database setup is incomplete.', detail: 'Ask the site owner to finish the one-time setup. If setup was already attempted, do not rerun the initial file; its migrations need to be reconciled first.' };
    }
    return { ok: false, message: 'HexiSpace reached the project, but the project rejected the connection.', detail: error.message };
  } catch (error) {
    return { ok: false, message: 'HexiSpace could not reach that project.', detail: error instanceof Error ? error.message : 'Check the URL and try again.' };
  }
}
