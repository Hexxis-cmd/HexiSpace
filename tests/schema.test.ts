import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const migrations = `${readFileSync(resolve(root, 'supabase/migrations/001_hexiverse_social.sql'), 'utf8')}\n${readFileSync(resolve(root, 'supabase/migrations/002_social_features.sql'), 'utf8')}\n${readFileSync(resolve(root, 'supabase/migrations/003_notifications_and_feed.sql'), 'utf8')}`;

describe('HexiVerse data boundary', () => {
  it('enables RLS for every user-data table', () => {
    for (const table of ['profiles', 'ownership_links', 'posts', 'media_assets', 'rooms', 'room_members', 'messages', 'encrypted_room_keys', 'agent_grants', 'connector_links', 'audit_receipts', 'reports', 'blocks', 'comments', 'reactions', 'notifications', 'scheduled_tasks', 'profile_device_keys']) {
      expect(migrations).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('does not put service-role credentials in the frontend schema', () => {
    expect(migrations).not.toMatch(/service[_-]?role|secret[_-]?key/i);
    expect(migrations).toContain('references auth.users(id)');
  });
});
