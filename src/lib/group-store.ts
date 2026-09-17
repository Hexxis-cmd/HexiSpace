import { getSupabase } from './supabase';
import { safePostBody } from './policy';
import { oneRelation, PUBLIC_GROUP_FIELDS, PUBLIC_PROFILE_FIELDS } from './public-projections';
import { myProfiles } from './social-store';
import type { Group, GroupMember, GroupVisibility, Profile } from './types';

const db = () => getSupabase();
type GroupMemberRow = Omit<GroupMember, 'profile'> & { profile?: Profile | Profile[] | null };

export async function myGroups(ownerId: string): Promise<Group[]> {
  const { data, error } = await db().from('groups').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Group[];
}

export async function discoverGroups(query = ''): Promise<Group[]> {
  const term = query.trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80);
  let request = db().from('groups').select(PUBLIC_GROUP_FIELDS).in('visibility', ['public', 'approval']).order('created_at', { ascending: false }).limit(40);
  if (term) request = request.or(`name.ilike.%${term}%,handle.ilike.%${term}%`);
  const { data, error } = await request;
  if (error) throw error;
  return (data || []) as Group[];
}

export async function createGroup(ownerId: string, input: { name: string; handle: string; description: string; rules: string; visibility: GroupVisibility }): Promise<Group> {
  const name = safePostBody(input.name, 100);
  const handle = input.handle.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30).toLowerCase();
  const description = safePostBody(input.description, 2000);
  const rules = safePostBody(input.rules, 4000);
  if (!name || handle.length < 2) throw new Error('Add a group name and a simple handle first.');
  const human = (await myProfiles(ownerId)).find((profile) => profile.kind === 'human');
  if (!human) throw new Error('Create your human profile before creating a group.');
  const { data, error } = await db().from('groups').insert({ owner_id: ownerId, name, handle, description, rules, visibility: input.visibility }).select().single();
  if (error) throw error;
  const group = data as Group;
  const member = await db().from('group_members').insert({ group_id: group.id, profile_id: human.id, role: 'owner', status: 'active', can_post: true });
  if (member.error) throw member.error;
  return group;
}

export async function joinGroup(groupId: string, profileId: string): Promise<GroupMember> {
  const { data, error } = await db().rpc('join_hexiverse_group', { target_group_id: groupId, joining_profile_id: profileId });
  if (error) throw error;
  return data as GroupMember;
}

export async function groupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await db().from('group_members').select(`*, profile:profiles(${PUBLIC_PROFILE_FIELDS})`).eq('group_id', groupId).order('created_at');
  if (error) throw error;
  return ((data || []) as unknown as GroupMemberRow[]).map((member) => {
    const profile = oneRelation<Profile>(member.profile);
    const { profile: _rawProfile, ...fields } = member;
    return { ...fields, ...(profile ? { profile } : {}) };
  });
}

export async function moderateGroupMember(groupId: string, profileId: string, status: GroupMember['status']): Promise<GroupMember> {
  const { data, error } = await db().rpc('moderate_hexiverse_group_member', { target_group_id: groupId, target_profile_id: profileId, next_status: status });
  if (error) throw error;
  return data as GroupMember;
}

export async function setGroupRole(groupId: string, profileId: string, role: Exclude<GroupMember['role'], 'owner'>): Promise<GroupMember> {
  const { data, error } = await db().rpc('set_hexiverse_group_role', { target_group_id: groupId, target_profile_id: profileId, new_role: role });
  if (error) throw error;
  return data as GroupMember;
}

export async function updateGroup(ownerId: string, groupId: string, input: Pick<Group, 'description' | 'rules' | 'visibility'>): Promise<Group> {
  const description = safePostBody(input.description, 2000);
  const rules = safePostBody(input.rules, 4000);
  const { data, error } = await db().from('groups').update({ description, rules, visibility: input.visibility }).eq('id', groupId).eq('owner_id', ownerId).select().single();
  if (error) throw error;
  return data as Group;
}
