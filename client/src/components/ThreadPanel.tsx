import type { ChatMessage } from '../App';
import { Icon } from './Icon';
import MarkdownContent from './MarkdownContent';

interface Props {
  taskId: string;
  taskTitle: string;
  messages: ChatMessage[];
  onClose: () => void;
}

export function ThreadPanel({ taskId, taskTitle, messages, onClose }: Props) {
  const threadMessages = messages.filter(m => m.taskId === taskId);

  return (
    <div className="w-[340px] shrink-0 border-l border-warm-border bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-warm-border">
        <Icon name="message-circle" size={14} className="text-warm-text-secondary" />
        <span className="flex-1 text-[12px] font-semibold text-warm-brown truncate">
          {taskTitle || '任务对话'}
        </span>
        <button
          onClick={() => onClose?.()}
          className="hover:bg-gray-100 rounded p-0.5 transition-colors"
        >
          <Icon name="x" size={14} className="text-warm-text-secondary" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-1.5 bg-gray-50/50">
        {threadMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[12px] text-warm-text-secondary">
            暂无消息
          </div>
        ) : (
          threadMessages.map(msg => {
            const isUser = msg.type === 'user_message';
            const isSystem = msg.type === 'system';
            const isReview = msg.type === 'ai_review';

            if (isSystem) {
              return (
                <div key={msg.id} className="text-center text-[10px] text-warm-text-secondary py-0.5">
                  {msg.content}
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex px-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed ${
                  isUser
                    ? 'bg-warm-brown text-white rounded-br-sm'
                    : isReview
                      ? 'border border-emerald-300 rounded-bl-sm'
                      : 'bg-white border border-warm-border rounded-bl-sm'
                }`}>
                  {/* Quote reference */}
                  {msg.quoteMessageId && (
                    <div className="text-[9px] opacity-50 mb-0.5 border-l-2 pl-1.5 truncate" style={{ borderColor: isUser ? 'rgba(255,255,255,0.4)' : 'var(--color-warm-border)' }}>
                      {msg.content.startsWith('↩ ') ? msg.content.split('\n')[0] : '↩ 回复'}
                    </div>
                  )}
                  {/* Show markdown for AI messages, plain text for user */}
                  {isUser ? (
                    <div className="whitespace-pre-wrap break-words">
                      {msg.content.startsWith('↩ ')
                        ? msg.content.split('\n').slice(1).join('\n') || msg.content
                        : msg.content}
                    </div>
                  ) : (
                    <MarkdownContent>{msg.content}</MarkdownContent>
                  )}
                  {/* Status badge for AI messages */}
                  {!isUser && (
                    <div className="text-[9px] text-warm-text-secondary mt-0.5">
                      {msg.type === 'ai_execution' ? '执行中' : msg.type === 'ai_decision' ? '需决策' : msg.type === 'ai_review' ? '已完成' : ''}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
