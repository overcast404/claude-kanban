import type { TaskStatus } from '../../src/types';
import type { IconName } from './components/Icon';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '待启动',
  running: '进行中',
  deciding: '待决策',
  reviewing: '待验收',
  done: '已完成',
  stopped: '已停止',
};

export const STATUS_ICON: Record<TaskStatus, IconName> = {
  pending: 'inbox',
  running: 'zap',
  deciding: 'help-circle',
  reviewing: 'check-circle',
  done: 'archive',
  stopped: 'pause-circle',
};

export const STATUS_ORDER: TaskStatus[] = [
  'pending', 'running', 'deciding', 'reviewing', 'done', 'stopped',
];

// Board column definitions
export const BOARD_COLUMNS = [
  {
    key: 'active' as const,
    icon: 'zap' as IconName,
    label: '进行中',
    statuses: ['pending', 'running'] as TaskStatus[],
    accentBorder: 'border-b-2 border-b-warm-brown',
    accentBg: 'bg-warm-brown',
  },
  {
    key: 'attention' as const,
    icon: 'bell' as IconName,
    label: '待处理',
    statuses: ['deciding', 'reviewing', 'stopped'] as TaskStatus[],
    accentBorder: 'border-b-2 border-b-warm-danger',
    accentBg: 'bg-warm-danger',
  },
  {
    key: 'done' as const,
    icon: 'archive' as IconName,
    label: '已完成',
    statuses: ['done'] as TaskStatus[],
    accentBorder: 'border-b-2 border-b-warm-border',
    accentBg: 'bg-warm-text-secondary',
  },
];

export const TABS = [
  { key: 'chat', icon: 'message-circle' as IconName, label: '聊天' },
  { key: 'board', icon: 'clipboard' as IconName, label: '看板' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];
