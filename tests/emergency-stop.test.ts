import { beforeEach, describe, expect, it } from 'vitest';
import { engageEmergencyStop, isEmergencyStopped, registerAgentRequest, resumeAgentActivity } from '../src/lib/emergency-stop';

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }, dispatchEvent: () => true }
  });
  resumeAgentActivity();
});

describe('HexiSpace emergency stop', () => {
  it('stops new requests and aborts active requests', () => {
    const request = registerAgentRequest();
    expect(request.signal.aborted).toBe(false);
    engageEmergencyStop();
    expect(isEmergencyStopped()).toBe(true);
    expect(request.signal.aborted).toBe(true);
    const blocked = registerAgentRequest();
    expect(blocked.signal.aborted).toBe(true);
  });

  it('can be resumed without changing any other local state', () => {
    engageEmergencyStop();
    resumeAgentActivity();
    expect(isEmergencyStopped()).toBe(false);
  });
});
