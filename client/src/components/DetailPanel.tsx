import { useState, useEffect } from 'react';
import type { Task, Decision } from '../../../src/types';
import { STATUS_LABEL, STATUS_ICON } from '../status';
import { rejectTask, getTaskWithDecision, submitDecision } from '../api';
import { ActionBar } from './ActionBar';
import { LogPreview } from './LogPreview';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

interface Props {
  task: Task | null;
  projectName: string;
  logs: { stream: string; text: string }[];
  isMobile?: boolean;
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDecisionResolved: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRejectSubmitted: () => void;
  onViewLogs: () => void;
  onClose: () => void;
}

export function DetailPanel({ task, projectName, logs, isMobile, onClose, onReject, onRejectSubmitted, onDecisionResolved, ...actions }: Props) {
  const [showInlineFeedback, setShowInlineFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  useEffect(() => {
    if (task?.status === 'deciding') {
      setDecisionLoading(true);
      setDecision(null);
      setSelectedOption(null);
      setOtherText('');
      getTaskWithDecision(task.id).then(data => {
        if (data.pendingDecision?.options && typeof data.pendingDecision.options === 'string') {
          data.pendingDecision.options = JSON.parse(data.pendingDecision.options);
        }
        setDecision(data.pendingDecision);
        setDecisionLoading(false);
      }).catch(() => setDecisionLoading(false));
    } else {
      setDecision(null);
      setDecisionLoading(false);
    }
  }, [task?.id, task?.status]);

  const handleDecisionSubmit = async () => {
    if (!task) return;
    const answer = selectedOption === 'other' ? otherText.trim() : selectedOption;
    if (!answer) return;
    setDecisionSubmitting(true);
    try {
      await submitDecision(task.id, answer);
      onDecisionResolved();
    } catch (e) {
      alert('提交失败: ' + (e as Error).message);
    } finally {
      setDecisionSubmitting(false);
    }
  };

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
    if (isMobile) return null;
    return (
      <div className="h-full border-l border-warm-border bg-warm-card flex items-center justify-center">
        <EmptyState icon="arrow-left" message="选择一个任务查看详情" />
      </div>
    );
  }

  const body = (
    <div className="overflow-y-auto">
      <div className="p-4">
        {isMobile && (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-warm-brown text-sm font-medium mb-3"
          >
            <Icon name="arrow-left" size={18} /> 返回
          </button>
        )}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[15px] font-bold text-warm-text mb-1">{task.title}</h2>
            {!isMobile && (
              <button
                onClick={onClose}
                className="text-warm-text-secondary hover:text-warm-text p-0.5 rounded shrink-0"
                title="关闭详情"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-warm-text-secondary">
            <span className="inline-flex items-center gap-0.5"><Icon name="folder" size={12} /> {projectName}</span>
            <span className="inline-flex items-center gap-0.5"><Icon name={STATUS_ICON[task.status]} size={13} /> {STATUS_LABEL[task.status]}</span>
          </div>
        </div>

        {task.description && (
          <div className="mb-4">
            <p className="text-[12px] text-warm-text leading-relaxed">{task.description}</p>
          </div>
        )}


        {task.status === 'reviewing' && task.summary && (
          <div className="mb-4">
            <h4 className="text-[10px] font-bold text-warm-brown mb-1 inline-flex items-center gap-0.5"><Icon name="clipboard" size={12} /> 摘要</h4>
            <p className="text-[12px] text-warm-text leading-relaxed">{task.summary}</p>
          </div>
        )}

        {task.status !== 'deciding' && (
          <ActionBar task={task} {...actions} onReject={handleRejectClick} />
        )}

        {task.status === 'deciding' && decisionLoading && (
          <div className="mb-4 p-4 border border-warm-border rounded-lg bg-warm-bg">
            <p className="text-sm text-warm-text-secondary">加载决策内容...</p>
          </div>
        )}

        {task.status === 'deciding' && decision && !decisionLoading && (
          <div className="mb-4 space-y-3">
            {decision.context && (
              <div>
                <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">Claude 的输出上下文</div>
                <div className="bg-warm-log-bg border border-warm-border rounded-lg p-3 max-h-[180px] overflow-y-auto text-[12px] text-warm-text leading-relaxed">
                  {decision.context.split('\n').map((line, i) => (
                    <p key={i}>{line || ' '}</p>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">Claude 的问题</div>
              <div className="bg-warm-bg border border-warm-tan rounded-lg p-3 text-[13px] text-warm-text font-medium">
                {decision.question}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">你的回答</div>
              {(decision.options || []).map((opt: { label: string; description?: string }, i: number) => (
                <div
                  key={i}
                  onClick={() => setSelectedOption(opt.label)}
                  className={`p-2.5 border rounded-lg mb-1.5 cursor-pointer transition-colors ${
                    selectedOption === opt.label
                      ? 'border-warm-brown bg-warm-bg'
                      : 'border-warm-border hover:border-warm-tan'
                  }`}
                >
                  <div className="text-[12px] font-semibold text-warm-text">
                    {String.fromCharCode(65 + i)} &middot; {opt.label}
                  </div>
                  {opt.description && (
                    <div className="text-[11px] text-warm-text-secondary mt-0.5">{opt.description}</div>
                  )}
                </div>
              ))}

              <div
                onClick={() => setSelectedOption('other')}
                className={`p-2.5 border rounded-lg mb-1.5 cursor-pointer transition-colors border-dashed ${
                  selectedOption === 'other'
                    ? 'border-warm-brown bg-warm-bg'
                    : 'border-warm-border hover:border-warm-tan'
                }`}
              >
                <div className="text-[12px] font-semibold text-warm-text inline-flex items-center gap-1">
                  <Icon name="edit" size={14} /> 自定义回答
                </div>
                {selectedOption === 'other' && (
                  <textarea
                    value={otherText}
                    onChange={e => setOtherText(e.target.value)}
                    placeholder="输入你的回答..."
                    rows={3}
                    className="w-full mt-2 p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleDecisionSubmit}
                className="px-4 py-1.5 bg-warm-brown text-white rounded-lg text-xs font-bold hover:bg-warm-brown-hover transition-colors disabled:opacity-50"
                disabled={decisionSubmitting || !selectedOption || (selectedOption === 'other' && !otherText.trim())}
              >
                提交回答并继续执行
              </button>
            </div>
          </div>
        )}

        {task.status === 'deciding' && !decision && !decisionLoading && (
          <div className="mb-4 p-4 border border-warm-border rounded-lg bg-warm-bg">
            <p className="text-sm text-warm-text-secondary">暂无待处理的决策</p>
          </div>
        )}

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

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-30 bg-warm-card overflow-y-auto">
        {body}
      </div>
    );
  }

  return (
    <div className="h-full border-l border-warm-border bg-warm-card overflow-y-auto">
      {body}
    </div>
  );
}
