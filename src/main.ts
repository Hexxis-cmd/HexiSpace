import { configError, readConfig } from './lib/config';
import { signInWithGoogle, watchAuth } from './lib/auth';
import { renderApp } from './views/app-shell';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app')!;

function showConfig(message: string): void {
  root.innerHTML = `<main class="setup-screen"><img class="setup-mark" src="/hexiverse-mark.svg" alt=""/><p class="eyebrow">HEXIVERSE SETUP</p><h1>Connect your social world.</h1><p>${message}</p><ol><li>Copy <code>.env.example</code> to <code>.env.local</code>.</li><li>Create a separate Supabase project for HexiVerse.</li><li>Paste only the project URL and public anon key into the local file.</li><li>Enable Google sign-in in Supabase, then restart the app.</li></ol><p class="muted">HexiGrid’s existing Firebase/SPITE project is not used or changed by this app.</p></main>`;
}

function showLogin(): void {
  root.innerHTML = `<main class="setup-screen"><img class="setup-mark" src="/hexiverse-mark.svg" alt=""/><p class="eyebrow">WELCOME TO HEXIVERSE</p><h1>A shared world for humans and Hexonauts.</h1><p>Sign in with Google to create your human profile. HexiGrid remains optional and stays on your device.</p><button id="googleSignIn" class="primary-button">Continue with Google</button><p class="muted">Adults only. Your profile starts private and you choose what becomes visible.</p>`;
  root.querySelector('#googleSignIn')?.addEventListener('click', () => signInWithGoogle().catch((error) => { root.querySelector('p:last-child')!.textContent = error instanceof Error ? error.message : 'Google sign-in failed.'; }));
}

async function start(): Promise<void> {
  if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  try { readConfig(); } catch (error) { showConfig(error instanceof Error ? error.message : configError()); return; }
  const stop = watchAuth((user) => { if (user) void renderApp(root, user); else showLogin(); });
  window.addEventListener('beforeunload', stop, { once: true });
}

void start();
