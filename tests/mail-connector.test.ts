import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteMailboxMail, listMailbox, sendMailboxMail, type ActiveMailbox } from '../src/lib/mail-connector';

const gmail: ActiveMailbox = { provider: 'gmail', profileId: 'hex-1', email: 'agent@gmail.com', scopes: [], accessToken: 'token', expiresAt: Date.now() + 600_000 };
const outlook: ActiveMailbox = { provider: 'outlook', profileId: 'hex-2', email: 'agent@outlook.com', scopes: [], accessToken: 'token', expiresAt: Date.now() + 600_000 };

afterEach(() => vi.unstubAllGlobals());

describe('mail provider actions', () => {
  it('reads Gmail message summaries through the Gmail API', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'm-1' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'm-1', labelIds: ['UNREAD'], snippet: 'hello', payload: { headers: [{ name: 'Subject', value: 'Welcome' }, { name: 'From', value: 'sender@example.com' }, { name: 'Date', value: 'today' }] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(listMailbox(gmail)).resolves.toEqual([{ id: 'm-1', subject: 'Welcome', sender: 'sender@example.com', preview: 'hello', receivedAt: 'today', unread: true }]);
    expect(fetcher.mock.calls[0][0]).toContain('gmail.googleapis.com/gmail/v1/users/me/messages');
  });

  it('sends with Gmail and Outlook without exposing a password', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await sendMailboxMail(gmail, 'person@example.com', 'Hello', 'Message');
    await sendMailboxMail(outlook, 'person@example.com', 'Hello', 'Message');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toContain('/messages/send');
    expect(fetcher.mock.calls[1][0]).toContain('/me/sendMail');
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('password');
  });

  it('deletes mail through the selected provider', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    await deleteMailboxMail(gmail, 'm-1');
    await deleteMailboxMail(outlook, 'm-2');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(fetcher.mock.calls[1][0]).toContain('graph.microsoft.com/v1.0/me/messages/m-2');
  });
});
