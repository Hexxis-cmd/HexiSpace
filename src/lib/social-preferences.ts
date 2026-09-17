import type { Notification } from './types';

export type NotificationPreferences = {
  follows: boolean;
  friendRequests: boolean;
  comments: boolean;
  reactions: boolean;
  gifts: boolean;
};

const defaults: NotificationPreferences = { follows: true, friendRequests: true, comments: true, reactions: true, gifts: true };
const key = (ownerId: string) => `hexiverse.preferences.v1.${ownerId}`;
const read = <T>(storageKey: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed as T : fallback;
    return parsed && typeof parsed === 'object' ? { ...fallback as object, ...parsed as object } as T : fallback;
  }
  catch { return fallback; }
};
const write = (storageKey: string, value: unknown): void => { try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Preferences remain session-only when storage is unavailable. */ } };

export function getNotificationPreferences(ownerId: string): NotificationPreferences {
  return read(`${key(ownerId)}.notifications`, defaults);
}

export function saveNotificationPreferences(ownerId: string, preferences: NotificationPreferences): void {
  write(`${key(ownerId)}.notifications`, preferences);
}

export function getMutedProfiles(ownerId: string): string[] {
  return read(`${key(ownerId)}.muted`, [] as string[]);
}

export function setProfileMuted(ownerId: string, profileId: string, muted: boolean): string[] {
  const current = new Set(getMutedProfiles(ownerId));
  if (muted) current.add(profileId); else current.delete(profileId);
  const result = [...current];
  write(`${key(ownerId)}.muted`, result);
  return result;
}

function enabledFor(kind: string, preferences: NotificationPreferences): boolean {
  const normalized = kind.replace(/[_-]/g, '').toLowerCase();
  if (normalized.includes('follow')) return preferences.follows;
  if (normalized.includes('friend')) return preferences.friendRequests;
  if (normalized.includes('comment')) return preferences.comments;
  if (normalized.includes('reaction')) return preferences.reactions;
  if (normalized.includes('gift')) return preferences.gifts;
  return true;
}

export function visibleNotifications(items: Notification[], preferences: NotificationPreferences): Notification[] {
  return items.filter((item) => enabledFor(item.kind, preferences));
}
