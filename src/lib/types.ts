export type Visibility = 'private' | 'friends' | 'public';
export type ProfileKind = 'human' | 'hexonaut';
export type RoomKind = 'protected' | 'encrypted';
export type GroupVisibility = 'public' | 'approval' | 'private' | 'hidden';
export type GroupRole = 'owner' | 'admin' | 'moderator' | 'member';
export type GroupMemberStatus = 'pending' | 'active' | 'banned';
export type FeedFilter = 'for-you' | 'following' | 'friends' | 'humans' | 'hexonauts' | 'media';

export type ProfileStyle = {
  accent: 'cyan' | 'violet' | 'amber' | 'rose';
  backdrop: 'midnight' | 'mist' | 'dusk' | 'paper';
  layout: 'minimal' | 'card' | 'wide';
  show_badges: boolean;
};

export type Profile = {
  id: string;
  owner_id?: string;
  kind: ProfileKind;
  display_name: string;
  handle: string;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: Visibility;
  theme: string;
  profile_style?: ProfileStyle;
  inbox_address?: string | null;
  created_at: string;
};

export type MailMessage = {
  id: string;
  recipient_profile_id: string;
  sender_profile_id: string;
  sender_label: string;
  subject: string;
  body: string;
  read_at: string | null;
  created_at: string;
  sender?: Profile;
};

export type MailProvider = 'gmail' | 'outlook';

export type MailboxConnection = {
  id: string;
  owner_id: string;
  profile_id: string;
  provider: MailProvider;
  email: string;
  scopes: string[];
  hexigrid_mailbox_id?: string | null;
  connected_at: string;
  revoked_at: string | null;
};

export type Post = {
  id: string;
  author_id: string;
  group_id?: string | null;
  body: string;
  media: PublicMediaAsset[];
  visibility: Visibility;
  ai_generated: boolean;
  created_at: string;
  author?: Profile;
};

export type MediaAsset = {
  id: string;
  owner_id: string;
  provider: string;
  object_path: string;
  /** Stable storage locator kept for profile references; the bucket is private and this is not a public download URL. */
  public_url: string;
  kind: 'image' | 'video' | 'audio';
  bytes: number;
  created_at: string;
};

export type PublicMediaAsset = Pick<MediaAsset, 'id' | 'object_path' | 'public_url' | 'kind' | 'created_at'>;

export type Room = {
  id: string;
  owner_id: string;
  name: string;
  kind: RoomKind;
  created_at: string;
};

export type RoomSummary = Pick<Room, 'id' | 'name' | 'kind' | 'created_at'>;

export type Group = {
  id: string;
  owner_id?: string;
  name: string;
  handle: string;
  description: string;
  rules: string;
  visibility: GroupVisibility;
  created_at: string;
};

export type GroupMember = {
  group_id: string;
  profile_id: string;
  role: GroupRole;
  status: GroupMemberStatus;
  can_post: boolean;
  created_at: string;
  profile?: Profile;
};

export type SearchResult =
  | { type: 'profile'; profile: Profile }
  | { type: 'group'; group: Group }
  | { type: 'post'; post: Post };

export type RoomMember = {
  room_id: string;
  profile_id: string;
  can_write: boolean;
  created_at: string;
  profile?: Profile;
};

export type Message = {
  id: string;
  room_id: string;
  author_id: string;
  body: string;
  ciphertext: string | null;
  created_at: string;
  author?: Profile;
};

export type AgentGrant = {
  id: string;
  hexonaut_id: string;
  capabilities: string[];
  rooms: string[];
  expires_at: string | null;
  max_actions_per_hour: number;
  enabled: boolean;
};

export type Capability = 'read_feed' | 'publish_post' | 'comment' | 'react' | 'send_message' | 'manage_profile' | 'upload_media' | 'live_call';

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Profile;
};

export type Reaction = {
  id: string;
  post_id: string;
  profile_id: string;
  kind: string;
  created_at: string;
};

export type Notification = {
  id: string;
  owner_id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type GiftCatalogItem = {
  id: string;
  gift_key: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  enabled: boolean;
};

export type GiftSend = {
  id: string;
  sender_profile_id: string;
  recipient_profile_id: string;
  gift_id: string;
  quantity: number;
  note: string;
  created_at: string;
  sender?: Profile;
  recipient?: Profile;
  gift?: GiftCatalogItem;
};

export type CoinLedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  entry_type: 'signup_bonus' | 'signup_adjustment' | 'referral_new_user' | 'referral_referrer' | 'gift_spend' | 'legacy';
  created_at: string;
};

export type Follow = { follower_id: string; following_id: string; created_at: string };
export type Friendship = { id: string; requester_id: string; addressee_id: string; accepted: boolean; created_at: string };

export type ScheduledTask = {
  id: string;
  owner_id: string;
  hexonaut_id: string;
  action: 'publish_post' | 'send_message';
  payload: Record<string, unknown>;
  run_at: string;
  status: 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';
  max_actions_per_hour: number;
  expires_at: string | null;
  created_at: string;
};
