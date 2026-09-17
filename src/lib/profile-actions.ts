import { getSupabase } from './supabase';
import { safePostBody } from './policy';
import { PUBLIC_PROFILE_FIELDS } from './public-projections';
import type { Profile, ProfileStyle } from './types';

const db = () => getSupabase();

export async function updateProfile(ownerId: string, profileId: string, input: Pick<Profile, 'display_name' | 'bio' | 'visibility' | 'theme'> & { avatar_url?: string | null; banner_url?: string | null; profile_style?: ProfileStyle }): Promise<Profile> {
  const displayName = safePostBody(input.display_name, 80);
  const bio = safePostBody(input.bio, 2000);
  if (!displayName) throw new Error('Add a profile name first.');
  const { data, error } = await db().from('profiles').update({ display_name: displayName, bio, visibility: input.visibility, theme: input.theme, ...(input.avatar_url === undefined ? {} : { avatar_url: input.avatar_url }), ...(input.banner_url === undefined ? {} : { banner_url: input.banner_url }), ...(input.profile_style === undefined ? {} : { profile_style: input.profile_style }) }).eq('id', profileId).select(PUBLIC_PROFILE_FIELDS).single();
  if (error) throw error;
  return { ...(data as Profile), owner_id: ownerId };
}

export async function blockProfile(ownerId: string, profileId: string): Promise<void> {
  if (!profileId) throw new Error('Choose a profile first.');
  const { error } = await db().from('blocks').upsert({ owner_id: ownerId, blocked_profile_id: profileId });
  if (error) throw error;
}

export async function unblockProfile(ownerId: string, profileId: string): Promise<void> {
  const { error } = await db().from('blocks').delete().eq('owner_id', ownerId).eq('blocked_profile_id', profileId);
  if (error) throw error;
}

export type ReportTargetType = 'profile' | 'post' | 'message' | 'room' | 'media';

export async function reportContent(reporterId: string, targetType: ReportTargetType, targetId: string, reason: string): Promise<void> {
  if (!targetId) throw new Error('Choose something to report first.');
  const cleanReason = safePostBody(reason, 1000);
  if (!cleanReason) throw new Error('Tell us what happened before sending the report.');
  const { error } = await db().from('reports').insert({ reporter_id: reporterId, target_type: targetType, target_id: targetId, reason: cleanReason });
  if (error) throw error;
}

export async function reportProfile(reporterId: string, profileId: string, reason: string): Promise<void> {
  return reportContent(reporterId, 'profile', profileId, reason);
}
