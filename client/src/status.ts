import type { TaskStatus } from '../../src/types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '待启动',
  running: '进行中',
  deciding: '待决策',
  reviewing: '待验收',
  done: '已完成',
};

export const STATUS_ICON: Record<TaskStatus, string> = {
  pending: '📥',
  running: '⚡',
  deciding: '❓',
  reviewing: '✅',
  done: '📦',
};

export const STATUS_ORDER: TaskStatus[] = [
  'pending', 'running', 'deciding', 'reviewing', 'done',
];

export const PRIORITY_LABEL: Record<string, string> = {
  high: '高',
  normal: '中',
  low: '低',
};
