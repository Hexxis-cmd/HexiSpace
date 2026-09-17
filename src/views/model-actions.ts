import { connectDirectModel, testDirectModel, unlockModelConnection, type DirectModelDraft } from '../lib/model-connections';
import { saveAppTheme } from '../lib/theme-system';
import { setNotice, shellState } from './shell-runtime';
import type { User } from '@supabase/supabase-js';

export async function connectModelFlow(event: SubmitEvent, root: HTMLElement, _user: User): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const status = root.querySelector<HTMLElement>('#modelConnectionStatus');
  const draft: DirectModelDraft = {
    provider: (form.elements.namedItem('modelProvider') as HTMLSelectElement).value as DirectModelDraft['provider'],
    endpoint: (form.elements.namedItem('modelEndpoint') as HTMLInputElement).value,
    model: (form.elements.namedItem('modelId') as HTMLInputElement).value,
    apiKey: (form.elements.namedItem('modelApiKey') as HTMLInputElement).value,
    passphrase: (form.elements.namedItem('modelPassphrase') as HTMLInputElement).value
  };
  if (status) status.textContent = 'Checking the provider directly from this browser…';
  try {
    const result = await connectDirectModel(draft);
    const reply = await testDirectModel(result.connection, 'Reply with a short hello.');
    if (status) status.textContent = `Connected to ${result.connection.model}. Reply: ${reply}`;
    shellState(root).notice = 'The model connected directly from this browser.';
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : 'The model connection failed.';
    setNotice(root, error);
  }
}

export async function unlockModelFlow(event: SubmitEvent, root: HTMLElement): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const status = root.querySelector<HTMLElement>('#modelUnlockStatus');
  const id = (form.elements.namedItem('modelSavedId') as HTMLSelectElement).value;
  const passphrase = (form.elements.namedItem('modelUnlockPassphrase') as HTMLInputElement).value;
  if (status) status.textContent = 'Unlocking this browser copy…';
  try {
    const connection = await unlockModelConnection(id, passphrase);
    if (status) status.textContent = `Unlocked ${connection.model}. It is ready for model requests in this session.`;
    shellState(root).notice = 'Saved model connection unlocked locally.';
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : 'The saved connection could not be unlocked.';
    setNotice(root, error);
  }
}

export function saveThemeFromControl(root: HTMLElement, value: string): void {
  saveAppTheme(value);
  shellState(root).notice = 'Theme updated.';
}
