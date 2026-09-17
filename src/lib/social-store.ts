import { getSupabase } from './supabase';
import { safePostBody } from './policy';
import { oneRelation, PUBLIC_MEDIA_FIELDS, PUBLIC_PROFILE_FIELDS, PUBLIC_POST_WITH_AUTHOR, PUBLIC_COMMENT_WITH_AUTHOR, PUBLIC_MESSAGE_WITH_AUTHOR, PUBLIC_ROOM_MEMBER_WITH_PROFILE, PUBLIC_MAIL_WITH_SENDER } from './public-projections';
import type { Comment, FeedFilter, Friendship, Follow, MailMessage, Message, Notification, Post, Profile, Room, RoomMember, RoomSummary, ScheduledTask, Visibility } from './types';

const db = () => getSupabase();

type PostRow = Omit<Post, 'media' | 'author'> & {
  media_ids?: string[];
  author?: Profile | Profile[] | null;
};

function normalizePost(row: PostRow, media: Post['media'] = []): Post {
  const { media_ids: _mediaIds, author, ...post } = row;
  const authorProfile = oneRelation<Profile>(author);
  return { ...post, media, ...(authorProfile ? { author: authorProfile } : {}) };
}

type CommentRow = Omit<Comment, 'author'> & { author?: Profile | Profile[] | null };
type MessageRow = Omit<Message, 'author'> & { author?: Profile | Profile[] | null };
type MailRow = Omit<MailMessage, 'sender'> & { sender?: Profile | Profile[] | null };
type RoomMemberRow = Omit<RoomMember, 'profile'> & { profile?: Profile | Profile[] | null };

export async function myProfiles(ownerId: string): Promise<Profile[]> {
  const { data, error } = await db().rpc('my_profiles');
  if (error) throw error;
  return ((data || []) as Omit<Profile, 'owner_id'>[]).map((profile) => ({ ...profile, owner_id: ownerId }));
}

export async function createProfile(ownerId: string, input: Pick<Profile, 'kind' | 'display_name' | 'handle' | 'visibility'>): Promise<Profile> {
  const displayName = safePostBody(input.display_name, 80);
  const handle = input.handle.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
  if (!displayName || !handle) throw new Error('Add a name and a simple handle first.');
  if (input.kind === 'hexonaut') {
    if (!(await myProfiles(ownerId)).some((profile) => profile.kind === 'human')) throw new Error('Create your human profile first. It owns Hexonaut profiles.');
  }
  const { data, error } = await db().from('profiles').insert({ owner_id: ownerId, kind: input.kind, display_name: displayName, handle, visibility: input.visibility, bio: '', theme: 'hestia' }).select(PUBLIC_PROFILE_FIELDS).single();
  if (error) throw error;
  return { ...(data as Profile), owner_id: ownerId };
}

export async function feed(ownerId: string, filter: FeedFilter = 'for-you', groupId?: string): Promise<Post[]> {
  const ownProfiles = await myProfiles(ownerId);
  const ownIds = ownProfiles.map((profile) => profile.id);
  let authorIds: string[] = [];
  if (filter === 'following' && ownIds.length) {
    const { data, error } = await db().from('follows').select('following_id').in('follower_id', ownIds);
    if (error) throw error;
    authorIds = (data || []).map((row) => row.following_id);
  }
  if (filter === 'friends' && ownIds.length) {
    const { data, error } = await db().from('friendships').select('requester_id, addressee_id').eq('accepted', true).limit(500);
    if (error) throw error;
    authorIds = (data || []).flatMap((row) => ownIds.includes(row.requester_id) ? [row.addressee_id] : ownIds.includes(row.addressee_id) ? [row.requester_id] : []).filter((id, index, ids) => ids.indexOf(id) === index);
  }
  if ((filter === 'following' || filter === 'friends') && !authorIds.length) return [];
  if (filter === 'humans' || filter === 'hexonauts') {
    const { data, error } = await db().from('profiles').select('id').eq('kind', filter === 'humans' ? 'human' : 'hexonaut').limit(500);
    if (error) throw error;
    authorIds = (data || []).map((row) => row.id);
    if (!authorIds.length) return [];
  }
  let request = db().from('posts').select(PUBLIC_POST_WITH_AUTHOR).order('created_at', { ascending: false }).limit(120);
  if (groupId) request = request.eq('group_id', groupId);
  if (authorIds.length) request = request.in('author_id', authorIds);
  const { data, error } = await request;
  if (error) throw error;
  const posts = (data || []) as unknown as PostRow[];
  const ids = [...new Set(posts.flatMap((post) => post.media_ids || []))];
  if (!ids.length) return posts.map((post) => normalizePost(post));
  const { data: media, error: mediaError } = await db().from('media_assets').select('*').in('id', ids);
  if (mediaError) throw mediaError;
  const byId = new Map((media || []).map((item) => [item.id, item]));
  const withMedia = posts.map((post) => normalizePost(post,
    (post.media_ids || []).map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item))));
  return filter === 'media' ? withMedia.filter((post) => post.media.length > 0) : withMedia;
}

/** Read-only public feed for visitors who have not signed in. */
export async function publicFeed(offset = 0, limit = 120): Promise<Post[]> {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(120, Math.floor(limit)));
  const { data, error } = await db().from('posts').select(PUBLIC_POST_WITH_AUTHOR).eq('visibility', 'public').order('created_at', { ascending: false }).order('id', { ascending: false }).range(safeOffset, safeOffset + safeLimit - 1);
  if (error) throw error;
  const posts = (data || []) as unknown as PostRow[];
  const ids = [...new Set(posts.flatMap((post) => post.media_ids || []))];
  if (!ids.length) return posts.map((post) => normalizePost(post));
  const { data: media, error: mediaError } = await db().from('media_assets').select(PUBLIC_MEDIA_FIELDS).in('id', ids);
  if (mediaError) throw mediaError;
  const byId = new Map((media || []).map((item) => [item.id, item]));
  return posts.map((post) => normalizePost(post,
    (post.media_ids || []).map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item))));
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

export async function createPost(authorId: string, body: string, visibility: Visibility, aiGenerated = false, mediaIds: string[] = [], groupId?: string | null): Promise<Post> {
  const text = safePostBody(body);
  if (!text && !mediaIds.length) throw new Error('Write something or attach media before posting.');
  const { data, error } = await db().from('posts').insert({ author_id: authorId, body: text, visibility, ai_generated: aiGenerated, media_ids: mediaIds, group_id: groupId || null }).select(PUBLIC_POST_WITH_AUTHOR).single();
  if (error) throw error;
  return normalizePost(data as unknown as PostRow);
}

export async function comments(postId: string): Promise<Comment[]> {
  const { data, error } = await db().from('comments').select(PUBLIC_COMMENT_WITH_AUTHOR).eq('post_id', postId).order('created_at').limit(100);
  if (error) throw error;
  return ((data || []) as unknown as CommentRow[]).map((comment) => {
    const author = oneRelation<Profile>(comment.author);
    const { author: _rawAuthor, ...fields } = comment;
    return { ...fields, ...(author ? { author } : {}) };
  });
}

export async function addComment(postId: string, authorId: string, body: string): Promise<Comment> {
  const text = safePostBody(body, 2000);
  if (!text) throw new Error('Write a comment first.');
  const { data, error } = await db().from('comments').insert({ post_id: postId, author_id: authorId, body: text }).select(PUBLIC_COMMENT_WITH_AUTHOR).single();
  if (error) throw error;
  const comment = data as unknown as CommentRow;
  const author = oneRelation<Profile>(comment.author);
  const { author: _rawAuthor, ...fields } = comment;
  return { ...fields, ...(author ? { author } : {}) };
}

export async function toggleReaction(postId: string, profileId: string, kind = 'like'): Promise<void> {
  const { data: existing, error: findError } = await db().from('reactions').select('id').eq('post_id', postId).eq('profile_id', profileId).eq('kind', kind).maybeSingle();
  if (findError) throw findError;
  const result = existing ? await db().from('reactions').delete().eq('id', existing.id) : await db().from('reactions').insert({ post_id: postId, profile_id: profileId, kind });
  if (result.error) throw result.error;
}

export async function rooms(): Promise<RoomSummary[]> {
  // Row-level security returns only rooms owned by this account or joined by one of its profiles.
  // Filtering by owner_id here hid invitations and incoming direct messages from the Inbox.
  const { data, error } = await db().from('rooms').select('id,name,kind,created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as RoomSummary[];
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
  const { data, error } = await db().from('profiles').select(PUBLIC_PROFILE_FIELDS).eq('handle', normalized).single();
  if (error || !data) throw new Error('That profile could not be found or is not visible.');
  return data as Profile;
}

export async function mailboxMessages(profileId: string): Promise<MailMessage[]> {
  const { data, error } = await db().from('hexonaut_mail').select(PUBLIC_MAIL_WITH_SENDER).eq('recipient_profile_id', profileId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return ((data || []) as unknown as MailRow[]).map((message) => {
    const sender = oneRelation<Profile>(message.sender);
    const { sender: _rawSender, ...fields } = message;
    return { ...fields, ...(sender ? { sender } : {}) };
  });
}

export async function sendMailboxMessage(senderProfileId: string, recipientAddress: string, subject: string, body: string): Promise<MailMessage> {
  const address = recipientAddress.trim().toLowerCase();
  const cleanSubject = safePostBody(subject, 200);
  const cleanBody = safePostBody(body, 10000);
  if (!address || !cleanBody) throw new Error('Add a recipient and a message first.');
  const { data: recipients, error: recipientError } = await db().rpc('resolve_hexonaut_inbox', { p_address: address });
  const recipient = recipients?.[0] as { profile_id: string; kind: string } | undefined;
  if (recipientError || !recipient || recipient.kind !== 'hexonaut') throw new Error('That Hexonaut inbox address was not found or is not accepting messages.');
  const { data, error } = await db().from('hexonaut_mail').insert({ recipient_profile_id: recipient.profile_id, sender_profile_id: senderProfileId, sender_label: senderProfileId, subject: cleanSubject, body: cleanBody }).select(PUBLIC_MAIL_WITH_SENDER).single();
  if (error) throw error;
  const message = data as unknown as MailRow;
  const sender = oneRelation<Profile>(message.sender);
  const { sender: _rawSender, ...fields } = message;
  return { ...fields, ...(sender ? { sender } : {}) };
}

export async function markMailboxRead(messageId: string): Promise<void> {
  const { error } = await db().from('hexonaut_mail').update({ read_at: new Date().toISOString() }).eq('id', messageId);
  if (error) throw error;
}

export async function addRoomMember(roomId: string, profileId: string, canWrite = true): Promise<RoomMember> {
  const { data, error } = await db().from('room_members').insert({ room_id: roomId, profile_id: profileId, can_write: canWrite }).select(PUBLIC_ROOM_MEMBER_WITH_PROFILE).single();
  if (error) throw error;
  const member = data as unknown as RoomMemberRow;
  const profile = oneRelation<Profile>(member.profile);
  const { profile: _rawProfile, ...fields } = member;
  return { ...fields, ...(profile ? { profile } : {}) };
}

export async function messages(roomId: string): Promise<Message[]> {
  const { data, error } = await db().from('messages').select(PUBLIC_MESSAGE_WITH_AUTHOR).eq('room_id', roomId).order('created_at').limit(200);
  if (error) throw error;
  return ((data || []) as unknown as MessageRow[]).map((message) => {
    const author = oneRelation<Profile>(message.author);
    const { author: _rawAuthor, ...fields } = message;
    return { ...fields, ...(author ? { author } : {}) };
  });
}

export async function sendMessage(roomId: string, authorProfileId: string, input: { body?: string; ciphertext?: string }): Promise<Message> {
  const body = input.body ? safePostBody(input.body, 10000) : '';
  if (!body && !input.ciphertext) throw new Error('Write a message first.');
  const { data, error } = await db().from('messages').insert({ room_id: roomId, author_id: authorProfileId, body, ciphertext: input.ciphertext || null }).select(PUBLIC_MESSAGE_WITH_AUTHOR).single();
  if (error) throw error;
  const message = data as unknown as MessageRow;
  const author = oneRelation<Profile>(message.author);
  const { author: _rawAuthor, ...fields } = message;
  return { ...fields, ...(author ? { author } : {}) };
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
    db().from('mailbox_connections').delete().eq('owner_id', ownerId),
    db().from('connector_links').delete().eq('owner_id', ownerId),
    db().from('audit_receipts').delete().eq('owner_id', ownerId),
    db().from('reports').delete().eq('reporter_id', ownerId),
    db().from('blocks').delete().eq('owner_id', ownerId),
    db().from('profile_device_keys').delete().eq('owner_id', ownerId),
    profiles.length ? db().from('profiles').delete().in('id', profiles.map((profile) => profile.id)) : Promise.resolve({ error: null })
  ];
  for (const result of await Promise.all(cleanups)) if (result.error) throw result.error;
}

export function subscribeToRoom(roomId: string, onChange: () => void): () => void {
  const channel = db().channel(`room:${roomId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, onChange).subscribe();
  return () => { void db().removeChannel(channel); };
}
