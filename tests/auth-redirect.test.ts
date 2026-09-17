import { describe, expect, it } from 'vitest';
import { authRedirectNotice } from '../src/lib/auth-redirect';

describe('authentication redirect feedback', () => {
  it('does not show a warning when the OAuth redirect has no error', () => {
    expect(authRedirectNotice('', '#feed')).toBe('');
  });

  it('explains signup velocity blocks in plain language', () => {
    expect(authRedirectNotice('?error=server_error&error_description=Too%20many%20new%20accounts%20were%20created%20from%20this%20network', '#'))
      .toContain('Please try again later');
  });

  it('explains hook outages without exposing server details', () => {
    expect(authRedirectNotice('', '#error=server_error&error_description=Signup%20protection%20is%20temporarily%20unavailable%3A%20secret%20detail'))
      .toBe('Account creation is temporarily unavailable. Please try again in a few minutes.');
  });

  it('uses a safe generic notice for unknown OAuth errors', () => {
    expect(authRedirectNotice('?error=access_denied&error_description=private%20provider%20details', ''))
      .toBe('Google sign-in did not finish. Please try again. If this keeps happening, the site owner may need to check the sign-in setup.');
  });
});
