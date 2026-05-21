import type { ChatMessage } from '../App';
import { Icon } from './Icon';

interface Props {
  message: ChatMessage;
  onDecisionClick: (msg: ChatMessage, answer: string) => void;
  onApprove: (msg: ChatMessage) => void;
  onReject: (msg: ChatMessage) => void;
  onQuoteReply: (msg: ChatMessage) => void;
}

function QuoteReplyButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      className={`absolute ${side === 'left' ? '-left-2' : '-right-1.5'} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 active:opacity-100 transition-opacity bg-white border border-warm-border rounded-full p-0.5 shadow-sm`}
      onClick={onClick}
      title="引用回复"
    >
      <Icon name="corner-down-left" size={12} className="text-warm-text-secondary" />
    </button>
  );
}

export function ChatBubble({ message, onDecisionClick, onApprove, onReject, onQuoteReply }: Props) {
  const { type, projectName, content, round } = message;

  if (type === 'system') {
    return (
      <div className="text-center text-[10px] text-warm-text-secondary py-1">
        {content}
      </div>
    );
  }

  if (type === 'user_message') {
    return (
      <div className="flex justify-end px-3">
        <div className="group relative bg-warm-brown text-white px-3 py-2 rounded-xl rounded-br-sm max-w-[75%] text-[13px] leading-relaxed">
          {message.quoteMessageId && (
            <div className="text-[10px] opacity-60 mb-1 border-l-2 border-white/30 pl-2">
              {content.startsWith('↩ ') ? content.split('\n')[0] : '↩ 引用回复'}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">
            {message.quoteMessageId ? content.split('\n').slice(1).join('\n') || content : content}
          </div>
          <QuoteReplyButton side="left" onClick={() => onQuoteReply(message)} />
        </div>
      </div>
    );
  }

  // AI bubble (execution, decision, or review)
  const isDecision = type === 'ai_decision';
  const isReview = type === 'ai_review';

  let borderStyle = 'border-warm-border';
  let statusBadge: string | null = null;
  if (type === 'ai_execution') {
    borderStyle = 'border-warm-border';
    statusBadge = '执行中';
  } else if (isDecision) {
    borderStyle = 'border-warm-brown';
    statusBadge = '需决策';
  } else if (isReview) {
    borderStyle = 'border-green-300 bg-green-50';
    statusBadge = null;
  }

  const label = round > 0 ? `${projectName} · 继续执行` : projectName;

  return (
    <div className="flex justify-start px-3">
      <div className={`group relative border ${borderStyle} ${!isReview ? 'bg-white' : ''} px-3 py-2.5 rounded-xl rounded-bl-sm max-w-[75%] text-[13px] leading-relaxed shadow-sm`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-semibold text-[11px] text-warm-brown">🤖 {label}</span>
          {statusBadge && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
              isDecision ? 'bg-warm-brown/10 text-warm-brown' : 'bg-amber-50 text-amber-700'
            }`}>
              {statusBadge}
            </span>
          )}
        </div>

        {/* Streaming / execution content */}
        {(type === 'ai_execution' && content) && (
          <div className="font-mono text-[10px] text-warm-text-secondary leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto bg-gray-50 rounded p-1.5">
            {content}
          </div>
        )}

        {/* Decision content */}
        {isDecision && (
          <>
            <div className="mb-2 whitespace-pre-wrap">{content}</div>
            {message.decision?.options && message.decision.options.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {message.decision.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => onDecisionClick(message, opt.label)}
                    className="px-3 py-1.5 bg-warm-brown text-white rounded-md text-[11px] hover:bg-warm-brown/90 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => onDecisionClick(message, '__custom__')}
                  className="px-3 py-1.5 border border-dashed border-warm-border rounded-md text-[11px] text-warm-text-secondary hover:bg-gray-50 transition-colors"
                >
                  ✍️ 自定义
                </button>
              </div>
            )}
          </>
        )}

        {/* Review content */}
        {isReview && (
          <>
            <div className="mb-2 whitespace-pre-wrap text-green-900">{content}</div>
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(message)}
                className="px-4 py-1.5 bg-green-500 text-white rounded-md text-[11px] hover:bg-green-600 transition-colors"
              >
                ✅ 批准完成
              </button>
              <button
                onClick={() => onReject(message)}
                className="px-4 py-1.5 border border-warm-border rounded-md text-[11px] text-warm-text-secondary hover:bg-gray-50 transition-colors"
              >
                ↩ 驳回修改
              </button>
            </div>
          </>
        )}

        <QuoteReplyButton side="right" onClick={() => onQuoteReply(message)} />
      </div>
    </div>
  );
}
