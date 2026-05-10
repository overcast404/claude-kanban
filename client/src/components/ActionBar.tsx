import type { Task } from '../../../src/types';

interface Props {
  task: Task;
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDecide: () => void;
  onApprove: () => void;
  onReject: () => void;
  onViewLogs: () => void;
}

export function ActionBar({ task, onStart, onStop, onContinue, onEdit, onDelete, onDecide, onApprove, onReject, onViewLogs }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {task.status === 'pending' && (
        <>
          <button onClick={onStart} className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors">
            ▶ 开始
          </button>
          {task.session_id && (
            <button onClick={onContinue} className="px-4 py-1.5 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold hover:bg-warm-card transition-colors">
              继续
            </button>
          )}
          <button onClick={onEdit} className="px-4 py-1.5 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold hover:border-warm-tan transition-colors">
            编辑
          </button>
          <button onClick={onDelete} className="px-4 py-1.5 border border-warm-danger text-warm-danger rounded-lg text-xs font-semibold hover:bg-warm-danger-bg transition-colors">
            删除
          </button>
        </>
      )}

      {task.status === 'running' && (
        <>
          <button onClick={onStop} className="px-4 py-1.5 border border-warm-danger text-warm-danger rounded-lg text-xs font-semibold hover:bg-warm-danger-bg transition-colors">
            ⏹ 停止
          </button>
          <button onClick={onContinue} className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors">
            继续
          </button>
          <button onClick={onViewLogs} className="px-4 py-1.5 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold hover:bg-warm-card transition-colors">
            📋 日志
          </button>
        </>
      )}

      {task.status === 'deciding' && (
        <button onClick={onDecide} className="px-4 py-1.5 bg-warm-danger text-white rounded-lg text-xs font-bold hover:opacity-85 transition-colors">
          查看决策
        </button>
      )}

      {task.status === 'reviewing' && (
        <>
          <button onClick={onApprove} className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors">
            ✓ 验收通过
          </button>
          <button onClick={onReject} className="px-4 py-1.5 border border-warm-danger text-warm-danger rounded-lg text-xs font-semibold hover:bg-warm-danger-bg transition-colors">
            ↩ 回复继续
          </button>
        </>
      )}

      {task.status === 'done' && (
        <button onClick={onViewLogs} className="px-4 py-1.5 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold hover:bg-warm-card transition-colors">
          📋 查看日志
        </button>
      )}
    </div>
  );
}
