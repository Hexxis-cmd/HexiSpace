import { getSupabase } from './supabase';
import { requireMediaPrivacyReady } from './media-readiness';
import type { MediaAsset } from './types';

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = new Map<string, MediaAsset['kind']>([['image/', 'image'], ['video/', 'video'], ['audio/', 'audio']]);

export function mediaKind(file: File): MediaAsset['kind'] | null {
  for (const [prefix, kind] of ACCEPTED) if (file.type.startsWith(prefix)) return kind;
  return null;
}

async function hasKnownSignature(file: File, kind: MediaAsset['kind']): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (values: number[]) => values.every((value, index) => bytes[index] === value);
  if (kind === 'image') return starts([0x89, 0x50, 0x4e, 0x47]) || starts([0xff, 0xd8, 0xff]) || starts([0x47, 0x49, 0x46, 0x38]) || new TextDecoder().decode(bytes.slice(0, 12)).startsWith('RIFF') && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (kind === 'video') return new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp' || new TextDecoder().decode(bytes.slice(0, 4)) === 'OggS' || new TextDecoder().decode(bytes.slice(0, 4)) === '\u001aE\u001aE';
  return starts([0x52, 0x49, 0x46, 0x46]) || starts([0x49, 0x44, 0x33]) || new TextDecoder().decode(bytes.slice(0, 4)) === 'OggS';
}

export async function uploadMedia(file: File, ownerId: string): Promise<MediaAsset> {
  const kind = mediaKind(file);
  if (!kind) throw new Error('Choose an image, video, or audio file.');
  if (file.size > MAX_BYTES) throw new Error('Media files must be 50 MB or smaller on the free provider.');
  if (!(await hasKnownSignature(file, kind))) throw new Error('This file does not match its declared media type. Choose a normal image, video, or audio file.');
  await requireMediaPrivacyReady();
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const objectPath = `${ownerId}/${crypto.randomUUID()}.${extension}`;
  const supabase = getSupabase();
  const upload = await supabase.storage.from('public-media').upload(objectPath, file, { contentType: file.type, upsert: false, cacheControl: '300' });
  if (upload.error) throw new Error(`Media upload stopped: ${upload.error.message}`);
  const publicUrl = supabase.storage.from('public-media').getPublicUrl(objectPath).data.publicUrl;
  const record = await supabase.from('media_assets').insert({ owner_id: ownerId, provider: 'supabase', object_path: objectPath, public_url: publicUrl, kind, bytes: file.size }).select().single();
  if (record.error) {
    await supabase.storage.from('public-media').remove([objectPath]);
    throw record.error;
  }
  return record.data as MediaAsset;
}
