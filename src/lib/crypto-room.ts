import { getSupabase } from './supabase';

const DB_NAME = 'hexiverse-private-keys';
const ROOM_STORE = 'room-keys';
const DEVICE_STORE = 'device-keys';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer { return new Uint8Array(bytes).buffer as ArrayBuffer; }

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => { const database = request.result; if (!database.objectStoreNames.contains(ROOM_STORE)) database.createObjectStore(ROOM_STORE); if (!database.objectStoreNames.contains(DEVICE_STORE)) database.createObjectStore(DEVICE_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Private room storage is unavailable.'));
  });
}

async function readStore<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => { const request = db.transaction(store, 'readonly').objectStore(store).get(key); request.onsuccess = () => resolve(request.result as T | undefined); request.onerror = () => reject(request.error); });
}

async function writeStore(store: string, key: string, value: unknown): Promise<void> {
  const db = await openKeyDb();
  await new Promise<void>((resolve, reject) => { const request = db.transaction(store, 'readwrite').objectStore(store).put(value, key); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

async function storedKey(roomId: string): Promise<CryptoKey | null> {
  const value = await readStore<string>(ROOM_STORE, roomId);
  return value ? crypto.subtle.importKey('raw', ownedBuffer(base64ToBytes(value)), 'AES-GCM', false, ['encrypt', 'decrypt']) : null;
}

async function saveKey(roomId: string, key: CryptoKey): Promise<void> { await writeStore(ROOM_STORE, roomId, bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))); }

async function rawRoomKey(roomId: string): Promise<Uint8Array> {
  const value = await readStore<string>(ROOM_STORE, roomId);
  if (!value) throw new Error('This device does not have the room key.');
  return base64ToBytes(value);
}

export async function ensureDeviceKey(profileId: string): Promise<JsonWebKey> {
  const existing = await readStore<{ publicKey: JsonWebKey; privateKey: JsonWebKey }>(DEVICE_STORE, profileId);
  if (existing) return existing.publicKey;
  const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const keys = { publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey) };
  await writeStore(DEVICE_STORE, profileId, keys);
  await getSupabase().from('profile_device_keys').upsert({ owner_id: (await getSupabase().auth.getUser()).data.user?.id, profile_id: profileId, public_jwk: keys.publicKey }, { onConflict: 'owner_id,profile_id' });
  return keys.publicKey;
}

async function privateDeviceKey(profileId: string): Promise<CryptoKey> {
  const stored = await readStore<{ privateKey: JsonWebKey }>(DEVICE_STORE, profileId);
  if (!stored) throw new Error('This device has not created a private room key yet.');
  return crypto.subtle.importKey('jwk', stored.privateKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}

export async function getOrCreateRoomKey(roomId: string): Promise<CryptoKey> {
  const existing = await storedKey(roomId);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await saveKey(roomId, key);
  return key;
}

export async function initializeEncryptedRoom(roomId: string, profileId: string): Promise<void> {
  await ensureDeviceKey(profileId);
  await getOrCreateRoomKey(roomId);
  await shareRoomKey(roomId, profileId);
}

export async function shareRoomKey(roomId: string, profileId: string): Promise<void> {
  const raw = await rawRoomKey(roomId);
  const { data: device, error: deviceError } = await getSupabase().from('profile_device_keys').select('public_jwk').eq('profile_id', profileId).maybeSingle();
  if (deviceError) throw deviceError;
  if (!device?.public_jwk) throw new Error('That profile has not opened HexiSpace on a device yet, so its room key cannot be delivered.');
  const publicKey = await crypto.subtle.importKey('jwk', device.public_jwk as JsonWebKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const wrappedKey = bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, ownedBuffer(raw))));
  const user = await getSupabase().auth.getUser();
  if (!user.data.user) throw new Error('Sign in again before sharing a room key.');
  const { error } = await getSupabase().from('encrypted_room_keys').upsert({ room_id: roomId, profile_id: profileId, wrapped_key: wrappedKey }, { onConflict: 'room_id,profile_id' });
  if (error) throw error;
}

export async function restoreRoomKey(roomId: string, profileId: string): Promise<void> {
  const privateKey = await privateDeviceKey(profileId);
  const { data, error } = await getSupabase().from('encrypted_room_keys').select('wrapped_key').eq('room_id', roomId).eq('profile_id', profileId).maybeSingle();
  if (error) throw error;
  if (!data?.wrapped_key) throw new Error('The room owner has not shared this room key with your device yet.');
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, ownedBuffer(base64ToBytes(data.wrapped_key)));
  const roomKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  await saveKey(roomId, roomKey);
}

export async function encryptRoomMessage(roomId: string, text: string): Promise<string> {
  const key = await getOrCreateRoomKey(roomId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  const packed = new Uint8Array(iv.length + cipher.length); packed.set(iv, 0); packed.set(cipher, iv.length); return bytesToBase64(packed);
}

export async function decryptRoomMessage(roomId: string, packedValue: string, profileId?: string): Promise<string> {
  let key = await storedKey(roomId);
  if (!key && profileId) { await ensureDeviceKey(profileId); await restoreRoomKey(roomId, profileId); key = await storedKey(roomId); }
  if (!key) return '[This encrypted message is not available on this device.]';
  const packed = base64ToBytes(packedValue);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ownedBuffer(packed.slice(0, 12)) }, key, ownedBuffer(packed.slice(12)));
  return new TextDecoder().decode(plain);
}

export async function exportRoomKey(roomId: string): Promise<string> { return bytesToBase64(await rawRoomKey(roomId)); }
export async function importRoomKey(roomId: string, value: string): Promise<void> { await saveKey(roomId, await crypto.subtle.importKey('raw', ownedBuffer(base64ToBytes(value)), 'AES-GCM', false, ['encrypt', 'decrypt'])); }
