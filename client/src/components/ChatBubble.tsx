import { useState } from 'react';
import type { ChatMessage } from '../App';
import { Icon } from './Icon';
import MarkdownContent from './MarkdownContent';

interface Props {
  message: ChatMessage;
  getQuotedMessage: (id: string) => ChatMessage | undefined;
  onDecisionClick: (msg: ChatMessage, answer: string) => void;
  onApprove: (msg: ChatMessage) => void;
  onReject: (msg: ChatMessage) => void;
  onQuoteReply: (msg: ChatMessage) => void;
  onThreadOpen: (taskId: string) => void;
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

function QuoteRef({ text, onClick }: { text: string; onClick?: () => void }) {
  return (
    <div
      className={`text-[10px] text-warm-text-secondary mb-1.5 border-l-2 border-warm-border pl-2 truncate max-w-[180px] ${onClick ? 'cursor-pointer hover:text-warm-brown hover:border-warm-brown transition-colors' : ''}`}
      onClick={onClick}
      title={onClick ? '点击查看完整对话' : undefined}
    >
      ↩ {text}
    </div>
  );
}

export function ChatBubble({ message, getQuotedMessage, onDecisionClick, onApprove, onReject, onQuoteReply, onThreadOpen }: Props) {
  const { type, projectName, content, round } = message;
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');

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
    statusBadge = '执行中';
  } else if (isDecision) {
    borderStyle = 'border-warm-brown';
    statusBadge = '需决策';
  } else if (isReview) {
    borderStyle = 'border-amber-400';
    statusBadge = null;
  }

  const label = round > 0 ? `${projectName} · 继续执行` : projectName;

  // Get the quoted message text — show the last line (actual reply), single line only
  const quotedMsg = message.quoteMessageId ? getQuotedMessage(message.quoteMessageId) : undefined;
  const quoteText = quotedMsg
    ? (() => { const lines = quotedMsg.content.split('\n'); const last = lines[lines.length - 1] || lines[0]; return last.slice(0, 20) + (last.length > 20 ? '...' : ''); })()
    : '';

  return (
    <div className="flex justify-start px-3">
      <div className={`group relative border ${borderStyle} ${!isReview ? 'bg-white' : ''} px-3 py-2.5 rounded-xl rounded-bl-sm max-w-[75%] text-[13px] leading-relaxed shadow-sm`}>
        {/* Quote reference with real text, clickable to open thread */}
        {quoteText && (
          <QuoteRef text={quoteText} onClick={() => onThreadOpen(message.taskId)} />
        )}

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
        {isDecision && (() => {
          const resolved = !!message.decision?.answer;
          return (
            <>
              <div className="mb-2"><MarkdownContent>{content}</MarkdownContent></div>
              {message.decision?.options && Array.isArray(message.decision.options) && message.decision.options.length > 0 && (
                <div className="space-y-1">
                  {message.decision.options.map((opt, i) => {
                    const isChosen = resolved && opt.label === message.decision!.answer;
                    return (
                      <button
                        key={i}
                        disabled={resolved}
                        onClick={() => onDecisionClick(message, opt.label)}
                        className={`w-full text-left p-2 border rounded-lg transition-colors ${
                          isChosen
                            ? 'border-warm-brown bg-warm-brown/5'
                            : resolved
                              ? 'border-gray-100 bg-gray-50 opacity-50'
                              : 'border-warm-border bg-white hover:border-warm-brown'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isChosen && <Icon name="check-circle" size={12} className="text-warm-brown shrink-0" />}
                          <span className={`text-[11px] font-semibold ${isChosen ? 'text-warm-brown' : 'text-warm-text'}`}>
                            {String.fromCharCode(65 + i)} · {opt.label}
                          </span>
                        </div>
                        {opt.description && (
                          <div className="text-[10px] text-warm-text-secondary mt-0.5 leading-relaxed">{opt.description}</div>
                        )}
                      </button>
                    );
                  })}
                  {/* Custom answer: inline editing (hidden when resolved) */}
                  {resolved ? (
                    message.decision!.answer && !message.decision!.options?.some(o => o.label === message.decision!.answer) ? (
                      <div className="w-full text-left p-2 border border-warm-brown bg-warm-brown/5 rounded-lg">
                        <div className="flex items-center gap-1.5">
                          <Icon name="check-circle" size={12} className="text-warm-brown shrink-0" />
                          <span className="text-[11px] font-semibold text-warm-brown">{message.decision!.answer}</span>
                        </div>
                      </div>
                    ) : null
                  ) : customOpen ? (
                    <div className="flex gap-1.5 pt-1">
                      <input
                        autoFocus
                        value={customText}
                        onChange={e => setCustomText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && customText.trim()) {
                            onDecisionClick(message, customText.trim());
                          }
                          if (e.key === 'Escape') { setCustomOpen(false); setCustomText(''); }
                        }}
                        placeholder="输入你的回答..."
                        className="flex-1 px-2 py-1.5 border border-warm-border rounded-md text-[11px] outline-none focus:border-warm-brown"
                      />
                      <button
                        onClick={() => { if (customText.trim()) onDecisionClick(message, customText.trim()); }}
                        disabled={!customText.trim()}
                        className="px-3 py-1.5 bg-warm-brown text-white rounded-md text-[11px] disabled:opacity-40 hover:bg-warm-brown/90 transition-colors"
                      >
                        发送
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCustomOpen(true)}
                      className="w-full text-left p-2 border border-dashed border-warm-border rounded-lg hover:border-warm-brown transition-colors"
                    >
                      <div className="text-[11px] text-warm-text-secondary">✍️ 其他想法...</div>
                    </button>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {/* Review content */}
        {isReview && (
          <>
            <div className="mb-2"><MarkdownContent>{content}</MarkdownContent></div>
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(message)}
                className="px-4 py-1.5 bg-warm-brown text-white rounded-md text-[11px] hover:bg-warm-brown/90 transition-colors"
              >
                完成
              </button>
              <button
                onClick={() => onQuoteReply(message)}
                className="px-4 py-1.5 border border-warm-border rounded-md text-[11px] text-warm-text-secondary hover:bg-gray-50 transition-colors"
              >
                💬 回复
              </button>
            </div>
          </>
        )}

        <QuoteReplyButton side="right" onClick={() => onQuoteReply(message)} />
      </div>
    </div>
  );
}
