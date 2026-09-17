import type { HexiGridTask, LinkedAgent } from '../lib/hexigrid-bridge';
import { escapeHtml } from './view-helpers';

function statusLabel(status: HexiGridTask['status']): string {
  return ({ waiting_approval: 'Waiting for approval' } as Partial<Record<HexiGridTask['status'], string>>)[status] || status.charAt(0).toUpperCase() + status.slice(1);
}

function intervalLabel(seconds: number): string {
  if (!seconds) return 'One-time';
  if (seconds % 86400 === 0) return `Every ${seconds / 86400} day${seconds === 86400 ? '' : 's'}`;
  if (seconds % 3600 === 0) return `Every ${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`;
  return `Every ${Math.round(seconds / 60)} minutes`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleString();
}

export function renderGridTasks(input: {
  agents: LinkedAgent[];
  tasks: HexiGridTask[];
  loading: boolean;
  checked: boolean;
  available: boolean;
  message: string;
  saving: boolean;
}): string {
  const agentOptions = input.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`).join('');
  const taskRows = input.tasks.length
    ? `<ul class="grid-task-list">${input.tasks.map((task) => {
      const cancellable = !['completed', 'cancelled', 'failed'].includes(task.status);
      const updated = dateLabel(task.updatedAt);
      const nextRun = task.nextRunAt ? `<p class="grid-task-next">Next run: ${escapeHtml(dateLabel(task.nextRunAt))}</p>` : '';
      return `<li class="grid-task-row"><div class="grid-task-main"><div><h4>${escapeHtml(task.name)}</h4><p>${escapeHtml(input.agents.find((agent) => agent.id === task.agentId)?.name || 'HexiGrid agent')} · ${escapeHtml(intervalLabel(task.intervalSeconds))} · ${task.runCount}/${task.maxRuns} runs</p>${nextRun}<small>Updated ${escapeHtml(updated)}</small></div><span class="grid-task-status is-${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span></div>${cancellable ? `<button type="button" class="quiet-button" data-action="cancel-grid-task" data-task-id="${escapeHtml(task.id)}">Cancel task</button>` : ''}</li>`;
    }).join('')}</ul>`
    : '<p class="grid-task-empty">No tasks from this HexiSpace connection yet.</p>';

  let content: string;
  if (input.loading && !input.checked) content = '<p class="grid-task-empty" role="status">Loading tasks…</p>';
  else if (input.checked && !input.available) content = `<p class="grid-task-permission" role="status">${escapeHtml(input.message || 'Task access is unavailable. Check the HexiGrid connection and try again.')}</p><button class="quiet-button" type="button" data-action="refresh-grid-tasks" ${input.loading ? 'disabled' : ''}>${input.loading ? 'Checking…' : 'Check task access again'}</button>`;
  else if (!input.available) content = '<p class="grid-task-empty">Task access has not been checked yet.</p>';
  else content = `<form id="gridTaskForm" class="grid-task-form"><label>Agent<select id="gridTaskAgent" required ${input.saving ? 'disabled' : ''}>${agentOptions}</select></label><label>Task name<input id="gridTaskName" maxlength="120" required placeholder="For example, Morning check-in" ${input.saving ? 'disabled' : ''}></label><label>What should the agent do?<textarea id="gridTaskPrompt" maxlength="12000" required placeholder="Describe the work and when the agent should stop." ${input.saving ? 'disabled' : ''}></textarea></label><div class="grid-task-schedule-fields"><label>Repeat<select id="gridTaskInterval" ${input.saving ? 'disabled' : ''}><option value="0">Run once</option><option value="900">Every 15 minutes</option><option value="3600">Every hour</option><option value="21600">Every 6 hours</option><option value="86400">Every day</option></select></label><label>Maximum runs<input id="gridTaskMaxRuns" type="number" min="2" max="100" value="10" ${input.saving ? 'disabled' : ''}><small>Used for repeating tasks; one-time tasks always run once.</small></label></div><p class="grid-task-safety">New tasks are saved paused. Review and start them in HexiGrid controls when you’re ready. Repeating tasks run no more often than every 15 minutes and stop after 100 runs.</p>${input.message ? `<p class="grid-task-permission" role="status">${escapeHtml(input.message)}</p>` : ''}<button class="primary-button" type="submit" ${input.saving || !input.agents.length ? 'disabled' : ''}>${input.saving ? 'Saving paused task…' : 'Create paused task'}</button></form><div class="grid-task-list-heading"><h3>Your scheduled tasks</h3><button class="quiet-button" type="button" data-action="refresh-grid-tasks" ${input.loading ? 'disabled' : ''}>${input.loading ? 'Refreshing…' : 'Refresh'}</button></div>${taskRows}`;

  return `<section class="grid-task-manager" aria-labelledby="gridTaskTitle"><div class="grid-task-heading"><div><p class="eyebrow">AGENT AUTOMATION</p><h3 id="gridTaskTitle">Scheduled work</h3><p>Set up a task here; review and start it from HexiGrid.</p></div><span class="grid-task-count">${input.tasks.length} ${input.tasks.length === 1 ? 'task' : 'tasks'}</span></div>${content}</section>`;
}
