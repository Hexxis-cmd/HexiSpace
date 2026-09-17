import { getConfig } from './supabase';
import type { MailProvider } from './types';

type PendingOAuth = { provider: MailProvider; profileId: string; state: string; verifier: string; redirectUri: string };
type TokenResponse = { access_token: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };
export type ActiveMailbox = { provider: MailProvider; profileId: string; email: string; scopes: string[]; accessToken: string; refreshToken?: string; expiresAt: number; clientId?: string; hexigridMailboxId?: string };
export type MailItem = { id: string; subject: string; sender: string; preview: string; receivedAt: string; unread: boolean };

const pendingKey = 'hexiverse-mail-oauth-pending-v1';
const active = new Map<string, ActiveMailbox>();
const googleScopes = ['openid', 'email', 'https://mail.google.com/'];
const outlookScopes = ['openid', 'email', 'profile', 'offline_access', 'https://graph.microsoft.com/Mail.ReadWrite', 'https://graph.microsoft.com/Mail.Send'];

function providerClientId(provider: MailProvider): string {
  const config = getConfig();
  return provider === 'gmail' ? config.googleMailClientId : config.microsoftMailClientId;
}

function providerName(provider: MailProvider): string { return provider === 'gmail' ? 'Gmail' : 'Outlook'; }

function storage(): Storage {
  if (typeof sessionStorage === 'undefined') throw new Error('Mailbox connection requires a browser session.');
  return sessionStorage;
}

function randomState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)).buffer);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(digest) };
}

function redirectUri(): string { return `${window.location.origin}${window.location.pathname}`; }

export async function startMailboxConnect(profileId: string, provider: MailProvider): Promise<void> {
  const clientId = providerClientId(provider);
  if (!clientId) throw new Error(`${providerName(provider)} mailbox connection is not configured by this HexiSpace host yet.`);
  const { verifier, challenge } = await pkcePair();
  const state = randomState();
  const callback = redirectUri();
  const pending: PendingOAuth = { provider, profileId, state, verifier, redirectUri: callback };
  storage().setItem(pendingKey, JSON.stringify(pending));
  const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: callback, state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' });
  if (provider === 'gmail') {
    params.set('scope', googleScopes.join(' '));
    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } else {
    params.set('scope', outlookScopes.join(' '));
    params.delete('access_type');
    params.delete('prompt');
    window.location.assign(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
  }
}

async function exchangeCode(pending: PendingOAuth, code: string): Promise<TokenResponse> {
  const clientId = providerClientId(pending.provider);
  const body = new URLSearchParams({ client_id: clientId, code, redirect_uri: pending.redirectUri, grant_type: 'authorization_code', code_verifier: pending.verifier });
  const endpoint = pending.provider === 'gmail' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token) throw new Error(result.error_description || result.error || `${providerName(pending.provider)} authorization failed.`);
  return result;
}

async function identify(provider: MailProvider, accessToken: string): Promise<string> {
  const endpoint = provider === 'gmail' ? 'https://gmail.googleapis.com/gmail/v1/users/me/profile' : 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName';
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${accessToken}` } });
  const result = await response.json() as { emailAddress?: string; mail?: string; userPrincipalName?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || 'The provider did not return a mailbox address.');
  const email = result.emailAddress || result.mail || result.userPrincipalName;
  if (!email) throw new Error('The provider did not return a usable mailbox address.');
  return email;
}

export async function finishMailboxOAuth(): Promise<ActiveMailbox | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  if (!code && !error) return null;
  let pending: PendingOAuth | null = null;
  try { pending = JSON.parse(storage().getItem(pendingKey) || 'null') as PendingOAuth | null; } catch { pending = null; }
  if (!pending) return null;
  if (!state || state !== pending.state) throw new Error('Mailbox sign-in was not started by this browser session.');
  storage().removeItem(pendingKey);
  window.history.replaceState({}, document.title, pending.redirectUri);
  if (error) throw new Error(`The ${providerName(pending.provider)} mailbox connection was cancelled.`);
  if (!code) throw new Error('The mailbox provider did not return an authorization code.');
  const tokens = await exchangeCode(pending, code);
  const email = await identify(pending.provider, tokens.access_token);
  const connection: ActiveMailbox = { provider: pending.provider, profileId: pending.profileId, email, scopes: pending.provider === 'gmail' ? googleScopes : outlookScopes, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + Math.max(60, tokens.expires_in || 3600) * 1000, clientId: providerClientId(pending.provider) };
  active.set(`${pending.profileId}:${pending.provider}:${email.toLowerCase()}`, connection);
  return connection;
}

export function activeMailboxes(profileId: string): ActiveMailbox[] { return [...active.values()].filter((connection) => connection.profileId === profileId); }

export function disconnectMailbox(profileId: string, provider: MailProvider, email: string): void { active.delete(`${profileId}:${provider}:${email.toLowerCase()}`); }

async function accessToken(connection: ActiveMailbox): Promise<string> {
  if (connection.expiresAt > Date.now() + 60_000) return connection.accessToken;
  if (!connection.refreshToken) throw new Error(`${providerName(connection.provider)} needs to be connected again.`);
  const body = new URLSearchParams({ client_id: providerClientId(connection.provider), refresh_token: connection.refreshToken, grant_type: 'refresh_token' });
  const endpoint = connection.provider === 'gmail' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token) throw new Error(`${providerName(connection.provider)} needs to be connected again.`);
  connection.accessToken = result.access_token;
  connection.expiresAt = Date.now() + Math.max(60, result.expires_in || 3600) * 1000;
  if (result.refresh_token) connection.refreshToken = result.refresh_token;
  return connection.accessToken;
}

async function request(connection: ActiveMailbox, input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken(connection);
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export async function listMailbox(connection: ActiveMailbox): Promise<MailItem[]> {
  if (connection.provider === 'gmail') {
    const listResponse = await request(connection, 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25');
    const list = await listResponse.json() as { messages?: Array<{ id: string }>; error?: { message?: string } };
    if (!listResponse.ok) throw new Error(list.error?.message || 'Gmail messages could not be read.');
    return Promise.all((list.messages || []).map(async ({ id }) => {
      const response = await request(connection, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
      const message = await response.json() as { id: string; internalDate?: string; labelIds?: string[]; snippet?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
      const header = (name: string) => message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';
      return { id: message.id, subject: header('Subject') || '(no subject)', sender: header('From'), preview: message.snippet || '', receivedAt: header('Date') || new Date(Number(message.internalDate || Date.now())).toISOString(), unread: message.labelIds?.includes('UNREAD') || false };
    }));
  }
  const response = await request(connection, 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$orderby=receivedDateTime%20desc&$select=id,subject,from,bodyPreview,receivedDateTime,isRead');
  const result = await response.json() as { value?: Array<{ id: string; subject?: string; from?: { emailAddress?: { address?: string } }; bodyPreview?: string; receivedDateTime?: string; isRead?: boolean }>; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || 'Outlook messages could not be read.');
  return (result.value || []).map((message) => ({ id: message.id, subject: message.subject || '(no subject)', sender: message.from?.emailAddress?.address || '', preview: message.bodyPreview || '', receivedAt: message.receivedDateTime || '', unread: !message.isRead }));
}

function cleanHeader(value: string): string { return value.replace(/[\r\n]/g, ' ').trim(); }

function encodeMime(value: string): string { return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }

export async function sendMailboxMail(connection: ActiveMailbox, recipient: string, subject: string, body: string): Promise<void> {
  const to = cleanHeader(recipient);
  const title = cleanHeader(subject || '(no subject)');
  if (!to || !body.trim()) throw new Error('Add a recipient and message first.');
  if (connection.provider === 'gmail') {
    const raw = [`To: ${to}`, `Subject: ${title}`, 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0', '', body].join('\r\n');
    const response = await request(connection, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ raw: encodeMime(raw) }) });
    if (!response.ok) throw new Error('Gmail could not send that message.');
    return;
  }
  const response = await request(connection, 'https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: { subject: title, body: { contentType: 'Text', content: body }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }) });
  if (!response.ok) throw new Error('Outlook could not send that message.');
}

export async function deleteMailboxMail(connection: ActiveMailbox, messageId: string): Promise<void> {
  const endpoint = connection.provider === 'gmail' ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}` : `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`;
  const response = await request(connection, endpoint, { method: 'DELETE' });
  if (!response.ok) throw new Error(`${providerName(connection.provider)} could not delete that message.`);
}
