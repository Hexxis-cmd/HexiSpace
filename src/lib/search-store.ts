import { getSupabase } from './supabase';
import type { Group, Post, Profile, SearchResult } from './types';
import { PUBLIC_GROUP_FIELDS, PUBLIC_POST_WITH_AUTHOR, PUBLIC_PROFILE_FIELDS } from './public-projections';

const db = () => getSupabase();

export async function searchEverything(query: string): Promise<SearchResult[]> {
  const term = query.trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80);
  if (!term) return [];
  const like = `%${term}%`;
  const [profiles, groups, posts] = await Promise.all([
    db().from('profiles').select(PUBLIC_PROFILE_FIELDS).eq('visibility', 'public').or(`display_name.ilike.${like},handle.ilike.${like}`).limit(20),
    db().from('groups').select(PUBLIC_GROUP_FIELDS).in('visibility', ['public', 'approval']).or(`name.ilike.${like},handle.ilike.${like}`).limit(20),
    db().from('posts').select(PUBLIC_POST_WITH_AUTHOR).eq('visibility', 'public').ilike('body', like).order('created_at', { ascending: false }).limit(20)
  ]);
  for (const result of [profiles, groups, posts]) if (result.error) throw result.error;
  return [
    ...((profiles.data || []) as unknown as Profile[]).map((profile) => ({ type: 'profile' as const, profile })),
    ...((groups.data || []) as unknown as Group[]).map((group) => ({ type: 'group' as const, group })),
    ...((posts.data || []) as unknown as Post[]).map((post) => ({ type: 'post' as const, post: { ...post, media: [] } }))
  ];
}
