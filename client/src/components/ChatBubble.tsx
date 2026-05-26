import { useState } from 'react';
import type { ChatMessage } from '../App';
import { Icon } from './Icon';
import MarkdownContent from './MarkdownContent';

interface Props {
  message: ChatMessage;
  getQuotedMessage: (id: string) => ChatMessage | undefined;
  isTaskRunning: boolean;
  isTaskStopped: boolean;
  isTaskDone: boolean;
  isTaskReviewing: boolean;
  isLatestReview: boolean;
  isLatestExecution: boolean;
  worktree?: string | null;
  onDecisionClick: (msg: ChatMessage, answer: string) => void;
  onApprove: (msg: ChatMessage) => void;
  onReject: (msg: ChatMessage) => void;
  onStopTask: (msg: ChatMessage) => void;
  onQuoteReply: (msg: ChatMessage) => void;
  onRewind: (msg: ChatMessage) => void;
  onFork: (msg: ChatMessage, mode: 'fork' | 'fork-rewind') => void;
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
      className={`text-[10px] text-warm-text-secondary mb-1.5 border-l-2 border-warm-border pl-2 overflow-hidden text-ellipsis whitespace-nowrap ${onClick ? 'cursor-pointer hover:text-warm-brown hover:border-warm-brown transition-colors' : ''}`}
      onClick={onClick}
      title={onClick ? '点击查看完整对话' : undefined}
    >
      ↩ {text}
    </div>
  );
}

function ForkMenu({ onRewind, onFork, isDone }: { onRewind: () => void; onFork: (mode: 'fork' | 'fork-rewind') => void; isDone: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        className="text-warm-text-secondary hover:text-warm-brown transition-colors p-0.5 rounded"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="分叉/回退"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="4" cy="12" r="1.5"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 bg-white border border-warm-border rounded-lg shadow-lg z-20 w-44 py-1 text-warm-text">
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-warm-text hover:bg-warm-bg hover:text-warm-brown flex items-center gap-2"
            onClick={() => { setOpen(false); onFork('fork'); }}
          >
            <Icon name="git-branch" size={12} className="shrink-0" />
            <span className="truncate">分叉对话</span>
          </button>
          {!isDone && (
            <button
              className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-warm-text hover:bg-warm-bg hover:text-warm-brown flex items-center gap-2"
              onClick={() => { setOpen(false); onRewind(); }}
            >
              <Icon name="arrow-left" size={12} className="shrink-0" />
              <span className="truncate">回退代码</span>
            </button>
          )}
          {!isDone && (
            <button
              className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-warm-text hover:bg-warm-bg hover:text-warm-brown flex items-center gap-2"
              onClick={() => { setOpen(false); onFork('fork-rewind'); }}
            >
              <Icon name="git-branch" size={12} className="shrink-0" />
              <span className="truncate">分叉并回退</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatBubble({ message, getQuotedMessage, isTaskRunning, isTaskStopped, isTaskDone, isTaskReviewing, isLatestReview, isLatestExecution, worktree, onDecisionClick, onApprove, onReject, onStopTask, onQuoteReply, onRewind, onFork, onThreadOpen }: Props) {
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
    const userQuotedMsg = message.quoteMessageId ? getQuotedMessage(message.quoteMessageId) : undefined;
    const userQuoteText = userQuotedMsg
      ? (() => { const c = userQuotedMsg.content.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim(); return c.slice(0, 30) + (c.length > 30 ? '...' : ''); })()
      : '';
    return (
      <div className="flex justify-end pl-3 pr-8">
        <div className="group relative bg-warm-brown text-white px-3 py-2 rounded-xl rounded-br-sm max-w-[75%] min-w-0 text-[13px] leading-relaxed">
          {userQuoteText && (
            <div className="text-[10px] opacity-60 mb-1 border-l-2 border-white/30 pl-2 overflow-hidden text-ellipsis whitespace-nowrap">
              ↩ {userQuoteText}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">{content}</div>
          <QuoteReplyButton side="left" onClick={() => onQuoteReply(message)} />
          <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 translate-x-full opacity-0 group-hover:opacity-100 transition-opacity">
            <ForkMenu
              onRewind={() => onRewind(message)}
              onFork={(mode) => onFork(message, mode)}
              isDone={isTaskDone}
            />
          </div>
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
    if (isLatestExecution && isTaskStopped) {
      borderStyle = 'border-amber-400';
      statusBadge = '已停止';
    } else if (isLatestExecution && isTaskRunning) {
      statusBadge = '执行中';
    }
  } else if (isDecision) {
    borderStyle = 'border-warm-brown';
    statusBadge = '需决策';
  } else if (isReview) {
    borderStyle = 'border-amber-400';
    statusBadge = null;
  }

  const label = round > 0 ? `${projectName} · 继续执行` : projectName;

  // Get the quoted message text — single line, clean, truncated
  const quotedMsg = message.quoteMessageId ? getQuotedMessage(message.quoteMessageId) : undefined;
  const quoteText = quotedMsg
    ? (() => {
        const clean = quotedMsg.content.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        return clean.slice(0, 20) + (clean.length > 20 ? '...' : '');
      })()
    : '';
  const showReviewActions = isReview && isLatestReview && (isTaskDone || isTaskReviewing);

  return (
    <div className="flex justify-start px-3">
      <div className={`group relative border ${borderStyle} ${!isReview ? 'bg-white' : ''} px-3 py-2.5 rounded-xl rounded-bl-sm max-w-[75%] min-w-0 text-[13px] leading-relaxed shadow-sm`}>
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
          {worktree !== undefined && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-warm-text-secondary inline-flex items-center gap-0.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M18 9a9 9 0 0 1-9 9"/></svg>
              {worktree || '本地'}
            </span>
          )}
        </div>

        {/* Streaming / execution content */}
        {(type === 'ai_execution' && content) && (
          <div className="font-mono text-[10px] text-warm-text-secondary leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto bg-gray-50 rounded p-1.5">
            {content}
          </div>
        )}

        {type === 'ai_execution' && isLatestExecution && (isTaskRunning || isTaskStopped) && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-1.5">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] text-warm-text-secondary opacity-70">
              <span className={`h-1 w-1 rounded-full shrink-0 ${isTaskRunning ? 'bg-emerald-500' : 'bg-warm-tan'}`} />
              {isTaskRunning ? '任务执行中' : '任务已暂停'}
            </span>
            {isTaskRunning && (
              <button
                type="button"
                title="停止任务"
                aria-label="停止任务"
                onClick={() => onStopTask(message)}
                className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-[10px] font-medium text-warm-text-secondary opacity-70 transition-colors duration-200 hover:bg-warm-danger-bg hover:text-warm-danger hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-100"
              >
                <Icon name="square" size={10} />
                停止
              </button>
            )}
            {isTaskStopped && (
              <button
                type="button"
                title="回复继续"
                aria-label="回复继续"
                onClick={() => onQuoteReply(message)}
                className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-[10px] font-medium text-warm-brown opacity-80 transition-colors duration-200 hover:bg-warm-brown/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan"
              >
                <Icon name="corner-down-left" size={10} />
                回复继续
              </button>
            )}
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
            {showReviewActions && (
              <div className="flex gap-2">
                {isTaskDone ? (
                  <>
                    <span className="px-4 py-1.5 bg-gray-200 text-warm-text-secondary rounded-md text-[11px] inline-flex items-center gap-1 cursor-default">
                      <Icon name="check-circle" size={12} />
                      已完成
                    </span>
                    <button
                      onClick={() => onQuoteReply(message)}
                      className="px-4 py-1.5 border border-warm-border rounded-md text-[11px] text-warm-text-secondary hover:bg-gray-50 transition-colors"
                    >
                      💬 回复
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Hide floating reply button on historical review bubbles that have no actions */}
        {(!isReview || showReviewActions) && (
          <QuoteReplyButton side="right" onClick={() => onQuoteReply(message)} />
        )}
      </div>
    </div>
  );
}
