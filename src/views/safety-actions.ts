import type { User } from '@supabase/supabase-js';
import { emergencyStopHexiGrid, isHexiGridLinked } from '../lib/hexigrid-bridge';
import { engageEmergencyStop, resumeAgentActivity } from '../lib/emergency-stop';
import { render, setNotice, shellState } from './shell-runtime';

export async function emergencyStopFlow(root: HTMLElement, user: User): Promise<void> {
  if (!window.confirm('Stop all agent activity now? This pauses direct model calls, live work, and scheduled work.')) return;
  engageEmergencyStop();
  const current = shellState(root); current.emergencyStopped = true; current.notice = 'Agent activity stopped on this device.'; render(root, user);
  if (isHexiGridLinked()) {
    try { await emergencyStopHexiGrid(); current.notice = 'Agent activity stopped on this device and in HexiGrid.'; }
    catch { current.notice = 'Agent activity stopped on this device. HexiGrid could not be reached, so check it separately.'; }
    render(root, user);
  }
}

export function resumeAgentFlow(root: HTMLElement, user: User): void {
  resumeAgentActivity();
  const current = shellState(root); current.emergencyStopped = false; current.notice = 'Direct agent actions are available again. Restart any paused HexiGrid tasks there.'; render(root, user);
}
