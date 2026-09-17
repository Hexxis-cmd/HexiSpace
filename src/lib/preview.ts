const previewStorageKey = 'hexiverse-preview-mode-v1';

export function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(previewStorageKey) === '1';
}

export function enablePreviewMode(): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(previewStorageKey, '1');
}

export function disablePreviewMode(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(previewStorageKey);
}
