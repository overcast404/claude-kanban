import type { Project, Task, Decision, TaskCreateInput, ProjectCreateInput } from '../../src/types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Projects
export const listProjects = () => request<Project[]>('/projects');
export const createProject = (input: ProjectCreateInput) =>
  request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) });

// Tasks
export const listTasks = (projectId: string) =>
  request<Task[]>(`/tasks?projectId=${encodeURIComponent(projectId)}`);
export const createTask = (projectId: string, input: TaskCreateInput) =>
  request<Task>(`/tasks?projectId=${encodeURIComponent(projectId)}`, {
    method: 'POST', body: JSON.stringify(input),
  });
export const startTask = (taskId: string) =>
  request<Task>(`/tasks/${taskId}/start`, { method: 'POST' });
export const updateTaskStatus = (taskId: string, status: string) =>
  request<Task>(`/tasks/${taskId}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  });
export const submitDecision = (taskId: string, answer: string) =>
  request<{ task: Task; answer: string }>(`/tasks/${taskId}/decide`, {
    method: 'POST', body: JSON.stringify({ answer }),
  });
export const approveTask = (taskId: string) =>
  request<Task>(`/tasks/${taskId}/approve`, { method: 'POST' });
export const rejectTask = (taskId: string, feedback: string) =>
  request<{ task: Task; feedback: string }>(`/tasks/${taskId}/reject`, {
    method: 'POST', body: JSON.stringify({ feedback }),
  });
export const getTaskWithDecision = (taskId: string) =>
  request<{ task: Task; pendingDecision: Decision | null }>(`/tasks/${taskId}`);
export const stopTask = (taskId: string) =>
  request<Task>(`/tasks/${taskId}/stop`, { method: 'POST' });
export const continueTask = (taskId: string) =>
  request<Task>(`/tasks/${taskId}/continue`, { method: 'POST' });
export const updateTask = (taskId: string, data: { title?: string; description?: string }) =>
  request<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteTask = (taskId: string) =>
  request<void>(`/tasks/${taskId}`, { method: 'DELETE' });
export const deleteProject = (projectId: string) =>
  request<void>(`/projects/${projectId}`, { method: 'DELETE' });

// Filesystem — 服务端调用系统原生目录选择器 (osascript/PowerShell/zenity)
export const pickDirectory = (): Promise<{ path?: string; cancelled?: boolean; error?: string }> =>
  request('/filesystem/pick-directory', { method: 'POST' });

// Network
export interface NetworkInfo {
  lanUrls: string[];
  port: number;
}
export const fetchNetworkInfo = () => request<NetworkInfo>('/network-info');

// Logs
export interface LogResponse {
  text: string;
  offset: number;
  eof: boolean;
}
export const fetchTaskLogs = (taskId: string, offset: number) =>
  request<LogResponse>(`/tasks/${taskId}/logs?offset=${offset}`);
