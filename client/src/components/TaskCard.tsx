import type { Task } from '../../../src/types';

interface Props {
  task: Task;
  projectName: string;
  selected: boolean;
  activity?: string;
  onClick: () => void;
}

export function TaskCard({ task, projectName, selected, activity, onClick }: Props) {
  const isDone = task.status === 'done';
  const isDeciding = task.status === 'deciding';
  const isReviewing = task.status === 'reviewing';
  const isRunning = task.status === 'running';
  const hasActivity = isRunning && !!activity;

  return (
    <div
      onClick={onClick}
      className={`bg-warm-card border rounded-lg p-3 cursor-pointer transition-colors ${
        selected
          ? 'border-warm-tan ring-1 ring-warm-tan'
          : 'border-warm-border hover:border-warm-tan'
      } ${isDone ? 'opacity-60' : ''} ${isDeciding ? 'border-warm-danger border-dashed' : ''} ${isReviewing ? 'border-l-[3px] border-l-warm-tan' : ''}`}
    >
      <div className={`text-[13px] font-bold text-warm-text mb-1 ${isDone ? 'line-through' : ''}`}>
        {task.title}
      </div>

      {hasActivity && (
        <div className="text-[10px] text-warm-brown font-mono leading-relaxed truncate mb-1">
          {activity}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-warm-text-secondary">
        {task.status === 'deciding' && (
          <span className="text-warm-danger font-medium">等待决策</span>
        )}
        {task.status === 'reviewing' && task.summary && (
          <span className="truncate max-w-[200px]">{task.summary.slice(0, 50)}</span>
        )}
        {task.status === 'pending' && task.session_id && (
          <span className="text-warm-tan">可继续</span>
        )}
      </div>
    </div>
  );
}
