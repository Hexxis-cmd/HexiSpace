import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ getConfig: vi.fn(), getSupabase: vi.fn() }));

import { getConfig, getSupabase } from '../src/lib/supabase';
import { hydratePrivateMedia } from '../src/lib/private-media';

class FakeImageElement {
  dataset: Record<string, string> = {
    privateMediaUrl: 'https://project.example/storage/v1/object/public/public-media/12345678-1234-4abc-8def-1234567890ab/photo.png',
  };
  hidden = false;
  isConnected = true;
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('private media readiness gate', () => {
  it('hides project media without creating a signed URL when the server is not ready', async () => {
    vi.stubGlobal('HTMLImageElement', FakeImageElement);
    vi.mocked(getConfig).mockReturnValue({ supabaseUrl: 'https://project.example' } as ReturnType<typeof getConfig>);
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc, storage: { from } } as unknown as ReturnType<typeof getSupabase>);
    const image = new FakeImageElement();
    const root = { querySelectorAll: () => [image] } as unknown as ParentNode;

    await hydratePrivateMedia(root);

    expect(rpc).toHaveBeenCalledWith('hexispace_media_security_ready');
    expect(image.hidden).toBe(true);
    expect(image.dataset.privateMediaState).toBe('denied');
    expect(from).not.toHaveBeenCalled();
  });
});
