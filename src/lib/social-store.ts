import { getSupabase } from './supabase';
import { safePostBody } from './policy';
import type { Comment, Friendship, Follow, Message, Notification, Post, Profile, Room, RoomMember, ScheduledTask, Visibility } from './types';

const db = () => getSupabase();

export async function myProfiles(ownerId: string): Promise<Profile[]> {
  const { data, error } = await db().from('profiles').select('*').eq('owner_id', ownerId).order('created_at');
  if (error) throw error;
  return (data || []) as Profile[];
}

export async function createProfile(ownerId: string, input: Pick<Profile, 'kind' | 'display_name' | 'handle' | 'visibility'>): Promise<Profile> {
  const displayName = safePostBody(input.display_name, 80);
  const handle = input.handle.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
  if (!displayName || !handle) throw new Error('Add a name and a simple handle first.');
  if (input.kind === 'hexonaut') {
    const { data: humans, error: humanError } = await db().from('profiles').select('id').eq('owner_id', ownerId).eq('kind', 'human').limit(1);
    if (humanError) throw humanError;
    if (!humans?.length) throw new Error('Create your human profile first. It owns Hexonaut profiles.');
  }
  const { data, error } = await db().from('profiles').insert({ owner_id: ownerId, kind: input.kind, display_name: displayName, handle, visibility: input.visibility, bio: '', theme: 'dark' }).select().single();
  if (error) throw error;
  const profile = data as Profile;
  return profile;
}

export async function feed(_ownerId: string): Promise<Post[]> {
  const { data, error } = await db().from('posts').select('*, author:profiles(*)').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  const posts = (data || []) as Array<Post & { media_ids?: string[] }>;
  const ids = [...new Set(posts.flatMap((post) => post.media_ids || []))];
  if (!ids.length) return posts.map((post) => ({ ...post, media: [] }));
  const { data: media, error: mediaError } = await db().from('media_assets').select('*').in('id', ids);
  if (mediaError) throw mediaError;
  const byId = new Map((media || []).map((item) => [item.id, item]));
  return posts.map((post) => ({ ...post, media: (post.media_ids || []).map((id) => byId.get(id)).filter(Boolean) as Post['media'] }));
}

export async function discoverProfiles(query: string): Promise<Profile[]> {
  const term = query.trim().replace(/[%_]/g, '');
  if (!term) return [];
  const { data, error } = await db().from('profiles').select('*').eq('visibility', 'public').or(`display_name.ilike.%${term}%,handle.ilike.%${term}%`).limit(40);
  if (error) throw error;
  return (data || []) as Profile[];
}

export async function toggleFollow(followerProfileId: string, followingProfileId: string): Promise<void> {
  if (followerProfileId === followingProfileId) throw new Error('A profile cannot follow itself.');
  const existing = await db().from('follows').select('follower_id').eq('follower_id', followerProfileId).eq('following_id', followingProfileId).maybeSingle();
  if (existing.error) throw existing.error;
  const result = existing.data ? await db().from('follows').delete().eq('follower_id', followerProfileId).eq('following_id', followingProfileId) : await db().from('follows').insert({ follower_id: followerProfileId, following_id: followingProfileId });
  if (result.error) throw result.error;
}

export async function requestFriendship(requesterId: string, addresseeId: string): Promise<Friendship> {
  if (requesterId === addresseeId) throw new Error('A profile cannot add itself as a friend.');
  const { data, error } = await db().from('friendships').insert({ requester_id: requesterId, addressee_id: addresseeId }).select().single();
  if (error) throw error;
  return data as Friendship;
}

export async function createPost(authorId: string, body: string, visibility: Visibility, aiGenerated = false, mediaIds: string[] = []): Promise<Post> {
  const text = safePostBody(body);
  if (!text && !mediaIds.length) throw new Error('Write something or attach media before posting.');
  const { data, error } = await db().from('posts').insert({ author_id: authorId, body: text, visibility, ai_generated: aiGenerated, media_ids: mediaIds }).select('*, author:profiles(*)').single();
  if (error) throw error;
  return { ...(data as Post), media: [] };
}

export async function comments(postId: string): Promise<Comment[]> {
  const { data, error } = await db().from('comments').select('*, author:profiles(*)').eq('post_id', postId).order('created_at').limit(100);
  if (error) throw error;
  return (data || []) as Comment[];
}

export async function addComment(postId: string, authorId: string, body: string): Promise<Comment> {
  const text = safePostBody(body, 2000);
  if (!text) throw new Error('Write a comment first.');
  const { data, error } = await db().from('comments').insert({ post_id: postId, author_id: authorId, body: text }).select('*, author:profiles(*)').single();
  if (error) throw error;
  return data as Comment;
}

export async function toggleReaction(postId: string, profileId: string, kind = 'like'): Promise<void> {
  const { data: existing, error: findError } = await db().from('reactions').select('id').eq('post_id', postId).eq('profile_id', profileId).eq('kind', kind).maybeSingle();
  if (findError) throw findError;
  const result = existing ? await db().from('reactions').delete().eq('id', existing.id) : await db().from('reactions').insert({ post_id: postId, profile_id: profileId, kind });
  if (result.error) throw result.error;
}

export async function rooms(ownerId: string): Promise<Room[]> {
  const { data, error } = await db().from('rooms').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Room[];
}

export async function createRoom(ownerId: string, name: string, kind: Room['kind']): Promise<Room> {
  const roomName = safePostBody(name, 120);
  if (!roomName) throw new Error('Give the room a name first.');
  const { data, error } = await db().from('rooms').insert({ owner_id: ownerId, name: roomName, kind }).select().single();
  if (error) throw error;
  return data as Room;
}

export async function profileByHandle(handle: string): Promise<Profile> {
  const normalized = handle.trim().replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
  const { data, error } = await db().from('profiles').select('*').eq('handle', normalized).single();
  if (error || !data) throw new Error('That profile could not be found or is not visible.');
  return data as Profile;
}

export async function addRoomMember(roomId: string, profileId: string, canWrite = true): Promise<RoomMember> {
  const { data, error } = await db().from('room_members').insert({ room_id: roomId, profile_id: profileId, can_write: canWrite }).select('*, profile:profiles(*)').single();
  if (error) throw error;
  return data as RoomMember;
}

export async function messages(roomId: string): Promise<Message[]> {
  const { data, error } = await db().from('messages').select('*, author:profiles(*)').eq('room_id', roomId).order('created_at').limit(200);
  if (error) throw error;
  return (data || []) as Message[];
}

export async function sendMessage(roomId: string, authorProfileId: string, input: { body?: string; ciphertext?: string }): Promise<Message> {
  const body = input.body ? safePostBody(input.body, 10000) : '';
  if (!body && !input.ciphertext) throw new Error('Write a message first.');
  const { data, error } = await db().from('messages').insert({ room_id: roomId, author_id: authorProfileId, body, ciphertext: input.ciphertext || null }).select('*, author:profiles(*)').single();
  if (error) throw error;
  return data as Message;
}

export async function notifications(ownerId: string): Promise<Notification[]> {
  const { data, error } = await db().from('notifications').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []) as Notification[];
}

export async function scheduledTasks(ownerId: string): Promise<ScheduledTask[]> {
  const { data, error } = await db().from('scheduled_tasks').select('*').eq('owner_id', ownerId).order('run_at');
  if (error) throw error;
  return (data || []) as ScheduledTask[];
}

export async function exportAccountData(ownerId: string): Promise<Record<string, unknown>> {
  const profiles = await myProfiles(ownerId);
  const profileIds = profiles.map((profile) => profile.id);
  const [postsResult, roomsResult, notificationsResult, tasksResult] = await Promise.all([
    profileIds.length ? db().from('posts').select('*').in('author_id', profileIds) : Promise.resolve({ data: [], error: null }),
    db().from('rooms').select('*').eq('owner_id', ownerId),
    notifications(ownerId),
    scheduledTasks(ownerId)
  ]);
  if (postsResult.error) throw postsResult.error;
  if (roomsResult.error) throw roomsResult.error;
  return { format: 'hexiverse-account-export-v1', exportedAt: new Date().toISOString(), profiles, posts: postsResult.data || [], rooms: roomsResult.data || [], notifications: notificationsResult, scheduledTasks: tasksResult };
}

export async function deleteSocialContent(ownerId: string): Promise<void> {
  const profiles = await myProfiles(ownerId);
  const media = await db().from('media_assets').select('object_path').eq('owner_id', ownerId);
  if (media.error) throw media.error;
  if (media.data?.length) await db().storage.from('public-media').remove(media.data.map((item) => item.object_path));
  const cleanups = [
    db().from('rooms').delete().eq('owner_id', ownerId),
    db().from('media_assets').delete().eq('owner_id', ownerId),
    db().from('notifications').delete().eq('owner_id', ownerId),
    db().from('scheduled_tasks').delete().eq('owner_id', ownerId),
    db().from('connector_links').delete().eq('owner_id', ownerId),
    db().from('audit_receipts').delete().eq('owner_id', ownerId),
    db().from('reports').delete().eq('reporter_id', ownerId),
    db().from('blocks').delete().eq('owner_id', ownerId),
    db().from('profile_device_keys').delete().eq('owner_id', ownerId),
    db().from('profiles').delete().eq('owner_id', ownerId)
  ];
  for (const result of await Promise.all(cleanups)) if (result.error) throw result.error;
}

export function subscribeToRoom(roomId: string, onChange: () => void): () => void {
  const channel = db().channel(`room:${roomId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, onChange).subscribe();
  return () => { void db().removeChannel(channel); };
}
