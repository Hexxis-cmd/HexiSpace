import { getSupabase } from './supabase';

const READINESS_CACHE_MS = 10_000;

export interface MediaPrivacyReadinessResponse {
  data: unknown;
  error: unknown;
}

type ReadinessRpc = () => Promise<MediaPrivacyReadinessResponse>;

/** Creates a short-lived, fail-closed check that can be tested without a backend account. */
export function createMediaPrivacyReadinessCheck(
  rpc: ReadinessRpc,
  now: () => number = Date.now,
  cacheDurationMs = READINESS_CACHE_MS,
): () => Promise<boolean> {
  let cached: boolean | undefined;
  let expiresAt = 0;

  return async () => {
    const currentTime = now();
    if (cached !== undefined && currentTime < expiresAt) return cached;

    let ready = false;
    try {
      const result = await rpc();
      ready = result.error == null && result.data === true;
    } catch {
      ready = false;
    }

    cached = ready;
    expiresAt = currentTime + Math.max(0, cacheDurationMs);
    return ready;
  };
}

const checkMediaPrivacy = createMediaPrivacyReadinessCheck(async () =>
  await getSupabase().rpc('hexispace_media_security_ready'),
);

export function isMediaPrivacyReady(): Promise<boolean> {
  return checkMediaPrivacy();
}

export async function requireMediaPrivacyReady(): Promise<void> {
  if (!(await isMediaPrivacyReady())) {
    throw new Error('Media uploads are paused until privacy protection is ready. Try again later.');
  }
}
