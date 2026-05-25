export type TaskStatus = 'pending' | 'running' | 'deciding' | 'reviewing' | 'done' | 'stopped';

export interface Project {
  id: string;
  name: string;
  working_dir: string;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  session_id: string | null;
  summary: string | null;
  checkpoint_commit: string | null;
  initial_commit: string | null;
  use_worktree: boolean;
  _worktree?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Decision {
  id: string;
  task_id: string;
  context: string;
  question: string;
  options: { label: string; description?: string }[];
  answer: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface TaskCreateInput {
  title: string;
  description: string;
  use_worktree?: boolean;
}

export interface ProjectCreateInput {
  name: string;
  working_dir: string;
}

export interface TaskOutputPayload {
  taskId: string;
  text: string;
  stream: 'stderr' | 'stdout';
  seq: number;
}

export interface WsMessage {
  type: 'task_updated' | 'task_created' | 'task_deleted' | 'project_deleted' | 'decision_created' | 'decision_resolved' | 'task_output';
  payload: unknown;
}
