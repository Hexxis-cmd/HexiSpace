import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

vi.mock('../src/lib/supabase', () => ({ getSupabase: vi.fn() }));

import { getSupabase } from '../src/lib/supabase';
import { createMediaPrivacyReadinessCheck } from '../src/lib/media-readiness';
import { uploadMedia } from '../src/lib/media';

afterEach(() => vi.resetAllMocks());

describe('media privacy readiness', () => {
  it('requires an explicit server-side true and refreshes the short cache', async () => {
    let time = 100;
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const check = createMediaPrivacyReadinessCheck(rpc, () => time, 1_000);

    await expect(check()).resolves.toBe(true);
    time = 1_099;
    await expect(check()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);

    time = 1_100;
    await expect(check()).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the readiness function is missing or errors', async () => {
    const missing = createMediaPrivacyReadinessCheck(async () => ({ data: null, error: new Error('RPC missing') }));
    const offline = createMediaPrivacyReadinessCheck(async () => { throw new Error('offline'); });

    await expect(missing()).resolves.toBe(false);
    await expect(offline()).resolves.toBe(false);
  });

  it('does not upload media if the server privacy check is unavailable', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('function not found') });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabase>);
    const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], { type: 'image/png' }) as File;
    Object.defineProperty(file, 'name', { value: 'test.png' });

    await expect(uploadMedia(file, '12345678-1234-4abc-8def-1234567890ab'))
      .rejects.toThrow('Media uploads are paused until privacy protection is ready.');
    expect(rpc).toHaveBeenCalledWith('hexispace_media_security_ready');
  });

  it('defines readiness from the private bucket and visibility-safe policies', async () => {
    const migration = await readFile(new URL('../supabase/migrations/017_private_media_access.sql', import.meta.url), 'utf8');
    const functionBody = migration.split('create or replace function public.hexispace_media_security_ready()')[1] || '';

    expect(functionBody).toContain("bucket.id = 'public-media' and bucket.public = false");
    expect(functionBody).toContain("policy.policyname = 'media_object_read_visible'");
    expect(functionBody).toContain("policy.policyname = 'media_assets_read_visible'");
    expect(functionBody).toContain("position('follows' in lower(coalesce(policy.qual, ''))) = 0");
  });
});
