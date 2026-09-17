const stopKey = 'hexispace.emergency-stop.v1';
const active = new Set<AbortController>();

export function isEmergencyStopped(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(stopKey) === '1'; } catch { return false; }
}

export function registerAgentRequest(): AbortController & { cleanup: () => void } {
  const controller = new AbortController() as AbortController & { cleanup: () => void };
  if (isEmergencyStopped()) controller.abort('emergency-stop');
  active.add(controller);
  controller.cleanup = () => active.delete(controller);
  return controller;
}

export function engageEmergencyStop(): void {
  if (typeof window !== 'undefined') { try { window.localStorage.setItem(stopKey, '1'); } catch { /* Session-only stop is still enforced in memory. */ } window.dispatchEvent(new Event('hexispace-emergency-stop')); }
  for (const controller of active) controller.abort('emergency-stop');
  active.clear();
}

export function resumeAgentActivity(): void {
  if (typeof window !== 'undefined') { try { window.localStorage.removeItem(stopKey); } catch { /* A private tab may be session-only. */ } }
}
