import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

vi.mock('../src/lib/supabase', () => ({ getSupabase: vi.fn() }));

import { getSupabase } from '../src/lib/supabase';
import { checkSocialService } from '../src/lib/setup';

function setProfileReadResult(result: { data?: unknown; error: null | { code?: string; message: string } }) {
  const query = {
    select: vi.fn(),
    limit: vi.fn().mockResolvedValue(result)
  };
  query.select.mockReturnValue(query);
  vi.mocked(getSupabase).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as unknown as ReturnType<typeof getSupabase>);
  return query;
}

beforeEach(() => vi.resetAllMocks());

describe('HexiSpace social service setup check', () => {
  it('accepts a reachable schema whose safe profile query succeeds', async () => {
    const query = setProfileReadResult({ data: [], error: null });

    await expect(checkSocialService()).resolves.toEqual({ ok: true });
    expect(getSupabase).toHaveBeenCalledOnce();
    expect(query.select).toHaveBeenCalledWith('id');
    expect(query.limit).toHaveBeenCalledWith(0);
  });

  it('does not treat missing public SELECT permission as a healthy setup', async () => {
    setProfileReadResult({ data: null, error: { code: '42501', message: 'permission denied for table profiles' } });

    await expect(checkSocialService()).resolves.toEqual({
      ok: false,
      message: 'The project is connected, but its public-data security setup is incomplete.',
      detail: 'Ask the site owner to finish reviewing the database setup. Do not rerun the initial setup file on an existing project.'
    });
  });

  it('identifies an uninstalled schema separately from a permission mismatch', async () => {
    setProfileReadResult({ data: null, error: { code: '42P01', message: 'relation public.profiles does not exist' } });

    const result = await checkSocialService();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Your connection works, but the HexiSpace database setup is incomplete.');
      expect(result.detail).toContain('do not rerun the initial file');
    }
  });

  it('warns against replaying setup and offers an explicitly read-only existing-project check', async () => {
    const [main, preflight] = await Promise.all([
      readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
      readFile(new URL('../public/hexispace-production-preflight.sql', import.meta.url), 'utf8')
    ]);
    expect(main).toContain('brand-new, empty project only');
    expect(main).toContain('Do not run the full setup file on a project that already contains data');
    expect(main).toContain('/hexispace-production-preflight.sql');
    expect(preflight).toContain('READ ONLY');
    expect(preflight).not.toMatch(/\b(insert|update|delete|alter|create|drop|grant|revoke)\s+/i);
  });
});
