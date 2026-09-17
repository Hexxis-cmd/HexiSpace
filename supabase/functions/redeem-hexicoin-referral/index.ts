import { withSupabase } from 'npm:@supabase/server@^1';
import { keyedReferralDigest, normalizeReferralCode, trustedReferralClientIp } from '../../../src/lib/referral-risk.ts';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new Error('Request body is too large.');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

export default {
  fetch: withSupabase({ auth: 'user', errors: { detailed: false } }, async (request, context) => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Send a JSON referral request.' }, 415);
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (!Number.isFinite(contentLength) || contentLength > 2048) return json({ error: 'Referral request is too large.' }, 413);
    const ownerId = context.userClaims?.id;
    if (!ownerId) return json({ error: 'Sign in to redeem a referral.' }, 401);

    let payload: { code?: unknown; installToken?: unknown };
    try { payload = await readJsonBody(request) as { code?: unknown; installToken?: unknown }; } catch { return json({ error: 'Invalid referral request.' }, 400); }
    if (typeof payload.code !== 'string' || typeof payload.installToken !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.installToken)
      || !/^[A-F0-9]{16}$/.test(normalizeReferralCode(payload.code))) {
      return json({ error: 'Enter a valid referral code.' }, 400);
    }

    // Only the Cloudflare edge-provided single IP is trusted. The HMAC digest,
    // never the raw address, is sent to the database.
    const clientIp = trustedReferralClientIp(request.headers);
    if (!clientIp) return json({ error: 'Referral checks are temporarily unavailable.' }, 503);
    const hmacSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEYS') || '';
    if (!hmacSecret) return json({ error: 'Referral checks are temporarily unavailable.' }, 503);

    try {
      const [ipDigest, deviceDigest] = await Promise.all([
        keyedReferralDigest(hmacSecret, 'ip', clientIp),
        keyedReferralDigest(hmacSecret, 'device', payload.installToken)
      ]);
      const { data, error } = await context.supabaseAdmin.rpc('submit_hexicoin_referral', {
        p_owner: ownerId,
        p_code: payload.code,
        p_ip_digest: ipDigest,
        p_device_digest: deviceDigest
      });
      if (error) {
        // Do not log request bodies, tokens, IPs, codes, or Supabase internals.
        return json({ error: 'The referral check could not be completed.' }, 503);
      }
      return json(data);
    } catch {
      return json({ error: 'The referral check could not be completed.' }, 503);
    }
  })
};
