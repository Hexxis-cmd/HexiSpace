function afterRender(callback: () => void): void {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback);
  else callback();
}

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusPanelClose(root: HTMLElement): void {
  afterRender(() => root.querySelector<HTMLElement>('#utility-menu [data-action="close-panel"]')?.focus());
}

export function focusPanelToggle(root: HTMLElement): void {
  afterRender(() => root.querySelector<HTMLElement>('[data-action="toggle-panel"]')?.focus());
}

export function focusPanelTab(root: HTMLElement, tab: string): void {
  afterRender(() => [...root.querySelectorAll<HTMLElement>('[data-panel-tab]')].find((button) => button.dataset.panelTab === tab)?.focus());
}

export function bindMenuDismissal(root: HTMLElement, isOpen: () => boolean, close: () => void): void {
  if (root.dataset.menuDismissBound === 'true') return;
  root.dataset.menuDismissBound = 'true';

  root.addEventListener('click', (event) => {
    if (!isOpen()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#utility-menu, [data-action="toggle-panel"]')) return;
    close();
    focusPanelToggle(root);
  });

  window.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      focusPanelToggle(root);
      return;
    }
    if (event.key !== 'Tab') return;
    const menu = root.querySelector<HTMLElement>('#utility-menu');
    if (!menu) return;
    const focusable = [...menu.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === focusable[0] || !menu.contains(active))) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && active === focusable.at(-1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  });
}
