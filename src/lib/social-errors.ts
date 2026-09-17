/** Convert backend failures into brief, user-safe messages without exposing SQL or provider internals. */
export function socialLoadNotice(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';

  if (/PGRST202|schema cache|could not find the function/i.test(message)) {
    return 'Social features are not connected right now. This is a setup issue on our side; you do not need to change your account.';
  }
  return 'HexiSpace could not load its social features. Check your connection and try again.';
}
