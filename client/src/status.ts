import type { TaskStatus } from '../../src/types';
import type { IconName } from './components/Icon';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '待启动',
  running: '进行中',
  deciding: '待决策',
  reviewing: '待验收',
  done: '已完成',
};

export const STATUS_ICON: Record<TaskStatus, IconName> = {
  pending: 'inbox',
  running: 'zap',
  deciding: 'help-circle',
  reviewing: 'check-circle',
  done: 'archive',
};

export const STATUS_ORDER: TaskStatus[] = [
  'pending', 'running', 'deciding', 'reviewing', 'done',
];

export const ACTION_LABEL = '待处理';
export const ACTION_ICON: IconName = 'bell';
export const ACTION_STATUSES: TaskStatus[] = ['deciding', 'reviewing'];

export const IN_PROGRESS_STATUSES: TaskStatus[] = ['pending', 'running'];
export const IN_PROGRESS_LABEL = '进行中';
export const IN_PROGRESS_ICON: IconName = 'zap';

export const TABS = [
  { key: 'in-progress', icon: IN_PROGRESS_ICON, label: IN_PROGRESS_LABEL, statuses: IN_PROGRESS_STATUSES },
  { key: 'action', icon: ACTION_ICON, label: ACTION_LABEL, statuses: ACTION_STATUSES },
  { key: 'done', icon: STATUS_ICON.done, label: STATUS_LABEL.done, statuses: ['done'] as TaskStatus[] },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export const PRIORITY_LABEL: Record<string, string> = {
  high: '高',
  normal: '中',
  low: '低',
};
