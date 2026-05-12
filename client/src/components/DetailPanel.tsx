import { useState } from 'react';
import type { Task } from '../../../src/types';
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ICON } from '../status';
import { rejectTask } from '../api';
import { ActionBar } from './ActionBar';
import { LogPreview } from './LogPreview';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

interface Props {
  task: Task | null;
  projectName: string;
  logs: { stream: string; text: string }[];
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDecide: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRejectSubmitted: () => void;
  onViewLogs: () => void;
  onClose: () => void;
}

export function DetailPanel({ task, projectName, logs, onClose, onReject, onRejectSubmitted, ...actions }: Props) {
  const [showInlineFeedback, setShowInlineFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRejectClick = () => {
    setShowInlineFeedback(true);
    setFeedbackText('');
  };

  const handleSendFeedback = async () => {
    if (!task || !feedbackText.trim()) return;
    setSubmitting(true);
    try {
      await rejectTask(task.id, feedbackText.trim());
      setShowInlineFeedback(false);
      setFeedbackText('');
      onRejectSubmitted();
    } catch (e) {
      alert('操作失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelFeedback = () => {
    setShowInlineFeedback(false);
    setFeedbackText('');
  };
  if (!task) {
    return (
      <div className="h-full border-l border-warm-border bg-warm-card flex items-center justify-center">
        <EmptyState icon="arrow-left" message="选择一个任务查看详情" />
      </div>
    );
  }

  return (
    <div className="h-full border-l border-warm-border bg-warm-card overflow-y-auto">
      <div className="p-4">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[15px] font-bold text-warm-text mb-1">{task.title}</h2>
            <button
              onClick={onClose}
              className="text-warm-text-secondary hover:text-warm-text p-0.5 rounded shrink-0"
              title="关闭详情"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-warm-text-secondary">
            <span className="inline-flex items-center gap-0.5"><Icon name="folder" size={12} /> {projectName}</span>
            <span className="inline-flex items-center gap-0.5"><Icon name={STATUS_ICON[task.status]} size={13} /> {STATUS_LABEL[task.status]}</span>
            {task.priority !== 'normal' && (
              <span className={task.priority === 'high' ? 'text-warm-danger font-semibold' : ''}>
                {PRIORITY_LABEL[task.priority]}优先级
              </span>
            )}
          </div>
        </div>

        {task.description && (
          <div className="mb-4">
            <p className="text-[12px] text-warm-text leading-relaxed">{task.description}</p>
          </div>
        )}

        {(task.status === 'running' || task.status === 'reviewing' || task.status === 'done') && (
          <div className="mb-4 p-3 bg-warm-log-bg border border-warm-border rounded-lg">
            <h4 className="text-[10px] font-bold text-warm-brown mb-2 inline-flex items-center gap-0.5"><Icon name="activity" size={12} /> 状态</h4>
            <div className="text-[11px] text-warm-text space-y-0.5">
              <p>轮次: {task.current_turn}/{task.max_turns}</p>
              <p>费用: ${(task.total_cost_usd || 0).toFixed(2)}</p>
              {task.session_id && <p>会话: {task.session_id.slice(0, 8)}...</p>}
            </div>
          </div>
        )}

        {task.status === 'reviewing' && task.summary && (
          <div className="mb-4">
            <h4 className="text-[10px] font-bold text-warm-brown mb-1 inline-flex items-center gap-0.5"><Icon name="clipboard" size={12} /> 摘要</h4>
            <p className="text-[12px] text-warm-text leading-relaxed">{task.summary}</p>
          </div>
        )}

        <ActionBar task={task} {...actions} onReject={handleRejectClick} />

        {showInlineFeedback && (
          <div className="mt-3 p-3 border border-warm-border rounded-lg bg-warm-log-bg">
            <label className="block text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">修改意见</label>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="告诉 Claude 哪里需要改..."
              rows={3}
              autoFocus
              className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={handleCancelFeedback}
                className="px-4 py-1.5 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
                disabled={submitting}
              >
                取消
              </button>
              <button
                onClick={handleSendFeedback}
                className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold"
                disabled={submitting || !feedbackText.trim()}
              >
                发送
              </button>
            </div>
          </div>
        )}

        <LogPreview lines={logs} onViewFull={actions.onViewLogs} />
      </div>
    </div>
  );
}
