import { describe, expect, it } from 'vitest';
import { renderHexiGridView } from '../src/views/hexigrid-view';
import { readFile } from 'node:fs/promises';

const base = {
  origin: 'http://127.0.0.1:4318',
  message: '',
  linked: false,
  agents: [],
  selectedAgentId: '',
  conversation: [],
  conversationLoading: false,
  conversationSending: false,
  conversationMessage: '',
  tasks: [],
  tasksLoading: false,
  tasksChecked: true,
  tasksAvailable: false,
  tasksMessage: '',
  taskSaving: false,
  pairing: null,
  pairingBusy: false
};

describe('built-in HexiGrid workspace', () => {
  it('keeps the signed-out path honest and does not embed a fake runtime', () => {
    const html = renderHexiGridView({ ...base, state: 'preview' });
    expect(html).toContain('data-grid-state="preview"');
    expect(html).toContain('<h1 id="gridAppTitle">Agent workspace</h1>');
    expect(html).not.toContain('data-action="open-space"');
    expect(html).toContain('Sign in to connect your workspace');
    expect(html).not.toContain('<iframe');
  });

  it('shows real pairing controls only when the local runtime is reachable', () => {
    const html = renderHexiGridView({ ...base, state: 'online' });
    expect(html).toContain('data-action="pair-hexigrid"');
    expect(html).toContain('Connect HexiGrid');
    expect(html).toContain('Open HexiGrid controls');
    expect(html).not.toContain('<iframe');
    expect(renderHexiGridView({ ...base, state: 'offline' })).toContain('data-action="check-hexigrid"');
  });

  it('renders only minimal linked-agent details and provides the scoped message action', () => {
    const html = renderHexiGridView({
      ...base,
      state: 'online',
      linked: true,
      agents: [{ id: 'agent-1', name: '<Juniper>', status: 'active', model: 'local-model' }]
    });
    expect(html).toContain('&lt;Juniper&gt;');
    expect(html).toContain('local-model');
    expect(html).toContain('id="agentChatForm"');
    expect(html).toContain('role="log"');
    expect(html).toContain('not stored in HexiSpace');
    expect(html).toContain('data-action="disconnect-hexigrid"');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('private instructions');
  });

  it('renders a safely escaped, selectable conversation with loading and sending states', () => {
    const html = renderHexiGridView({
      ...base,
      state: 'online',
      linked: true,
      agents: [{ id: 'agent-1', name: '<Juniper>', status: 'active', model: 'local-model' }],
      selectedAgentId: 'agent-1',
      conversation: [{ id: 'msg-1', role: 'assistant', content: '<script>alert(1)</script>', createdAt: '2026-09-17T12:00:00.000Z' }],
      conversationSending: true
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('value="agent-1" selected');
    expect(html).toContain('Waiting for reply…');
    expect(html).toContain('This thread is saved in the linked HexiGrid workspace');
    expect(html).toContain('data-action="clear-agent-conversation"');
  });

  it('shows bounded, paused task creation and status only when scheduled work was approved', () => {
    const html = renderHexiGridView({
      ...base,
      state: 'online',
      linked: true,
      agents: [{ id: 'agent-1', name: 'Juniper', status: 'active', model: 'local-model' }],
      tasksAvailable: true,
      tasks: [{ id: 'task-1', name: '<check-in>', agentId: 'agent-1', intervalSeconds: 3600, maxRuns: 10, runCount: 2, status: 'running', nextRunAt: '2026-09-17T18:00:00.000Z', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T11:00:00.000Z' }]
    });
    expect(html).toContain('id="gridTaskForm"');
    expect(html).toContain('Create paused task');
    expect(html).toContain('Every hour');
    expect(html).toContain('Review and start them in HexiGrid controls');
    expect(html).toContain('&lt;check-in&gt;');
    expect(html).toContain('data-action="cancel-grid-task" data-task-id="task-1"');
    expect(html).not.toContain('<check-in>');
  });

  it('explains when task permission was not approved and hides task creation', () => {
    const html = renderHexiGridView({ ...base, state: 'online', linked: true, tasksChecked: true, tasksAvailable: false, tasksMessage: 'Task access was not approved.' });
    expect(html).toContain('Task access was not approved.');
    expect(html).not.toContain('id="gridTaskForm"');
  });

  it('opens the workspace from account tools without adding a second app button to the header', async () => {
    const [shell, events, view, utilityPanel, panels] = await Promise.all([
      readFile(new URL('../src/views/shell-actions.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/shell-events.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/social-view.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/utility-panel.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/views/social-panels.ts', import.meta.url), 'utf8')
    ]);
    expect(shell).toContain("window.location.hash !== '#grid'");
    expect(events).toContain("case 'open-hexigrid'");
    expect(events).toContain("case 'disconnect-hexigrid'");
    expect(view).not.toContain('renderHexiGridLauncher');
    expect(view).not.toContain('Open HexiGrid control room');
    expect(view).not.toContain('class="app-launcher');
    expect(utilityPanel).toContain("menuRow('Agent workspace'");
    expect(utilityPanel).toContain("'open-hexigrid'");
    expect(view).not.toContain('id="agentChatForm"');
    expect(panels).not.toContain('pair-hexigrid');
    expect(panels).not.toContain('bridgePanel');
  });
});
