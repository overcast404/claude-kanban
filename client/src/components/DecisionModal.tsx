import { useState, useEffect } from 'react';
import type { Task, Decision } from '../../../src/types';
import { getTaskWithDecision, submitDecision } from '../api';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface Props {
  task: Task;
  onClose: () => void;
  onResolved: () => void;
}

export function DecisionModal({ task, onClose, onResolved }: Props) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getTaskWithDecision(task.id).then(data => {
      setDecision(data.pendingDecision);
      if (data.pendingDecision?.options) {
        const opts = typeof data.pendingDecision.options === 'string'
          ? JSON.parse(data.pendingDecision.options)
          : data.pendingDecision.options;
        data.pendingDecision.options = opts;
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [task.id]);

  const handleSubmit = async () => {
    const answer = selectedOption === 'other' ? otherText.trim() : selectedOption;
    if (!answer) return;
    setSubmitting(true);
    try {
      await submitDecision(task.id, answer);
      onResolved();
    } catch (e) {
      alert('提交失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <div className="bg-warm-card border border-warm-border rounded-xl p-6">
          <p className="text-sm text-warm-text-secondary">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <Modal title={`待决策 — ${task.title}`} onClose={onClose} wide>
      {decision && (
        <>
          {decision.context && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">Claude 的输出上下文</div>
              <div className="bg-warm-log-bg border border-warm-border rounded-lg p-3 max-h-[180px] overflow-y-auto text-[12px] text-warm-text leading-relaxed">
                {decision.context.split('\n').map((line, i) => (
                  <p key={i}>{line || ' '}</p>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">Claude 的问题</div>
            <div className="bg-warm-bg border border-warm-tan rounded-lg p-3 text-[13px] text-warm-text font-medium">
              {decision.question}
            </div>
          </div>
        </>
      )}

      <div>
        <div className="text-[10px] font-semibold text-warm-text-secondary uppercase mb-1.5">你的回答</div>
        {(decision?.options || []).map((opt: { label: string; description?: string }, i: number) => (
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
              {String.fromCharCode(65 + i)} · {opt.label}
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
          <div className="text-[12px] font-semibold text-warm-text inline-flex items-center gap-1"><Icon name="edit" size={14} /> 自定义回答</div>
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

      <div className="flex justify-end gap-2 pt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
          disabled={submitting}
        >
          稍后处理
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold"
          disabled={submitting || !selectedOption || (selectedOption === 'other' && !otherText.trim())}
        >
          提交回答并继续执行
        </button>
      </div>
    </Modal>
  );
}
