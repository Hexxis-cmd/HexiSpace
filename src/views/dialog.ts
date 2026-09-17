import { hydratePrivateMedia } from '../lib/private-media';

export function modal(title: string, body: string): void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.querySelector('#dialog')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="dialog" class="dialog-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button><p class="eyebrow">HEXISPACE</p><h2 id="dialogTitle">${title}</h2>${body}</section></div>`);
  const dialog = document.querySelector<HTMLElement>('#dialog');
  if (!dialog) return;
  void hydratePrivateMedia(dialog);
  const close = () => {
    dialog.remove();
    previous?.focus();
  };
  const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
  dialog.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-action="close-dialog"]')) close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.querySelector<HTMLElement>('input, select, textarea, button:not([data-action="close-dialog"])')?.focus();
}
