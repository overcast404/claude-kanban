import { useState } from 'react';
import type { Task } from '../../../src/types';
import { approveTask, rejectTask } from '../api';
import { Modal } from './Modal';

interface Props {
  task: Task;
  onClose: () => void;
  onResolved: () => void;
}

export function ReviewModal({ task, onClose, onResolved }: Props) {
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try { await approveTask(task.id); onResolved(); }
    catch (e) { alert('操作失败: ' + (e as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    if (!feedback.trim()) return;
    setSubmitting(true);
    try { await rejectTask(task.id, feedback.trim()); onResolved(); }
    catch (e) { alert('操作失败: ' + (e as Error).message); }
    finally { setSubmitting(false); }
  };

  const isDone = task.status === 'done';

  return (
    <Modal title={`${isDone ? '🏁 已完成' : '✅ 待验收'} — ${task.title}`} onClose={onClose}>
      {task.summary && (
        <div className="mb-3">
          <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">Claude 的完成摘要</div>
          <div className="bg-warm-log-bg border border-warm-border rounded-lg p-3 text-[12px] text-warm-text leading-relaxed max-h-[200px] overflow-y-auto">
            {task.summary.split('\n').map((line, i) => (
              <p key={i}>{line || ' '}</p>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-6 text-[12px] text-warm-text-secondary mb-4">
        <span>总花费: ${(task.total_cost_usd || 0).toFixed(2)}</span>
        <span>总轮次: {task.current_turn}</span>
      </div>

      {isDone ? (
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold">关闭</button>
        </div>
      ) : !showFeedback ? (
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowFeedback(true)} className="px-4 py-2 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold" disabled={submitting}>
            ↩ 回复继续
          </button>
          <button onClick={handleApprove} className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold" disabled={submitting}>
            ✓ 验收通过
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <label className="block text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">修改意见</label>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="告诉 Claude 哪里需要改..."
              rows={3}
              autoFocus
              className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFeedback(false)} className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold" disabled={submitting}>取消</button>
            <button onClick={handleReject} className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold" disabled={submitting || !feedback.trim()}>发送</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
