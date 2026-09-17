import { getSupabase } from './supabase';
import { myProfiles, publicFeed } from './social-store';
import type { Post } from './types';

/** Keep Explore focused on profiles the signed-in user has not connected with. */
export function excludeKnownProfiles(posts: Post[], knownProfileIds: Iterable<string>): Post[] {
  const known = new Set(knownProfileIds);
  return posts.filter((post) => !known.has(post.author_id));
}

export type DiscoveryPaging = {
  pageSize?: number;
  targetCount?: number;
  maxPages?: number;
};

/** Page through a bounded number of public results so known profiles cannot hide strangers behind the first batch. */
export async function collectStrangerPosts(
  fetchPage: (offset: number, limit: number) => Promise<Post[]>,
  knownProfileIds: Iterable<string>,
  { pageSize = 60, targetCount = 30, maxPages = 5 }: DiscoveryPaging = {}
): Promise<Post[]> {
  const safePageSize = Math.max(1, Math.min(120, Math.floor(pageSize)));
  const safeTargetCount = Math.max(1, Math.floor(targetCount));
  const safeMaxPages = Math.max(1, Math.min(8, Math.floor(maxPages)));
  const known = new Set(knownProfileIds);
  const strangers: Post[] = [];

  for (let pageIndex = 0; pageIndex < safeMaxPages; pageIndex += 1) {
    const page = await fetchPage(pageIndex * safePageSize, safePageSize);
    strangers.push(...excludeKnownProfiles(page, known));
    if (strangers.length >= safeTargetCount || page.length < safePageSize) break;
  }

  return strangers;
}

/** Public posts only; relationship filtering is a discovery preference, never an access-control boundary. */
export async function discoverPosts(ownerId?: string): Promise<Post[]> {
  if (!ownerId) return publicFeed();

  const ownedProfiles = await myProfiles(ownerId);
  const ownIds = ownedProfiles.map((profile) => profile.id);
  if (!ownIds.length) return publicFeed();

  const [follows, sentFriendships, receivedFriendships] = await Promise.all([
    getSupabase().from('follows').select('following_id').in('follower_id', ownIds),
    getSupabase().from('friendships').select('requester_id, addressee_id').eq('accepted', true).in('requester_id', ownIds),
    getSupabase().from('friendships').select('requester_id, addressee_id').eq('accepted', true).in('addressee_id', ownIds)
  ]);
  if (follows.error) throw follows.error;
  if (sentFriendships.error) throw sentFriendships.error;
  if (receivedFriendships.error) throw receivedFriendships.error;

  const knownIds = new Set(ownIds);
  for (const row of follows.data || []) knownIds.add(row.following_id);
  for (const friendship of sentFriendships.data || []) knownIds.add(friendship.addressee_id);
  for (const friendship of receivedFriendships.data || []) knownIds.add(friendship.requester_id);
  return collectStrangerPosts((offset, limit) => publicFeed(offset, limit), knownIds);
}
