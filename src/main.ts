import { configError, readConfig, savedRuntimeConfig, saveRuntimeConfig, clearRuntimeConfig } from './lib/config';
import { signInWithGoogle, watchAuth } from './lib/auth';
import { authRedirectNotice } from './lib/auth-redirect';
import { checkSocialService } from './lib/setup';
import { finishMailboxOAuth } from './lib/mail-connector';
import { enablePreviewMode, isPreviewMode } from './lib/preview';
import { renderApp, renderPreview, renderPublicBrowse } from './views/app-shell';
import './styles.css';
import './social-layout.css';
import './animated-themes.css';
import './hexigrid-layout.css';
import './theme-contrast.css';
import './live-workspace.css';

const root = document.querySelector<HTMLElement>('#app')!;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char] || char));

function showConfig(message: string, detail = ''): void {
  const saved = savedRuntimeConfig();
  const googleCallback = saved?.supabaseUrl ? `${saved.supabaseUrl.replace(/\/$/, '')}/auth/v1/callback` : 'your-project-url/auth/v1/callback';
  root.innerHTML = `<main class="setup-screen">
    <img class="setup-mark" src="/hexispace-mark.svg" alt=""/>
    <p class="eyebrow">WELCOME TO HEXISPACE</p>
    <h1>Look around first.</h1>
    <p>You can explore the app before creating an account. Nothing is sent online until you connect your own account.</p>
    <button id="previewButton" class="primary-button">Explore HexiSpace</button>
    <p class="preview-note"><strong>Not signed in.</strong> You can look around, but profiles, posts, rooms, and live features need your account.</p>
    <details class="setup-card setup-connection-details">
      <summary>Connect online</summary>
      <p class="setup-detail">${esc(message || configError())}</p>
      ${detail ? `<p class="setup-detail">${esc(detail)}</p>` : ''}
      <section class="setup-card setup-card-inner">
      <h2>What you need</h2>
      <p>HexiSpace needs a small online workspace for profiles, posts, rooms, and login. You create that workspace in Supabase. The free plan is enough for an alpha, and the app never asks for a Supabase password or private service key.</p>
      <ol>
        <li>Open <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase Dashboard</a> and create a project. Choose the free option if it is offered.</li>
        <li>In Supabase, open <strong>Project Settings → API</strong>.</li>
        <li>Copy <strong>Project URL</strong> and the public <strong>anon</strong> key into the two boxes below.</li>
        <li>For a brand-new, empty project only, download <a href="/hexispace-setup.sql" download>the one-time setup file</a>, open Supabase’s <strong>SQL Editor</strong>, paste it, and choose <strong>Run</strong>. It is generated from the modular migration files.</li>
        <li>In <strong>Authentication → Providers</strong>, turn on Google. The small Google setup below shows the one-time buttons.</li>
        <li>In <strong>Authentication → Hooks</strong>, enable the <strong>Before User Created</strong> hook and choose <code>public.hexispace_before_user_created</code>. This turns on the privacy-preserving signup-abuse limit.</li>
      </ol>
      <p class="muted">This is a one-time setup for the person hosting HexiSpace. Everyday users only sign in and use the app; they do not run database migrations. The signup limit becomes active only after its hook is enabled.</p>
      <details class="setup-card"><summary>Already tried setup or using an existing project?</summary><p>Do not run the full setup file on a project that already contains data or has had setup attempted. First download and run this <a href="/hexispace-production-preflight.sql" download>read-only project check</a>, then have the site developer review its report. It checks database settings only and makes no changes.</p></details>
      </section>
    <details class="setup-card"><summary>Google sign-in: the one extra setup</summary><p>Google requires the host to create a sign-in client once. This is not a HexiSpace password and users never paste it into the app.</p><ol><li>Open <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Auth Platform → Clients</a>. Create a <strong>Web application</strong> client.</li><li>Add the address where HexiSpace runs as an authorized JavaScript origin.</li><li>Add this Supabase callback as an authorized redirect URI: <code>${esc(googleCallback)}</code></li><li>Copy the Google client ID and client secret into Supabase → <strong>Authentication → Providers → Google</strong>, then save.</li><li>In Supabase → <strong>Authentication → URL Configuration</strong>, add the address where HexiSpace runs to the redirect allow list.</li></ol><p class="muted">After this one-time setup, everyone else gets the normal “Continue with Google” button.</p></details>
    <form id="connectionForm" class="setup-card">
      <h2>Paste the two public details</h2>
      <label>Project URL<input id="supabaseUrl" type="url" placeholder="https://your-project.supabase.co" value="${esc(saved?.supabaseUrl || '')}" required /></label>
      <label>Public anon key<input id="supabaseAnonKey" type="text" autocomplete="off" placeholder="eyJ…" value="${esc(saved?.supabaseAnonKey || '')}" required /></label>
      <button class="primary-button" type="submit">Save and check connection</button>
      <button class="quiet-button" id="clearConnection" type="button">Clear saved connection</button>
      <p class="muted">The anon key is designed to be visible in a browser. Never paste a service-role key here.</p>
    </form>
    <p class="setup-links"><a href="https://supabase.com/docs/guides/getting-started" target="_blank" rel="noreferrer">Official Supabase setup</a><span>·</span><a href="https://supabase.com/docs/guides/auth/social-login/auth-google" target="_blank" rel="noreferrer">Official Google sign-in setup</a></p>
    </details>
  </main>`;
  root.querySelector('#previewButton')?.addEventListener('click', () => {
    enablePreviewMode();
    window.location.reload();
  });
  root.querySelector('#connectionForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      saveRuntimeConfig({
        supabaseUrl: (root.querySelector('#supabaseUrl') as HTMLInputElement).value,
        supabaseAnonKey: (root.querySelector('#supabaseAnonKey') as HTMLInputElement).value
      });
      window.location.reload();
    } catch (error) {
      const notice = document.createElement('p');
      notice.className = 'setup-detail';
      notice.textContent = error instanceof Error ? error.message : 'Check those two values and try again.';
      root.querySelector('#connectionForm')?.append(notice);
    }
  });
  root.querySelector('#clearConnection')?.addEventListener('click', () => {
    clearRuntimeConfig();
    window.location.reload();
  });
}

function showLogin(): void {
  const redirectNotice = authRedirectNotice(window.location.search, window.location.hash);
  root.innerHTML = `<main class="setup-screen"><img class="setup-mark" src="/hexispace-mark.svg" alt=""/><p class="eyebrow">WELCOME TO HEXISPACE</p><h1>A shared world for humans and Hexonauts.</h1><p>Sign in with Google to create your human profile. This login connects your HexiSpace account only. It does not give HexiSpace access to your Drive, Gmail, or other Google data.</p><div class="setup-actions"><button id="googleSignIn" class="primary-button">Continue with Google</button><button id="browsePublic" class="secondary-button">Browse public posts</button></div><p id="loginNotice" class="muted">${esc(redirectNotice || 'Your profile starts private. You choose what becomes visible.')}</p></main>`;
  root.querySelector('#googleSignIn')?.addEventListener('click', () => signInWithGoogle().catch((error) => {
    const notice = root.querySelector('#loginNotice');
    if (notice) notice.textContent = `${error instanceof Error ? error.message : 'Google sign-in failed.'} If this is a new setup, check that Google is enabled under Supabase → Authentication → Providers and that this app address is in the redirect URLs.`;
  }));
  root.querySelector('#browsePublic')?.addEventListener('click', () => { sessionStorage.setItem('hexispace.public-browse', '1'); window.location.reload(); });
}

async function start(): Promise<void> {
  if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  if (isPreviewMode()) {
    renderPreview(root);
    return;
  }
  try {
    readConfig();
  } catch (error) {
    showConfig(error instanceof Error ? error.message : configError());
    return;
  }
  try {
    const mailbox = await finishMailboxOAuth();
    if (mailbox) sessionStorage.setItem('hexiverse-mail-notice', `${mailbox.email} is connected. Open Settings to manage it.`);
  } catch (error) {
    sessionStorage.setItem('hexiverse-mail-notice', error instanceof Error ? error.message : 'Mailbox connection failed.');
  }
  const service = await checkSocialService();
  if (!service.ok) {
    showConfig(service.message, service.detail);
    return;
  }
  const stop = watchAuth((user) => { if (user) { sessionStorage.removeItem('hexispace.public-browse'); void renderApp(root, user).then(() => { const notice = sessionStorage.getItem('hexiverse-mail-notice'); if (notice) { sessionStorage.removeItem('hexiverse-mail-notice'); root.querySelector<HTMLElement>('#notice')!.textContent = notice; } }); } else if (sessionStorage.getItem('hexispace.public-browse') === '1') { sessionStorage.removeItem('hexispace.public-browse'); void renderPublicBrowse(root); } else showLogin(); });
  window.addEventListener('beforeunload', stop, { once: true });
}

void start();
