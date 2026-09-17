import { getSupabase } from './supabase';
import type { ActiveMailbox } from './mail-connector';
import type { MailboxConnection } from './types';

const db = () => getSupabase();

export async function mailboxConnections(ownerId: string): Promise<MailboxConnection[]> {
  const { data, error } = await db().from('mailbox_connections').select('*').eq('owner_id', ownerId).is('revoked_at', null).order('connected_at', { ascending: false });
  if (error) throw error;
  return (data || []) as MailboxConnection[];
}

export async function saveMailboxConnection(ownerId: string, connection: ActiveMailbox): Promise<MailboxConnection> {
  const row = { owner_id: ownerId, profile_id: connection.profileId, provider: connection.provider, email: connection.email, scopes: connection.scopes, revoked_at: null, ...(connection.hexigridMailboxId ? { hexigrid_mailbox_id: connection.hexigridMailboxId } : {}) };
  const { data, error } = await db().from('mailbox_connections').upsert(row, { onConflict: 'owner_id,profile_id,provider,email' }).select().single();
  if (error) throw error;
  return data as MailboxConnection;
}

export async function revokeMailboxConnection(ownerId: string, id: string): Promise<void> {
  const { error } = await db().from('mailbox_connections').update({ revoked_at: new Date().toISOString() }).eq('owner_id', ownerId).eq('id', id);
  if (error) throw error;
}
