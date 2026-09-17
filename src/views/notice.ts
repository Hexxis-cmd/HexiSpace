export function noticeMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') return value.message;
  return 'Something went wrong.';
}
