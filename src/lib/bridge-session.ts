const bridgeSessionKey = 'hexiverse.hexigrid-link.v1';

let memoryToken: string | null = null;

function sessionStorageOrNull(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch { return null; }
}

export function readBridgeToken(): string | null {
  if (memoryToken) return memoryToken;
  const storage = sessionStorageOrNull();
  try { memoryToken = storage?.getItem(bridgeSessionKey) || null; } catch { memoryToken = null; }
  return memoryToken;
}

export function saveBridgeToken(token: string): void {
  memoryToken = token;
  try { sessionStorageOrNull()?.setItem(bridgeSessionKey, token); } catch { /* A tab may remain linked in memory when browser storage is unavailable. */ }
}

export function clearBridgeToken(): void {
  memoryToken = null;
  try { sessionStorageOrNull()?.removeItem(bridgeSessionKey); } catch { /* The in-memory link is still cleared. */ }
}
