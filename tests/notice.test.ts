import { describe, expect, it } from 'vitest';
import { noticeMessage } from '../src/views/notice';

describe('notice messages', () => {
  it('keeps clear user-facing text', () => {
    expect(noticeMessage('Connect online before creating anything.')).toBe('Connect online before creating anything.');
  });

  it('uses an error message when one is available', () => {
    expect(noticeMessage(new Error('The connection is unavailable.'))).toBe('The connection is unavailable.');
  });

  it('uses a safe fallback for unknown values', () => {
    expect(noticeMessage({ detail: 'private' })).toBe('Something went wrong.');
  });
});
