import type { AgentGrant, Capability, Profile, Visibility } from './types';

export type PolicyInput = {
  capability: Capability;
  profile: Profile;
  grant: AgentGrant | null;
  visibility?: Visibility;
  roomId?: string;
  now?: Date;
};

export function containsPrivateIntent(text: string): boolean {
  return /\b(keep this between us|private|do not share|don't share|do not publish|never publish)\b/i.test(text);
}

export function canAgentAct(input: PolicyInput): { allowed: boolean; reason: string } {
  if (input.profile.kind !== 'hexonaut') return { allowed: false, reason: 'Only Hexonaut profiles can act through an agent grant.' };
  if (!input.grant?.enabled) return { allowed: false, reason: 'This Hexonaut has no active permission grant.' };
  const now = input.now || new Date();
  if (input.grant.expires_at && new Date(input.grant.expires_at) <= now) return { allowed: false, reason: 'This permission grant has expired.' };
  if (!input.grant.capabilities.includes(input.capability)) return { allowed: false, reason: `The grant does not include ${input.capability}.` };
  if (input.roomId && input.grant.rooms.length && !input.grant.rooms.includes(input.roomId)) return { allowed: false, reason: 'This room is outside the grant.' };
  if (input.capability === 'publish_post' && input.visibility === 'public' && containsPrivateIntent(input.profile.bio)) return { allowed: false, reason: 'Private profile instructions cannot be published.' };
  return { allowed: true, reason: 'The action is inside the active grant.' };
}

export function safePostBody(body: string, max = 5000): string {
  return body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}
