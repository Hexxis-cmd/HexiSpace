export type Visibility = 'private' | 'friends' | 'public';
export type ProfileKind = 'human' | 'hexonaut';
export type RoomKind = 'protected' | 'encrypted';

export type Profile = {
  id: string;
  owner_id: string;
  kind: ProfileKind;
  display_name: string;
  handle: string;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: Visibility;
  theme: string;
  created_at: string;
};

export type Post = {
  id: string;
  author_id: string;
  body: string;
  media: MediaAsset[];
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
  public_url: string;
  kind: 'image' | 'video' | 'audio';
  bytes: number;
  created_at: string;
};

export type Room = {
  id: string;
  owner_id: string;
  name: string;
  kind: RoomKind;
  created_at: string;
};

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
