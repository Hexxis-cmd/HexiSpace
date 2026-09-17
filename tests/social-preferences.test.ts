import { describe, expect, it } from 'vitest';
import { visibleNotifications } from '../src/lib/social-preferences';

describe('social preferences', () => {
  it('filters only the notification categories the owner disabled', () => {
    const items = [
      { id: '1', owner_id: 'owner', kind: 'follow', title: 'Follow', body: '', read_at: null, created_at: '' },
      { id: '2', owner_id: 'owner', kind: 'comment', title: 'Comment', body: '', read_at: null, created_at: '' },
      { id: '3', owner_id: 'owner', kind: 'gift', title: 'Gift', body: '', read_at: null, created_at: '' }
    ];
    const result = visibleNotifications(items, { follows: false, friendRequests: true, comments: true, reactions: true, gifts: false });
    expect(result.map((item) => item.id)).toEqual(['2']);
  });
});
