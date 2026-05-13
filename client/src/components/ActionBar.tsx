import type { Task } from '../../../src/types';
import { Icon, type IconName } from './Icon';

interface Props {
  task: Task;
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onViewLogs: () => void;
}

function Btn({ icon, label, primary, danger, onClick }: { icon: IconName; label: string; primary?: boolean; danger?: boolean; onClick: () => void }) {
  const base = primary
    ? 'bg-warm-brown text-white hover:bg-warm-brown-hover'
    : danger
      ? 'border border-warm-danger text-warm-danger hover:bg-warm-danger-bg'
      : 'border border-warm-border text-warm-text-secondary hover:border-warm-tan';
  return (
    <button onClick={onClick} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1 ${base}`}>
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}

export function ActionBar({ task, onStart, onStop, onContinue, onEdit, onDelete, onApprove, onReject, onViewLogs }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {task.status === 'pending' && (
        <>
          <Btn icon="play" label="开始" primary onClick={onStart} />
          {task.session_id && (
            <Btn icon="corner-down-left" label="继续" onClick={onContinue} />
          )}
          <Btn icon="edit" label="编辑" onClick={onEdit} />
          <Btn icon="x" label="删除" danger onClick={onDelete} />
        </>
      )}

      {task.status === 'running' && (
        <>
          <Btn icon="square" label="停止" danger onClick={onStop} />
          <Btn icon="corner-down-left" label="继续" primary onClick={onContinue} />
          <Btn icon="clipboard" label="日志" onClick={onViewLogs} />
        </>
      )}

      {task.status === 'reviewing' && (
        <>
          <button onClick={onApprove} className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors inline-flex items-center gap-1">
            <Icon name="check-circle" size={14} />
            验收通过
          </button>
          <button onClick={onReject} className="px-4 py-1.5 border border-warm-danger text-warm-danger rounded-lg text-xs font-semibold hover:bg-warm-danger-bg transition-colors inline-flex items-center gap-1">
            <Icon name="corner-down-left" size={14} />
            回复继续
          </button>
        </>
      )}

      {task.status === 'done' && (
        <Btn icon="clipboard" label="查看日志" onClick={onViewLogs} />
      )}
    </div>
  );
}
