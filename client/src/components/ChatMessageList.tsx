import { useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../App';
import { ChatBubble } from './ChatBubble';

interface Props {
  messages: ChatMessage[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onDecisionClick: (msg: ChatMessage, answer: string) => void;
  onApprove: (msg: ChatMessage) => void;
  onReject: (msg: ChatMessage) => void;
  onQuoteReply: (msg: ChatMessage) => void;
  onThreadOpen: (taskId: string) => void;
}

export function ChatMessageList({ messages, hasMore, loadingMore, onLoadMore, onDecisionClick, onApprove, onReject, onQuoteReply, onThreadOpen }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      // Initial load — scroll to bottom (newest messages)
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      mountedRef.current = true;
    } else {
      // New message arrived — smooth scroll
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 50) {
      onLoadMore();
    }
  }, [loadingMore, hasMore, onLoadMore]);

  const getQuotedMessage = (id: string) => messages.find(m => m.id === id);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-warm-text-secondary">
          <div className="text-3xl mb-3">💬</div>
          <div className="text-[13px] font-medium mb-1">欢迎来到群聊</div>
          <div className="text-[11px]">
            输入 <code className="bg-gray-100 px-1 rounded">@项目名 任务描述</code> 开始
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-3 flex flex-col gap-2 bg-gray-50/50">
      {loadingMore && (
        <div className="text-center text-[10px] text-warm-text-secondary py-1">加载中...</div>
      )}
      {messages.map(msg => (
        <ChatBubble
          key={msg.id}
          message={msg}
          getQuotedMessage={getQuotedMessage}
          onDecisionClick={onDecisionClick}
          onApprove={onApprove}
          onReject={onReject}
          onQuoteReply={onQuoteReply}
          onThreadOpen={onThreadOpen}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
