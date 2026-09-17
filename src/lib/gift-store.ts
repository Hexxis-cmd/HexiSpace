import { getSupabase } from './supabase';
import { PUBLIC_PROFILE_FIELDS, oneRelation } from './public-projections';
import { safePostBody } from './policy';
import type { CoinLedgerEntry, GiftCatalogItem, GiftSend } from './types';
import type { Profile } from './types';

const db = () => getSupabase();

export type ReceivedGift = Omit<GiftSend, 'sender' | 'gift'> & {
  sender?: Pick<Profile, 'id' | 'kind' | 'display_name' | 'handle' | 'avatar_url'>;
  gift?: Pick<GiftCatalogItem, 'gift_key' | 'name' | 'description' | 'cost' | 'icon'>;
};

export async function giftBalance(ownerId: string): Promise<number> {
  const { data, error } = await db().from('hexicoin_wallets').select('balance').eq('owner_id', ownerId).single();
  if (error) throw error;
  return Number(data?.balance || 0);
}

export async function giftCatalog(): Promise<GiftCatalogItem[]> {
  const { data, error } = await db().from('gift_catalog').select('*').eq('enabled', true).order('cost');
  if (error) throw error;
  return (data || []) as GiftCatalogItem[];
}

export async function coinHistory(ownerId: string): Promise<CoinLedgerEntry[]> {
  const { data, error } = await db().from('hexicoin_ledger').select('id,delta,reason,entry_type,created_at').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data || []) as CoinLedgerEntry[];
}

export async function sendGift(senderProfileId: string, recipientProfileId: string, giftKey: string, quantity: number, note: string, requestKey: string): Promise<GiftSend> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Choose between 1 and 20 gifts.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) throw new Error('The gift request could not be safely identified. Please reload the form.');
  const cleanNote = safePostBody(note, 300);
  const { data, error } = await db().rpc('send_hexicoin_gift', { sender_profile_id: senderProfileId, recipient_profile_id: recipientProfileId, requested_gift_key: giftKey, gift_quantity: quantity, gift_note: cleanNote, request_key: requestKey });
  if (error) throw error;
  return data as GiftSend;
}

export async function receivedGifts(profileIds: string[]): Promise<ReceivedGift[]> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return [];
  const projection = `id,sender_profile_id,recipient_profile_id,gift_id,quantity,note,created_at,sender:profiles!gift_sends_sender_profile_id_fkey(${PUBLIC_PROFILE_FIELDS}),gift:gift_catalog(gift_key,name,description,cost,icon)`;
  const { data, error } = await db().from('gift_sends').select(projection).in('recipient_profile_id', ids).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).map((row) => {
    const record = row as unknown as ReceivedGift & { sender?: ReceivedGift['sender'] | ReceivedGift['sender'][] | null; gift?: ReceivedGift['gift'] | ReceivedGift['gift'][] | null };
    const sender = oneRelation(record.sender);
    const gift = oneRelation(record.gift);
    const { sender: _sender, gift: _gift, ...fields } = record;
    return { ...fields, ...(sender ? { sender } : {}), ...(gift ? { gift } : {}) };
  });
}
