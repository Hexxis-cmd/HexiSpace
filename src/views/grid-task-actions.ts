import type { User } from '@supabase/supabase-js';
import { cancelLinkedAgentTask, isHexiGridLinked, linkedTasks, scheduleLinkedAgentTask } from '../lib/hexigrid-bridge';
import { render, shellState } from './shell-runtime';

function friendlyTaskError(error: unknown): string {
  const detail = error instanceof Error ? error.message : '';
  if (detail.includes('scheduled_work permission')) return 'Task access was not approved for this connection. Disconnect and reconnect HexiGrid, then select Scheduled work.';
  if (detail.includes('not authorized') || detail.includes('no longer active')) return 'This HexiGrid link has expired. Connect it again to continue.';
  return detail || 'The task could not be completed. Check that HexiGrid is running and try again.';
}

export async function refreshGridTasks(root: HTMLElement, user: User): Promise<void> {
  const current = shellState(root);
  current.gridTasksLoading = true;
  current.gridTasksChecked = true;
  current.gridTasksMessage = '';
  render(root, user);
  try {
    current.gridTasks = await linkedTasks();
    current.gridTasksAvailable = true;
  } catch (error) {
    current.gridTasks = [];
    current.gridTasksAvailable = false;
    current.gridTasksMessage = friendlyTaskError(error);
    if (!isHexiGridLinked()) current.gridLinked = false;
  } finally {
    current.gridTasksLoading = false;
    render(root, user);
  }
}

export async function createGridTask(event: SubmitEvent, root: HTMLElement, user: User): Promise<void> {
  event.preventDefault();
  const current = shellState(root);
  if (!isHexiGridLinked() || !current.gridTasksAvailable || current.gridTaskSaving) return;
  const agentId = (root.querySelector('#gridTaskAgent') as HTMLSelectElement | null)?.value || '';
  const name = (root.querySelector('#gridTaskName') as HTMLInputElement | null)?.value.trim() || '';
  const prompt = (root.querySelector('#gridTaskPrompt') as HTMLTextAreaElement | null)?.value.trim() || '';
  const intervalSeconds = Number((root.querySelector('#gridTaskInterval') as HTMLSelectElement | null)?.value || 0);
  const requestedRuns = Number((root.querySelector('#gridTaskMaxRuns') as HTMLInputElement | null)?.value || 10);
  if (!agentId || !name || !prompt) { current.gridTasksMessage = 'Choose an agent, name the task, and describe its work.'; render(root, user); return; }
  if (intervalSeconds > 0 && (!Number.isInteger(requestedRuns) || requestedRuns < 2 || requestedRuns > 100)) { current.gridTasksMessage = 'Repeating tasks need a maximum between 2 and 100 runs.'; render(root, user); return; }
  const draft = { agentId, name, prompt, intervalSeconds: String(intervalSeconds), maxRuns: String(requestedRuns) };
  current.gridTaskSaving = true;
  current.gridTasksMessage = '';
  root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('#gridTaskForm button, #gridTaskForm input, #gridTaskForm select, #gridTaskForm textarea').forEach((control) => { control.disabled = true; });
  const submitButton = root.querySelector<HTMLButtonElement>('#gridTaskForm button[type="submit"]');
  if (submitButton) submitButton.textContent = 'Saving paused task…';
  let created = false;
  try {
    const result = await scheduleLinkedAgentTask({ agentId, name, prompt, intervalSeconds, maxRuns: intervalSeconds ? requestedRuns : 1, maxRetries: 1 });
    created = true;
    current.notice = result.notice || 'Task created paused. Review it in HexiGrid before starting.';
    try { current.gridTasks = await linkedTasks(); current.gridTasksAvailable = true; current.gridTasksMessage = ''; }
    catch (error) { current.gridTasksMessage = `Task created, but the list could not refresh: ${friendlyTaskError(error)}`; }
  } catch (error) {
    current.gridTasksMessage = friendlyTaskError(error);
    if (!isHexiGridLinked()) current.gridLinked = false;
  } finally {
    current.gridTaskSaving = false;
    render(root, user);
    if (!created) {
      const agent = root.querySelector<HTMLSelectElement>('#gridTaskAgent');
      const nameInput = root.querySelector<HTMLInputElement>('#gridTaskName');
      const promptInput = root.querySelector<HTMLTextAreaElement>('#gridTaskPrompt');
      const intervalInput = root.querySelector<HTMLSelectElement>('#gridTaskInterval');
      const runsInput = root.querySelector<HTMLInputElement>('#gridTaskMaxRuns');
      if (agent) agent.value = draft.agentId;
      if (nameInput) nameInput.value = draft.name;
      if (promptInput) promptInput.value = draft.prompt;
      if (intervalInput) intervalInput.value = draft.intervalSeconds;
      if (runsInput) runsInput.value = draft.maxRuns;
    }
  }
}

export async function cancelGridTask(root: HTMLElement, user: User, taskId: string): Promise<void> {
  const current = shellState(root);
  if (!taskId || !current.gridTasks.some((task) => task.id === taskId) || !isHexiGridLinked()) return;
  const task = current.gridTasks.find((entry) => entry.id === taskId);
  if (!window.confirm(`Cancel “${task?.name || 'this task'}”? It will stop running and cannot be restarted.`)) return;
  current.gridTasksLoading = true;
  current.gridTasksMessage = '';
  render(root, user);
  try {
    await cancelLinkedAgentTask(taskId);
    current.gridTasks = await linkedTasks();
    current.gridTasksAvailable = true;
    current.notice = 'Task cancelled.';
  } catch (error) {
    current.gridTasksMessage = friendlyTaskError(error);
    if (!isHexiGridLinked()) current.gridLinked = false;
  } finally {
    current.gridTasksLoading = false;
    render(root, user);
  }
}
