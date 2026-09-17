/** Public, anonymous-safe PostgREST projections. Keep in sync with migration 016. */
export const PUBLIC_PROFILE_FIELDS = 'id,kind,display_name,handle,bio,avatar_url,banner_url,visibility,theme,profile_style,created_at';
export const PUBLIC_POST_FIELDS = 'id,author_id,group_id,body,visibility,ai_generated,media_ids,created_at';
export const PUBLIC_MEDIA_FIELDS = 'id,object_path,public_url,kind,created_at';
export const PUBLIC_GROUP_FIELDS = 'id,name,handle,description,rules,visibility,created_at';
export const PUBLIC_POST_WITH_AUTHOR = `${PUBLIC_POST_FIELDS},author:profiles(${PUBLIC_PROFILE_FIELDS})`;
export const PUBLIC_COMMENT_WITH_AUTHOR = `id,post_id,author_id,body,created_at,author:profiles(${PUBLIC_PROFILE_FIELDS})`;
export const PUBLIC_MESSAGE_WITH_AUTHOR = `id,room_id,author_id,body,ciphertext,created_at,author:profiles(${PUBLIC_PROFILE_FIELDS})`;
export const PUBLIC_ROOM_MEMBER_WITH_PROFILE = `room_id,profile_id,can_write,created_at,profile:profiles(${PUBLIC_PROFILE_FIELDS})`;
export const PUBLIC_MAIL_WITH_SENDER = `id,recipient_profile_id,sender_profile_id,sender_label,subject,body,read_at,created_at,sender:profiles!hexonaut_mail_sender_profile_id_fkey(${PUBLIC_PROFILE_FIELDS})`;

/** PostgREST emits to-one relations as objects; without generated DB types its TS inference can call them arrays. */
export function oneRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0] as T | undefined;
  return value ?? undefined;
}
