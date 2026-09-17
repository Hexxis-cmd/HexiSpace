export function authRedirectNotice(search: string, hash: string): string {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const code = query.get('error_code') || fragment.get('error_code') || query.get('error') || fragment.get('error');
  if (!code) return '';

  const description = (query.get('error_description') || fragment.get('error_description') || '').toLowerCase();
  if (description.includes('too many new accounts were created from this network')) {
    return 'Too many new accounts were just created from this network. Please try again later. If this does not seem right, contact the site owner.';
  }
  if (description.includes('signup protection is temporarily unavailable')) {
    return 'Account creation is temporarily unavailable. Please try again in a few minutes.';
  }
  return 'Google sign-in did not finish. Please try again. If this keeps happening, the site owner may need to check the sign-in setup.';
}
